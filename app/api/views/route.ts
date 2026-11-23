import { isSameOrigin } from "@/lib/same-origin";
import { recordView } from "@/lib/views-server";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Counts one view of a photo. The body is the view token the photo page
 * rendered; the page's ViewBeacon sends it once the page has been open a
 * moment. Always answers 204, so a script learns nothing from the reply.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  try {
    const token = (await request.text()).trim();
    const result = await recordView(token);
    if (result === "invalid") log.warn("View token rejected", { result });
  } catch (err) {
    log.error("Counting a view failed", { err });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
