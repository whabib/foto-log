import { boolean, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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
  /** The member's Fotolog name, lowercase and unique; set once, never released. */
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
  },
  (t) => [
    primaryKey({ columns: [t.did, t.rkey] }),
    index("photo_index_created_at_idx").on(t.createdAt),
    index("photo_index_did_created_at_idx").on(t.did, t.createdAt),
  ],
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
