// Owner controls for the 3 live features (Loop Party, Streaks & Quests, Lounges).
// Browser-safe schema; stored in Redis `site:live`, written only by the owner from Studio.
import { z } from "zod";
import { LOUNGES, QUESTS, type QuestId } from "./social";

const Quest = z.object({ on: z.boolean().default(true), goal: z.number().int().min(1).max(50), points: z.number().int().min(0).max(10000) });
const Lounge = z.object({ on: z.boolean().default(true), posts: z.array(z.string().max(64)).max(200).default([]) });

const questDefaults = Object.fromEntries(QUESTS.map((q) => [q.id, { on: true, goal: q.goal, points: q.points }])) as Record<QuestId, z.infer<typeof Quest>>;
const loungeDefaults = Object.fromEntries(LOUNGES.map((l) => [l.id, { on: true, posts: [] }])) as Record<string, z.infer<typeof Lounge>>;

export const LiveSettings = z.object({
  partyOn: z.boolean().default(true),
  partyTmdb: z.boolean().default(true),
  partyPosts: z.boolean().default(true),
  streaksOn: z.boolean().default(true),
  quests: z.object({ listen: Quest, watch: Quest, share: Quest }).default(questDefaults),
  loungesOn: z.boolean().default(true),
  lounges: z.record(z.string(), Lounge).default(loungeDefaults),
});
export type LiveSettingsT = z.infer<typeof LiveSettings>;

export function parseLive(raw: unknown): LiveSettingsT {
  const r = LiveSettings.safeParse(raw ?? {});
  const v = r.success ? r.data : LiveSettings.parse({});
  return { ...v, quests: { ...questDefaults, ...v.quests }, lounges: { ...loungeDefaults, ...v.lounges } };
}
export const DEFAULT_LIVE = parseLive({});

/** Can a party be started for this kind of content? */
export function partyAllowed(s: Pick<LiveSettingsT, "partyOn" | "partyTmdb" | "partyPosts">, kind: "tmdb" | "post"): boolean {
  return s.partyOn && (kind === "tmdb" ? s.partyTmdb : s.partyPosts);
}

/** Quest list after the owner's edits (switched-off quests removed). */
export function activeQuests(s: Pick<LiveSettingsT, "quests">) {
  return QUESTS.filter((q) => s.quests[q.id]?.on !== false).map((q) => ({ ...q, goal: s.quests[q.id]?.goal ?? q.goal, points: s.quests[q.id]?.points ?? q.points }));
}
