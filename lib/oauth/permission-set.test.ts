import { readdirSync, readFileSync } from "node:fs";
import { IncludeScope, type LexiconPermissionSet } from "@atproto/oauth-scopes";
import { describe, expect, it } from "vitest";

const lexicon = JSON.parse(readFileSync("lexicons/com/foto-log/authFull.json", "utf8"));
const set = lexicon.defs.main as LexiconPermissionSet;

describe("com.foto-log.authFull", () => {
  const scope = IncludeScope.fromString(`include:${lexicon.id}`)!;

  it("grants every foto-log record type", () => {
    const granted = scope.toPermissions(set);
    for (const collection of ["com.foto-log.photo", "com.foto-log.profile", "com.foto-log.friend"]) {
      for (const action of ["create", "update", "delete"] as const) {
        expect(granted.some((p) => "matches" in p && p.matches({ collection, action } as never)), `${action} ${collection}`).toBe(true);
      }
    }
  });

  it("covers every record type in lexicons/, so new ones aren't forgotten", () => {
    const records = readdirSync("lexicons/com/foto-log")
      .map((f) => JSON.parse(readFileSync(`lexicons/com/foto-log/${f}`, "utf8")))
      .filter((l) => l.defs.main.type === "record")
      .map((l) => l.id);
    const listed = set.permissions.flatMap((p) => (p.resource === "repo" ? (p.collection as string[]) : []));
    expect(listed.sort()).toEqual(records.sort());
  });

  it("only includes permissions the include: scope accepts", () => {
    expect(scope.toScopes(set)).toHaveLength(set.permissions.length);
  });
});
