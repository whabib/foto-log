import { isSameOrigin } from "@/lib/same-origin";
import { recordView } from "@/lib/views-server";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** A view token is well under this; anything longer isn't one. */
const MAX_BODY_BYTES = 1024;

/** The request body as text, or null if it's longer than `max` bytes. Stops reading once it is. */
async function readSmallBody(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Counts one view of a photo. The body is the view token the photo page
 * rendered; the page's ViewBeacon sends it once the page has been open a
 * moment. Always answers 204, so a script learns nothing from the reply.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  try {
    const body = await readSmallBody(request, MAX_BODY_BYTES);
    const result = body === null ? "invalid" : await recordView(body.trim());
    if (result === "invalid") log.warn("View token rejected", { result });
  } catch (err) {
    log.error("Counting a view failed", { err });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
