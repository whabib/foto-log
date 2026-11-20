import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { blueskyProfile } from "@/lib/bsky-profile";
import { primaryNames } from "@/lib/fotolog-name-server";
import { isMember, isOnList } from "@/lib/friends-server";
import type { Guestbook } from "@/lib/guestbook/entries";
import { getGuestbook, mayReply, notAllowedMessage } from "@/lib/guestbook/server";
import { memberPageLook } from "@/lib/member-settings";
import { resolveMemberPage } from "@/lib/member-resolve-server";
import { getMemberImages } from "@/lib/member-profile-server";
import { getMemberSettings } from "@/lib/member-settings-server";
import { getGroup, isGroupPostBy, memberCount, membership, type Group, type MembershipStatus } from "@/lib/groups-server";
import { resolveActor } from "@/lib/identity";
import { isValidDateKey, parsePhotoRecordKey, photoRecordKey } from "@/lib/photo-record";
import { railWindow } from "@/lib/photos/rail";
import { fetchPhoto, listPhotos, photoNeighbors, type StoredPhoto } from "@/lib/photos/server";
import type { MemberRef } from "@/lib/photos/urls";
import { log } from "@/lib/log";

export const RECENT_PHOTOS = 6;

/** The record key a photo page's segment names: a date (its first photo) or a full key. */
function keyForSegment(segment: string): string | null {
  if (isValidDateKey(segment)) return photoRecordKey(segment, 1);
  return parsePhotoRecordKey(segment) ? segment : null;
}

/** A group page's extras: the group, its size, where the viewer stands, and its Bluesky description. */
export type GroupInfo = Group & { members: number; viewer: MembershipStatus | null; description: string | null };

/**
 * Everything the member page needs. Without `date`, the center photo is the
 * newest one. `date` is a day (its first photo) or a full record key, for a
 * group's later photos of a day. Returns null if the actor can't be
 * resolved, or if `date` is given and has no photo. Cached per request, so
 * metadata and the page share one load.
 */
export const loadMemberPage = cache(async (actorParam: string, date?: string) => {
  const key = date === undefined ? null : keyForSegment(date);
  if (date !== undefined && !key) return null;
  const owner = await resolveMemberPage(actorParam, date ? `/${date}` : "");
  if (!owner) return null;

  const [recent, dayPhoto, settings, profile, user, images, group] = await Promise.all([
    listPhotos(owner, { limit: RECENT_PHOTOS }),
    key ? fetchPhoto(owner, key) : Promise.resolve(null),
    getMemberSettings(owner.did),
    blueskyProfile(owner.did),
    getCurrentUser(),
    getMemberImages(owner),
    getGroup(owner.did),
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
  const guestbook = photo ? await withAuthorNames(await getGuestbook(owner.did, photo.record.post.uri)) : null;
  // Why the viewer can't sign an open guestbook, if they can't.
  const signBlocked =
    guestbook && user && !guestbook.closed && !(await mayReply(guestbook, owner.did, user.did))
      ? notAllowedMessage(guestbook)
      : null;

  const onViewerList = onList ? await onList : null;
  const canAdd = ownerIsMember ? await ownerIsMember : false;

  const [groupInfo, uploader] = await Promise.all([
    group
      ? Promise.all([memberCount(group.did), user ? membership(group.did, user.did) : null]).then(
          ([members, viewer]): GroupInfo => ({ ...group, members, viewer, description: profile.description }),
        )
      : null,
    photo ? creditFor(owner.did, photo) : null,
  ]);

  return {
    owner,
    onViewerList,
    canAdd,
    guestbook,
    look: memberPageLook(settings, owner),
    images,
    avatar: profile.avatar,
    photo,
    recent: rail,
    older,
    newer,
    isOwner: user?.did === owner.did,
    signedIn: user !== null,
    signBlocked,
    group: groupInfo,
    uploader,
  };
});

/**
 * Who a group's photo is credited to: its uploadedBy, but only when
 * foto-log posted it for that member, since anyone writing to the group's
 * repo could put any DID there.
 */
async function creditFor(groupDid: string, photo: StoredPhoto): Promise<MemberRef | null> {
  const by = photo.record.uploadedBy;
  if (!by) return null;
  const ok = await isGroupPostBy(groupDid, photo.rkey, by).catch(() => false);
  return ok ? uploaderOf(by) : null;
}

/** Who posted a group's photo: their handle and primary name, or just their DID. */
async function uploaderOf(did: string): Promise<MemberRef> {
  try {
    const [actor, names] = await Promise.all([resolveActor(did), primaryNames([did])]);
    return { did, handle: actor?.handle ?? null, name: names.get(did) ?? null };
  } catch (err) {
    log.warn("Couldn't look up a photo's uploader", { did, err });
    return { did, handle: null };
  }
}

/** Adds each guestbook author's primary Fotolog name, without touching the cached entries. */
async function withAuthorNames(guestbook: Guestbook): Promise<Guestbook> {
  if (guestbook.entries.length === 0) return guestbook;
  const names = await primaryNames(guestbook.entries.map((e) => e.author.did)).catch((err) => {
    log.warn("Couldn't load guestbook names", { err });
    return new Map<string, string>();
  });
  if (names.size === 0) return guestbook;
  return {
    ...guestbook,
    entries: guestbook.entries.map((e) =>
      names.has(e.author.did) ? { ...e, author: { ...e.author, name: names.get(e.author.did) } } : e,
    ),
  };
}
