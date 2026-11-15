import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { blueskyAvatar } from "@/lib/bsky-profile";
import { getGuestbook } from "@/lib/guestbook/server";
import { resolveActor } from "@/lib/identity";
import { memberPageLook } from "@/lib/member-settings";
import { getMemberSettings } from "@/lib/member-settings-server";
import { isValidDateKey, photoRecordKey } from "@/lib/photo-record";
import { railWindow } from "@/lib/photos/rail";
import { fetchPhoto, listPhotos, photoNeighbors, type StoredPhoto } from "@/lib/photos/server";
import { parseActorParam } from "@/lib/photos/urls";

export const RECENT_PHOTOS = 6;

/**
 * Everything the member page needs. Without `date`, the center photo is the
 * newest one. Returns null if the actor can't be resolved, or if `date` is
 * given and has no photo. Cached per request, so metadata and the page
 * share one load.
 */
export const loadMemberPage = cache(async (actorParam: string, date?: string) => {
  const id = parseActorParam(actorParam);
  if (!id) return null;
  if (date !== undefined && !isValidDateKey(date)) return null;
  const owner = await resolveActor(id);
  if (!owner) return null;

  const [recent, dayPhoto, settings, avatar, user] = await Promise.all([
    listPhotos(owner, { limit: RECENT_PHOTOS }),
    // One photo a day for now, so the day's photo is always -01.
    date ? fetchPhoto(owner, photoRecordKey(date, 1)) : Promise.resolve(null),
    getMemberSettings(owner.did),
    blueskyAvatar(owner.did),
    getCurrentUser(),
  ]);
  if (date && !dayPhoto) return null;
  const photo = date ? dayPhoto : (recent[0] ?? null);

  let older: StoredPhoto | null = null;
  let newer: StoredPhoto | null = null;
  let rail = recent;
  if (photo && !date) {
    // The newest photo: nothing newer, and the next one in the list is older.
    older = recent[1] ?? null;
  } else if (photo) {
    // Enough on each side to fill the rail around this photo if it's older
    // than the newest few.
    const around = await photoNeighbors(owner, photo.rkey, RECENT_PHOTOS - 1);
    older = around.older[0] ?? null;
    newer = around.newer[0] ?? null;
    rail = railWindow(recent, photo, around.newer, around.older, RECENT_PHOTOS);
  }

  const guestbook = photo ? await getGuestbook(owner.did, photo.record.post.uri) : null;

  return {
    owner,
    guestbook,
    look: memberPageLook(settings, owner),
    avatar,
    photo,
    recent: rail,
    older,
    newer,
    isOwner: user?.did === owner.did,
    signedIn: user !== null,
  };
});
