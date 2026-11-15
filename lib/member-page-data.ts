import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { blueskyAvatar } from "@/lib/bsky-profile";
import { resolveActor } from "@/lib/identity";
import { memberPageLook } from "@/lib/member-settings";
import { getMemberSettings } from "@/lib/member-settings-server";
import { isValidDateKey, photoRecordKey } from "@/lib/photo-record";
import { fetchPhoto, listPhotos, photoNeighbors } from "@/lib/photos/server";
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

  let older = null;
  let newer = null;
  if (photo) {
    if (!date) {
      // The newest photo: nothing newer, and the next one in the list is older.
      older = recent[1] ?? null;
    } else {
      ({ older, newer } = await photoNeighbors(owner, photo.rkey));
    }
  }

  return {
    owner,
    look: memberPageLook(settings, owner),
    avatar,
    photo,
    recent,
    older,
    newer,
    isOwner: user?.did === owner.did,
    signedIn: user !== null,
  };
});
