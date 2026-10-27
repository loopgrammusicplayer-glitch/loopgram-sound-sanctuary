// Loop Party + Lounge live state. Upstash Redis only (short TTLs); page reads never touch DynamoDB/R2.
// Load protection: per-isolate memo on hot reads (many viewers of one room = ~1 Redis call per second per instance),
// per-IP local rate limits on writes, and fail-open nulls if Redis is down.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { LOUNGES, makePartyCode, PARTY_CODE, postPartyMedia, YT_ID, type PartyState } from "./social";
import { LiveSettings, parseLive, partyAllowed, type LiveSettingsT } from "./live-settings";

const TTL = 6 * 3600;
const memo = new Map<string, { v: unknown; exp: number }>();
async function cached<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.v as T;
  const v = await fn();
  if (memo.size > 5000) memo.clear();
  memo.set(key, { v, exp: Date.now() + ms });
  return v;
}
async function guard(bucket: string, limit: number) {
  const { localRateLimit, clientIp } = await import("./backend.server");
  if (!localRateLimit(`${bucket}:${clientIp(getRequest())}`, limit)) throw new Error("Too many requests, slow down a little.");
}
const parse = <T,>(s: unknown): T | null => { try { return typeof s === "string" ? (JSON.parse(s) as T) : null; } catch { return null; } };
const Name = z.string().trim().min(1).max(24);
const Msg = z.string().trim().min(1).max(200);
type Chat = { n: string; m: string; t: number };

// ---------- Owner live settings (Redis `site:live`) ----------
async function readLive(): Promise<LiveSettingsT> {
  return cached("live", 5000, async () => {
    const { redis } = await import("./backend.server");
    const raw = await redis(["GET", "site:live"]).catch(() => null);
    return parseLive(parse(raw));
  });
}
/** Public: which live features the owner has switched on. Fails open to defaults. */
export const getLiveSettings = createServerFn({ method: "GET" }).handler(() => readLive().catch(() => parseLive({})));

// ---------- Loop Party ----------
const PartyIn = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tmdb"), video: z.string().regex(YT_ID), title: z.string().trim().max(200), type: z.enum(["movie", "tv"]), id: z.number().int().positive() }),
  z.object({ kind: z.literal("post"), id: z.string().regex(/^[a-z0-9-]{3,64}$/) }),
]);

export const createParty = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PartyIn.parse(d))
  .handler(async ({ data }) => {
    await guard("pc", 10);
    const live = await readLive();
    if (!partyAllowed(live, data.kind)) throw new Error("Watch together is switched off for this right now.");
    const { redis } = await import("./backend.server");
    let base: Pick<PartyState, "video" | "file" | "title" | "type" | "id">;
    if (data.kind === "tmdb") {
      base = { video: data.video, title: data.title, type: data.type, id: data.id };
    } else {
      // Media comes from the owner's published post, never from the browser.
      const posts = parse<{ id: string; title?: string; videoUrl?: string; published?: boolean }[]>(await redis(["GET", "site:posts"])) ?? [];
      const p = posts.find((x) => x.id === data.id && x.published);
      const media = p ? postPartyMedia(p.videoUrl ?? "") : null;
      if (!p || !media) throw new Error("This video can't be watched together.");
      base = { ...media, title: (p.title || "Video").slice(0, 200), type: "post", id: p.id };
    }
    const hostKey = crypto.randomUUID();
    for (let i = 0; i < 5; i++) {
      const code = makePartyCode();
      const s: PartyState = { ...base, playing: false, pos: 0, at: Date.now(), v: 1 };
      const ok = await redis(["SET", `party:${code}`, JSON.stringify({ ...s, hostKey }), "EX", TTL, "NX"]);
      if (ok === "OK") {
        void redis(["ZADD", "party:active", Date.now(), code]).catch(() => null);
        return { code, hostKey };
      }
    }
    throw new Error("Could not start a party right now. Please try again.");
  });

// ---------- Studio (owner only) ----------
const tok = z.object({ token: z.string().min(20).max(4096) });
async function owner(token: string) {
  const { requireOwner, AuthError } = await import("./auth.server");
  try { return await requireOwner(token); }
  catch (e) { if (e instanceof AuthError) throw new Error(`${e.status}: ${e.message}`); throw new Error("401: Could not verify session"); }
}

export const studioLive = createServerFn({ method: "POST" }).inputValidator((d: unknown) => tok.parse(d)).handler(async ({ data }) => {
  await owner(data.token);
  const { redis, redisPipeline } = await import("./backend.server");
  const settings = parseLive(parse(await redis(["GET", "site:live"])));
  await redis(["ZREMRANGEBYSCORE", "party:active", 0, Date.now() - TTL * 1000]);
  const codes = ((await redis(["ZREVRANGE", "party:active", 0, 49])) as string[] | null) ?? [];
  const rows = codes.length ? await redisPipeline(codes.flatMap((c) => [["GET", `party:${c}`], ["ZCOUNT", `party:${c}:here`, Date.now() - 30_000, "+inf"]])) : [];
  const parties = codes.map((code, i) => {
    const p = parse<PartyState>(rows[i * 2]);
    return p ? { code, title: p.title, type: p.type, id: String(p.id), playing: p.playing, people: Number(rows[i * 2 + 1]) || 0 } : null;
  }).filter(Boolean) as { code: string; title: string; type: string; id: string; playing: boolean; people: number }[];
  const lc = await redisPipeline(LOUNGES.map((l) => ["ZCOUNT", `lounge:${l.id}:here`, Date.now() - 45_000, "+inf"]));
  return { settings, parties, lounges: Object.fromEntries(LOUNGES.map((l, i) => [l.id, Number(lc[i]) || 0])) as Record<string, number> };
});

export const studioLiveSave = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tok.extend({ settings: LiveSettings }).parse(d))
  .handler(async ({ data }) => {
    const me = await owner(data.token);
    const { redis } = await import("./backend.server");
    const { audit } = await import("./auth.server");
    await redis(["SET", "site:live", JSON.stringify(parseLive(data.settings))]);
    memo.delete("live");
    await audit(me, "live.settings", "site:live", "ok");
    return { ok: true };
  });

export const studioEndParty = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tok.extend({ code: z.string().regex(PARTY_CODE) }).parse(d))
  .handler(async ({ data }) => {
    const me = await owner(data.token);
    const { redisPipeline } = await import("./backend.server");
    const { audit } = await import("./auth.server");
    await redisPipeline([["DEL", `party:${data.code}`, `party:${data.code}:chat`, `party:${data.code}:here`], ["ZREM", "party:active", data.code]]);
    memo.delete(`p:${data.code}`);
    await audit(me, "live.party.end", data.code, "ok");
    return { ok: true };
  });

export const studioClearChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tok.extend({ lounge: z.enum(LOUNGES.map((l) => l.id) as [string, ...string[]]) }).parse(d))
  .handler(async ({ data }) => {
    const me = await owner(data.token);
    const { redis } = await import("./backend.server");
    const { audit } = await import("./auth.server");
    await redis(["DEL", `lounge:${data.lounge}:chat`]);
    memo.delete(`l:${data.lounge}`);
    await audit(me, "live.lounge.clearChat", data.lounge, "ok");
    return { ok: true };
  });

export const getParty = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(PARTY_CODE) }).parse(d))
  .handler(async ({ data }) => cached(`p:${data.code}`, 800, async () => {
    const { redisPipeline } = await import("./backend.server");
    const [raw, chat, people] = await redisPipeline([
      ["GET", `party:${data.code}`],
      ["LRANGE", `party:${data.code}:chat`, 0, 39],
      ["ZCOUNT", `party:${data.code}:here`, Date.now() - 30_000, "+inf"],
    ]);
    const p = parse<PartyState & { hostKey?: string }>(raw);
    if (!p) return null;
    delete p.hostKey;
    return { state: p as PartyState, chat: ((chat as string[]) ?? []).map((c) => parse<Chat>(c)).filter(Boolean).reverse() as Chat[], people: Number(people) || 0, now: Date.now() };
  }));

export const controlParty = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(PARTY_CODE), hostKey: z.string().uuid(), playing: z.boolean(), pos: z.number().min(0).max(86400) }).parse(d))
  .handler(async ({ data }) => {
    await guard("px", 120);
    const { redis } = await import("./backend.server");
    const p = parse<PartyState & { hostKey: string }>(await redis(["GET", `party:${data.code}`]));
    if (!p || p.hostKey !== data.hostKey) throw new Error("Only the host can control playback.");
    const next = { ...p, playing: data.playing, pos: data.pos, at: Date.now(), v: p.v + 1 };
    await redis(["SET", `party:${data.code}`, JSON.stringify(next), "EX", TTL]);
    memo.delete(`p:${data.code}`);
    return { ok: true };
  });

export const partyPing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(PARTY_CODE), me: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await guard("pp", 30);
    const { redisPipeline } = await import("./backend.server");
    const k = `party:${data.code}:here`;
    await redisPipeline([["ZADD", k, Date.now(), data.me], ["ZREMRANGEBYSCORE", k, 0, Date.now() - 60_000], ["EXPIRE", k, TTL]]);
    return { ok: true };
  });

async function postChat(key: string, name: string, msg: string, ttl: number) {
  const { redisPipeline } = await import("./backend.server");
  await redisPipeline([["LPUSH", key, JSON.stringify({ n: name, m: msg, t: Date.now() })], ["LTRIM", key, 0, 99], ["EXPIRE", key, ttl]]);
}

export const partyChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(PARTY_CODE), name: Name, msg: Msg }).parse(d))
  .handler(async ({ data }) => {
    await guard("pm", 20);
    await postChat(`party:${data.code}:chat`, data.name, data.msg, TTL);
    memo.delete(`p:${data.code}`);
    return { ok: true };
  });

// ---------- Lounges ----------
const LoungeIdZ = z.enum(LOUNGES.map((l) => l.id) as [string, ...string[]]);

export const getLounge = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: LoungeIdZ }).parse(d))
  .handler(async ({ data }) => cached(`l:${data.id}`, 1500, async () => {
    const { redisPipeline } = await import("./backend.server");
    const [chat, people] = await redisPipeline([
      ["LRANGE", `lounge:${data.id}:chat`, 0, 39],
      ["ZCOUNT", `lounge:${data.id}:here`, Date.now() - 45_000, "+inf"],
    ]);
    return { chat: ((chat as string[]) ?? []).map((c) => parse<Chat>(c)).filter(Boolean).reverse() as Chat[], people: Number(people) || 0 };
  }));

export const loungeCounts = createServerFn({ method: "GET" }).handler(() => cached("lc", 5000, async () => {
  const { redisPipeline } = await import("./backend.server");
  const r = await redisPipeline(LOUNGES.map((l) => ["ZCOUNT", `lounge:${l.id}:here`, Date.now() - 45_000, "+inf"]));
  return Object.fromEntries(LOUNGES.map((l, i) => [l.id, Number(r[i]) || 0])) as Record<string, number>;
}));

export const loungePing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: LoungeIdZ, me: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await guard("lp", 30);
    const { redisPipeline } = await import("./backend.server");
    const k = `lounge:${data.id}:here`;
    await redisPipeline([["ZADD", k, Date.now(), data.me], ["ZREMRANGEBYSCORE", k, 0, Date.now() - 90_000], ["EXPIRE", k, 3600]]);
    return { ok: true };
  });

export const loungeChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: LoungeIdZ, name: Name, msg: Msg }).parse(d))
  .handler(async ({ data }) => {
    await guard("lm", 20);
    await postChat(`lounge:${data.id}:chat`, data.name, data.msg, 86400);
    memo.delete(`l:${data.id}`);
    return { ok: true };
  });
