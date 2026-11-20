import { describe, expect, it } from "vitest";
import { formatEntry, serializeError } from "./log";

describe("formatEntry", () => {
  it("writes severity, message and fields as one JSON line", () => {
    const line = formatEntry("WARNING", "Couldn't list friends", { did: "did:plc:abc", status: 502 });
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({ severity: "WARNING", message: "Couldn't list friends", did: "did:plc:abc", status: 502 });
  });

  it("doesn't let a field override severity or message", () => {
    const entry = JSON.parse(formatEntry("INFO", "real", { severity: "ERROR", message: "fake" }));
    expect(entry.severity).toBe("INFO");
    expect(entry.message).toBe("real");
  });

  it("serializes errors and adds stack_trace to ERROR entries for Error Reporting", () => {
    const err = new Error("boom", { cause: new Error("root") });
    const entry = JSON.parse(formatEntry("ERROR", "Posting a photo failed", { did: "did:plc:abc", err }));
    expect(entry.err.message).toBe("boom");
    expect(entry.err.cause.message).toBe("root");
    expect(entry.stack_trace).toBe(err.stack);
  });

  it("leaves stack_trace off warnings", () => {
    const entry = JSON.parse(formatEntry("WARNING", "retrying", { err: new Error("flaky") }));
    expect(entry.stack_trace).toBeUndefined();
    expect(entry.err.message).toBe("flaky");
  });

  it("survives circular fields and bigints", () => {
    const a: Record<string, unknown> = { n: BigInt(1) };
    a.self = a;
    const entry = JSON.parse(formatEntry("INFO", "x", { a }));
    expect(entry.a).toEqual({ n: "1", self: "[Circular]" });
  });
});

describe("serializeError", () => {
  it("keeps an error's own simple fields, like an HTTP status", () => {
    const err = Object.assign(new Error("Not Found"), { status: 404, headers: { a: "b" } });
    const out = serializeError(err);
    expect(out.status).toBe(404);
    expect(out.headers).toBeUndefined();
  });
});
