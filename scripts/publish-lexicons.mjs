// Publishes foto-log's lexicons (record types and the permission set) as
// com.atproto.lexicon.schema records in the foto-log account's repo, so
// other apps and PDSes can resolve them. See docs/lexicon.md.
//
// Usage, with an app password for the account that owns the lexicons:
//   LEXICON_ACCOUNT=foto-log.com LEXICON_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx npm run lex:publish
// Add --dry-run to list what would be published without signing in.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { AtpAgent } from "@atproto/api";

const SCHEMA_COLLECTION = "com.atproto.lexicon.schema";
const dir = path.resolve(import.meta.dirname, "../lexicons/com/foto-log");
const dryRun = process.argv.includes("--dry-run");

const lexicons = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(path.join(dir, name), "utf8")));

for (const lex of lexicons) {
  if (!/^com\.foto-log\.[A-Za-z][A-Za-z0-9]*$/.test(lex.id)) {
    throw new Error(`Unexpected lexicon id: ${lex.id}`);
  }
}

if (dryRun) {
  for (const lex of lexicons) console.log(`would publish ${lex.id} (${lex.defs.main.type})`);
  process.exit(0);
}

const account = process.env.LEXICON_ACCOUNT;
const password = process.env.LEXICON_APP_PASSWORD;
if (!account || !password) {
  console.error("Set LEXICON_ACCOUNT (handle) and LEXICON_APP_PASSWORD (an app password for it).");
  process.exit(1);
}

const agent = new AtpAgent({ service: process.env.LEXICON_SERVICE ?? "https://bsky.social" });
await agent.login({ identifier: account, password });
const did = agent.session.did;

for (const lex of lexicons) {
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: SCHEMA_COLLECTION,
    rkey: lex.id,
    record: { $type: SCHEMA_COLLECTION, ...lex },
  });
  console.log(`published ${lex.id}`);
}

console.log(`
Done. For lexicon resolution, foto-log.com's DNS needs this TXT record:
  _lexicon.foto-log.com  TXT  "did=${did}"`);
