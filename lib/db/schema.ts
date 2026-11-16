import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("user_session_did_idx").on(t.did)],
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
