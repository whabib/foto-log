import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { blueskyAvatar } from "@/lib/bsky-profile";
import { isMember, isOnList } from "@/lib/friends-server";
import { getGuestbook, mayReply, notAllowedMessage } from "@/lib/guestbook/server";
import { memberPageLook } from "@/lib/member-settings";
import { resolveMemberPage } from "@/lib/member-resolve-server";
import { getMemberImages } from "@/lib/member-profile-server";
import { getMemberSettings } from "@/lib/member-settings-server";
import { isValidDateKey, photoRecordKey } from "@/lib/photo-record";
import { railWindow } from "@/lib/photos/rail";
import { fetchPhoto, listPhotos, photoNeighbors, type StoredPhoto } from "@/lib/photos/server";

export const RECENT_PHOTOS = 6;

/**
 * Everything the member page needs. Without `date`, the center photo is the
 * newest one. Returns null if the actor can't be resolved, or if `date` is
 * given and has no photo. Cached per request, so metadata and the page
 * share one load.
 */
export const loadMemberPage = cache(async (actorParam: string, date?: string) => {
  if (date !== undefined && !isValidDateKey(date)) return null;
  const owner = await resolveMemberPage(actorParam, date ? `/${date}` : "");
  if (!owner) return null;

  const [recent, dayPhoto, settings, avatar, user, images] = await Promise.all([
    listPhotos(owner, { limit: RECENT_PHOTOS }),
    // One photo a day for now, so the day's photo is always -01.
    date ? fetchPhoto(owner, photoRecordKey(date, 1)) : Promise.resolve(null),
    getMemberSettings(owner.did),
    blueskyAvatar(owner.did),
    getCurrentUser(),
    getMemberImages(owner),
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

  // Other members' pages offer to add them to, or remove them from, the viewer's list.
  const onList = user && user.did !== owner.did ? isOnList(user.did, owner.did) : null;
  // Only members can be added; anyone else gets an invite instead.
  const ownerIsMember = onList ? isMember(owner.did) : null;
  const guestbook = photo ? await getGuestbook(owner.did, photo.record.post.uri) : null;
  // Why the viewer can't sign an open guestbook, if they can't.
  const signBlocked =
    guestbook && user && !guestbook.closed && !(await mayReply(guestbook, owner.did, user.did))
      ? notAllowedMessage(guestbook)
      : null;

  const onViewerList = onList ? await onList : null;
  const canAdd = ownerIsMember ? await ownerIsMember : false;

  return {
    owner,
    onViewerList,
    canAdd,
    guestbook,
    look: memberPageLook(settings, owner),
    images,
    avatar,
    photo,
    recent: rail,
    older,
    newer,
    isOwner: user?.did === owner.did,
    signedIn: user !== null,
    signBlocked,
  };
});
