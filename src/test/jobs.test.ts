import { describe, it, expect } from "vitest";
import { jobKey, parseJob, backoffSeconds, failureAction, MAX_RECEIVES } from "@/lib/jobs";
import { scrub } from "@/lib/log-sanitize";
import { verifyTurnstile } from "@/lib/turnstile.server";

describe("background jobs", () => {
  it("duplicate messages share one idempotency key", () => {
    expect(jobKey({ kind: "index", type: "movie", id: 5 })).toBe(jobKey({ kind: "index", type: "movie", id: 5 }));
  });
  it("rejects malformed or unknown messages", () => {
    expect(parseJob("not json")).toBeNull();
    expect(parseJob(JSON.stringify({ v: 1, kind: "index", type: "person", id: 1 }))).toBeNull();
    expect(parseJob(JSON.stringify({ v: 1, kind: "index", type: "tv", id: 9 }))).toEqual({ v: 1, kind: "index", type: "tv", id: 9 });
  });
  it("retries transient failures, dead-letters after 5 tries or permanent errors", () => {
    expect(MAX_RECEIVES).toBe(5);
    expect(failureAction(1, false)).toBe("retry");
    expect(failureAction(5, false)).toBe("dead");
    expect(failureAction(1, true)).toBe("dead");
  });
  it("backoff grows and is capped at 15 minutes", () => {
    expect(backoffSeconds(1, 1)).toBe(10);
    expect(backoffSeconds(3, 1)).toBe(40);
    expect(backoffSeconds(20, 1)).toBe(900);
  });
});
describe("log scrubbing", () => {
  it("never keeps tokens or auth headers", () => {
    const out = JSON.stringify(scrub({ authorization: "Bearer abc", msg: "failed Bearer xyz123 url?X-Amz-Signature=deadbeef", api_key: "k" }));
    expect(out).not.toContain("abc"); expect(out).not.toContain("xyz123"); expect(out).not.toContain("deadbeef"); expect(out).not.toContain('"k"');
  });
});
describe("turnstile (real Siteverify, Cloudflare test keys)", () => {
  it("rejects a missing token without calling the provider", async () => {
    expect(await verifyTurnstile(undefined, undefined, { secret: "x" })).toEqual({ ok: false, reason: "missing-token" });
  });
  it("accepts a token with the always-pass test secret", async () => {
    expect((await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", undefined, { secret: "1x0000000000000000000000000000000AA" })).ok).toBe(true);
  });
  it("rejects with the always-fail test secret", async () => {
    expect((await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", undefined, { secret: "2x0000000000000000000000000000000AA" })).ok).toBe(false);
  });
  it("rejects a token already used (test secret for spent tokens)", async () => {
    const r = await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", undefined, { secret: "3x0000000000000000000000000000000AA" });
    expect(r).toEqual({ ok: false, reason: "timeout-or-duplicate" });
  });
});
