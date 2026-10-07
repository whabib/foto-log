import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { secret } from "@/lib/config";

/**
 * Decodes a 32-byte base64 key from the environment. In dev it derives a
 * fixed key from the name so encrypted rows survive restarts.
 */
function loadKey(envName: string): Buffer {
  const encoded = secret(
    envName,
    createHash("sha256").update(`foto-log-dev-${envName}`).digest("base64"),
  );
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error(`${envName} must be 32 bytes, base64-encoded`);
  }
  return key;
}

let storeKey: Buffer | undefined;
let cookieKey: Buffer | undefined;

/**
 * Encrypts `plaintext` with AES-256-GCM. `context` is bound in as
 * additional authenticated data, so a ciphertext copied to another row
 * (with a different context) won't decrypt.
 */
export function encrypt(plaintext: string, context: string): string {
  storeKey ??= loadKey("STORE_ENCRYPTION_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", storeKey, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Reverses {@link encrypt}. Throws if the data or context was tampered with. */
export function decrypt(token: string, context: string): string {
  storeKey ??= loadKey("STORE_ENCRYPTION_KEY");
  const [version, iv, tag, ciphertext] = token.split(".");
  if (version !== "v1" || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unrecognized encrypted value");
  }
  const decipher = createDecipheriv("aes-256-gcm", storeKey, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function hmac(value: string): Buffer {
  cookieKey ??= loadKey("COOKIE_SECRET");
  return createHmac("sha256", cookieKey).update(value).digest();
}

/** Returns `value.signature` for use in a cookie. */
export function sign(value: string): string {
  return `${value}.${hmac(value).toString("base64url")}`;
}

/** Returns the original value if the signature is valid, otherwise null. */
export function unsign(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const given = Buffer.from(signed.slice(dot + 1), "base64url");
  const expected = hmac(value);
  return given.length === expected.length && timingSafeEqual(given, expected) ? value : null;
}

/** A random, URL-safe identifier with 256 bits of entropy. */
export function randomId(): string {
  return randomBytes(32).toString("base64url");
}
