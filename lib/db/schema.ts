import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
