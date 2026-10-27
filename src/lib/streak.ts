// Local-first streak + daily quests (instant, works offline). Browser storage only.
import { useSyncExternalStore } from "react";
import { bumpStreak, dayKey, QUESTS, type QuestId } from "./social";

type S = { count: number; last: string | null; best: number; points: number; day: string; quests: Record<QuestId, number> };
const KEY = "lg:streak";
const empty = (): S => ({ count: 0, last: null, best: 0, points: 0, day: dayKey(Date.now()), quests: { listen: 0, watch: 0, share: 0 } });
let state: S | null = null;
const subs = new Set<() => void>();

function load(): S {
  if (state) return state;
  try { state = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { state = empty(); }
  return state!;
}
function save(s: S) {
  state = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  subs.forEach((f) => f());
}
function rollDay(s: S): S {
  const today = dayKey(Date.now());
  return s.day === today ? s : { ...s, day: today, quests: { listen: 0, watch: 0, share: 0 } };
}

export function recordVisit() {
  const s = rollDay(load());
  save({ ...s, ...bumpStreak(s, Date.now()) });
}

// Owner-edited quest goals/points (from Studio); defaults until the site settings load.
let questConfig: { id: QuestId; goal: number; points: number }[] = QUESTS;
export function setQuestConfig(q: { id: QuestId; goal: number; points: number }[]) { questConfig = q; }

export function questStep(id: QuestId, n = 1) {
  const s = rollDay(load());
  const q = questConfig.find((x) => x.id === id);
  if (!q) return; // quest switched off by the owner
  const before = s.quests[id];
  if (before >= q.goal) return;
  const after = Math.min(q.goal, before + n);
  save({ ...s, quests: { ...s.quests, [id]: after }, points: s.points + (after >= q.goal ? q.points : 0) });
}

const SERVER = empty();
export function useStreak(): S {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => rollDay(load()), () => SERVER);
}
