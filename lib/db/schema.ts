import { boolean, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";

/** In-progress OAuth authorizations. Values are encrypted; rows expire after an hour. */
export const oauthState = pgTable(
  "oauth_state",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("oauth_state_created_at_idx").on(t.createdAt)],
);

/** OAuth token sets (and DPoP keys), one per account DID. Values are encrypted. */
export const oauthSession = pgTable("oauth_session", {
  sub: text("sub").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A signed-in browser. The cookie holds a signed `id`. */
export const userSession = pgTable(
  "user_session",
  {
    id: text("id").primaryKey(),
    did: text("did").notNull(),
    handle: text("handle"),
    /** The browser this session was signed in on, so one browser can hold several accounts. */
    browserId: text("browser_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** When this account was last switched to in its browser; the most recent is next after a logout. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("user_session_did_idx").on(t.did), index("user_session_browser_idx").on(t.browserId)],
);

/** How a member's member page looks. Null columns mean the site default. */
export const memberSettings = pgTable("member_settings", {
  did: text("did").primaryKey(),
  title: text("title"),
  country: text("country"),
  region: text("region"),
  locality: text("locality"),
  backgroundColor: text("background_color"),
  textColor: text("text_color"),
  linkColor: text("link_color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Everyone who has signed in to foto-log, from their first sign-in. Tells a
 * new member's first sign-in apart from later ones.
 */
export const member = pgTable("member", {
  did: text("did").primaryKey(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  /** When the member's existing photos were last copied into photo_index; null until then. */
  backfilledAt: timestamp("backfilled_at", { withTimezone: true }),
  /** The member's verified handle as last seen, or null if unknown or invalid. */
  handle: text("handle"),
  /** The member's Fotolog name, lowercase and unique; set once, released only when they delete their foto-log. */
  fotologName: text("fotolog_name").unique(),
  /** Whether the Fotolog name, rather than the Bluesky handle, is the member's primary name. */
  showFotologName: boolean("show_fotolog_name").notNull().default(true),
});

/**
 * Every valid com.foto-log.photo record foto-log knows of, from its own
 * writes, Jetstream and backfills. A copy for listing: the record in the
 * member's repo is the source of truth.
 */
export const photoIndex = pgTable(
  "photo_index",
  {
    did: text("did").notNull(),
    rkey: text("rkey").notNull(),
    cid: text("cid").notNull(),
    imageCid: text("image_cid").notNull(),
    alt: text("alt"),
    caption: text("caption"),
    uploadDate: text("upload_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
    /** The rkey of the photo's Bluesky post in the same repo, so deleting the post can delete the photo. */
    postRkey: text("post_rkey"),
  },
  (t) => [
    primaryKey({ columns: [t.did, t.rkey] }),
    index("photo_index_did_post_rkey_idx").on(t.did, t.postRkey),
    index("photo_index_created_at_idx").on(t.createdAt),
    index("photo_index_did_created_at_idx").on(t.did, t.createdAt),
  ],
);

/**
 * Bluesky posts members deleted, seen on Jetstream. A photo that shared one
 * is deleted (or, without the member's sign-in, kept out of the index),
 * whichever arrives first: the post delete or the photo.
 */
export const deletedPost = pgTable(
  "deleted_post",
  {
    did: text("did").notNull(),
    rkey: text("rkey").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.did, t.rkey] })],
);

/** Small bits of server state, such as the Jetstream cursor. */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Accounts that have been made into groups. A group is its own Bluesky
 * account: members' photos are written to the group's repo with its stored
 * OAuth session, so a group's tokens are kept when it signs out.
 */
export const fotologGroup = pgTable("fotolog_group", {
  did: text("did").primaryKey(),
  /** "open": anyone can join. "approval": the group approves each request. */
  joinPolicy: text("join_policy").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Who belongs to which group, or has asked to. */
export const groupMember = pgTable(
  "group_member",
  {
    groupDid: text("group_did")
      .notNull()
      .references(() => fotologGroup.did, { onDelete: "cascade" }),
    memberDid: text("member_did").notNull(),
    /** "member", or "pending" while a request waits for approval. */
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupDid, t.memberDid] }), index("group_member_member_idx").on(t.memberDid)],
);

/**
 * A member's post to a group while it's being written to the group's repo.
 * Keeps two uploads from taking the same record key, and one member from
 * posting twice at once; the row goes once the write is done, since the
 * repo is the record of what was posted. Rows left by a crash expire.
 */
export const groupPostClaim = pgTable(
  "group_post_claim",
  {
    groupDid: text("group_did").notNull(),
    uploadDate: text("upload_date").notNull(),
    memberDid: text("member_did").notNull(),
    sequence: integer("sequence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupDid, t.uploadDate, t.memberDid] }),
    unique("group_post_claim_sequence").on(t.groupDid, t.uploadDate, t.sequence),
  ],
);

/**
 * Photos members posted to a group through foto-log, and who posted each.
 * A photo's uploadedBy credit is shown only when it matches a row here, so
 * a record written to the group's repo some other way can't claim to be
 * by someone.
 */
export const groupPost = pgTable(
  "group_post",
  {
    groupDid: text("group_did").notNull(),
    rkey: text("rkey").notNull(),
    memberDid: text("member_did").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupDid, t.rkey] })],
);

/**
 * Members an admin has banned. They can't sign in, and foto-log hides their
 * page and photos. The photos stay in their own repo; lifting the ban shows
 * them again.
 */
export const bannedMember = pgTable("banned_member", {
  did: text("did").primaryKey(),
  /** The admin who banned them. */
  bannedBy: text("banned_by").notNull(),
  bannedAt: timestamp("banned_at", { withTimezone: true }).notNull().defaultNow(),
  /** Why, in the admin's words. Null only for bans from before reasons were asked for. */
  reason: text("reason"),
});

/** Members an admin has made admins, beside the built-in ones in lib/admin-server.ts. */
export const siteAdmin = pgTable("site_admin", {
  did: text("did").primaryKey(),
  /** The admin who made them one. */
  grantedBy: text("granted_by").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Members who deleted their foto-log. Their pages stay hidden until they sign
 * in again, and their Fotolog name is held for them for a while so nobody
 * else can take it.
 */
export const closedMember = pgTable("closed_member", {
  did: text("did").primaryKey(),
  /** The Fotolog name they had, held for NAME_HOLD_DAYS; null if they had none. */
  fotologName: text("fotolog_name"),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("closed_member_name_idx").on(t.fotologName)]);

/**
 * How many times each photo was viewed, by the hour. One row per photo per
 * hour that had views; `member_did` is the photo's owner, and nothing about
 * the viewer is stored. Rows go with their photo_index row, so a photo
 * deleted and posted again under the same key starts from zero.
 */
export const photoView = pgTable(
  "photo_view",
  {
    memberDid: text("member_did").notNull(),
    photoRkey: text("photo_rkey").notNull(),
    /** The start of the UTC hour the views happened in. */
    viewHour: timestamp("view_hour", { withTimezone: true }).notNull(),
    impressions: integer("impressions").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.memberDid, t.photoRkey, t.viewHour] }),
    foreignKey({
      name: "photo_view_photo_fk",
      columns: [t.memberDid, t.photoRkey],
      foreignColumns: [photoIndex.did, photoIndex.rkey],
    }).onDelete("cascade"),
    index("photo_view_view_hour_idx").on(t.viewHour),
    index("photo_view_member_view_hour_idx").on(t.memberDid, t.viewHour),
  ],
);

/**
 * View tokens that have been used, so each counts once across every server
 * instance. Rows past `expires_at` can't count anyway (the token is too old)
 * and are deleted by the index tick.
 */
export const viewToken = pgTable(
  "view_token",
  {
    nonce: text("nonce").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("view_token_expires_at_idx").on(t.expiresAt)],
);
