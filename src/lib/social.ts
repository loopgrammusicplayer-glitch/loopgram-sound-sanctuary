// Pure, browser-safe helpers for Loop Party, Streaks/Quests and Lounges. Tested in src/test/social.test.ts.

export const PARTY_CODE = /^[A-Z0-9]{6}$/;
export const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

export function makePartyCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
}

export type PartyState = { video: string; title: string; type: "movie" | "tv"; id: number; playing: boolean; pos: number; at: number; v: number };

/** Where the shared video should be "now", given the last host update. */
export function partyPosition(s: Pick<PartyState, "playing" | "pos" | "at">, now: number): number {
  return s.playing ? s.pos + Math.max(0, now - s.at) / 1000 : s.pos;
}

// ---------- Streaks ----------
export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10); // UTC day

/** Updates a streak for a visit at `now`. Same day = unchanged, next day = +1, gap = reset to 1. */
export function bumpStreak(s: { count: number; last: string | null; best: number }, now: number) {
  const today = dayKey(now);
  if (s.last === today) return s;
  const yesterday = dayKey(now - 86_400_000);
  const count = s.last === yesterday ? s.count + 1 : 1;
  return { count, last: today, best: Math.max(s.best, count) };
}

export type QuestId = "listen" | "watch" | "share";
export const QUESTS: { id: QuestId; label: string; goal: number; points: number }[] = [
  { id: "listen", label: "Listen in a Lounge for 2 minutes", goal: 2, points: 50 },
  { id: "watch", label: "Open 2 movies or shows", goal: 2, points: 100 },
  { id: "share", label: "Share something with a friend", goal: 1, points: 200 },
];

export const BADGES = [
  { days: 3, name: "Warming Up" },
  { days: 7, name: "Night Owl" },
  { days: 30, name: "Cinema Legend" },
];

// ---------- Lounges ----------
export const LOUNGES = [
  { id: "vibes", name: "Afrobeats & Amapiano Vibes", blurb: "Feel-good rhythms all day" },
  { id: "chill", name: "Chill Study Beats", blurb: "Calm sounds to focus" },
  { id: "cinema", name: "Cinema Lounge", blurb: "Big-screen moments together" },
] as const;
export type LoungeId = (typeof LOUNGES)[number]["id"];
export const SLOT_SEC = 180;

/** Every listener computes the same track + offset from the clock, so no live server stream is needed. */
export function loungeNow(trackCount: number, now: number, slotSec = SLOT_SEC): { index: number; offset: number } {
  if (trackCount <= 0) return { index: -1, offset: 0 };
  const t = Math.floor(now / 1000);
  return { index: Math.floor(t / slotSec) % trackCount, offset: t % slotSec };
}
