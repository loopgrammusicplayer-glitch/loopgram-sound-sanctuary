// Loop Party + Lounge live state. Upstash Redis only (short TTLs); page reads never touch DynamoDB/R2.
// Load protection: per-isolate memo on hot reads (many viewers of one room = ~1 Redis call per second per instance),
// per-IP local rate limits on writes, and fail-open nulls if Redis is down.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { LOUNGES, makePartyCode, PARTY_CODE, YT_ID, type PartyState } from "./social";

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

// ---------- Loop Party ----------
export const createParty = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ video: z.string().regex(YT_ID), title: z.string().trim().max(200), type: z.enum(["movie", "tv"]), id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    await guard("pc", 10);
    const { redis } = await import("./backend.server");
    const hostKey = crypto.randomUUID();
    for (let i = 0; i < 5; i++) {
      const code = makePartyCode();
      const s: PartyState = { ...data, playing: false, pos: 0, at: Date.now(), v: 1 };
      const ok = await redis(["SET", `party:${code}`, JSON.stringify({ ...s, hostKey }), "EX", TTL, "NX"]);
      if (ok === "OK") return { code, hostKey };
    }
    throw new Error("Could not start a party right now. Please try again.");
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
