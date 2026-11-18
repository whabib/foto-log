/**
 * Whether `typed` confirms deleting the account: its handle, with or without
 * the @, in any case; or its DID.
 */
export function confirmsDelete(typed: string, handle: string | null, did: string): boolean {
  const t = typed.trim().replace(/^@/, "").toLowerCase();
  return t !== "" && (t === handle?.toLowerCase() || t === did.toLowerCase());
}
