import "server-only";

/**
 * Runtime configuration.
 *
 * In production (Cloud Run) PUBLIC_URL is set to https://foto-log.com and
 * the secrets come from Secret Manager. Without PUBLIC_URL the app runs in
 * local-dev mode: it uses an ATProto loopback OAuth client and built-in dev
 * secrets, so `npm run dev` works with no setup beyond a local Postgres.
 */
const publicUrl = process.env.PUBLIC_URL?.replace(/\/+$/, "") || undefined;

export const isProduction = publicUrl !== undefined;

/** Base URL of the site, used for OAuth redirects and absolute links. */
export const baseUrl =
  publicUrl ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;

/** Reads a required secret in production, or falls back to a dev value. */
export function secret(name: string, devValue: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) throw new Error(`Missing required secret ${name}`);
  return devValue;
}
