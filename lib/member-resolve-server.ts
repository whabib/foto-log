import "server-only";
import { isValidDid } from "@atproto/syntax";
import { redirect } from "next/navigation";
import { cache } from "react";
import { didForName, primaryName } from "@/lib/fotolog-name-server";
import { looksLikeName } from "@/lib/fotolog-name";
import { type Actor, resolveActor } from "@/lib/identity";
import { memberPath, parseActorParam } from "@/lib/photos/urls";

/** A member as their pages show them: their account, plus their Fotolog name when it's primary. */
export type Member = Actor & { name: string | null };

/** Adds the member's primary Fotolog name, if they have one, to `actor`. */
export async function withName(actor: Actor): Promise<Member> {
  return { ...actor, name: await primaryName(actor.did) };
}

/**
 * Resolves a member page's URL segment (@name, @handle or DID) to the
 * member, or null. If the segment isn't the member's primary one, redirects
 * to the same page under it, keeping the rest of the path (`rest`, e.g.
 * "/2026-11-16" or "/friends").
 */
export const resolveMemberPage = cache(async (actorParam: string, rest = ""): Promise<Member | null> => {
  const id = parseActorParam(actorParam);
  if (!id) return null;
  let actor: Actor | null;
  if (!isValidDid(id) && looksLikeName(id)) {
    const did = await didForName(id);
    actor = did ? await resolveActor(did) : null;
  } else {
    actor = await resolveActor(id);
  }
  if (!actor) return null;
  const owner = await withName(actor);
  const canonical = memberPath(owner);
  let given: string;
  try {
    given = `/${decodeURIComponent(actorParam)}`;
  } catch {
    given = "";
  }
  if (given !== canonical) redirect(`${canonical}${rest}`);
  return owner;
});
