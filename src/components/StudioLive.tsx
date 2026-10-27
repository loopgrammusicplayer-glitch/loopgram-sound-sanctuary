// Studio: owner controls for Loop Party, Streaks & Quests and Lounges (both TMDB titles and owner posts).
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flame, Headphones, Loader2, Users, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { studioClearChat, studioEndParty, studioLive, studioLiveSave } from "@/lib/social.functions";
import { LOUNGES, QUESTS, type QuestId } from "@/lib/social";
import type { LiveSettingsT } from "@/lib/live-settings";
import { postsQuery } from "@/lib/posts-query";

const btn = "inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs hover:bg-accent disabled:opacity-50";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^\d{3}:\s*/, "");
const isMedia = (u: string) => !!u && !/youtube\.com|youtu\.be/.test(u);

function Box({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-xl border bg-card p-4"><h2 className="flex items-center gap-2 font-bold">{icon}{title}</h2>{children}</section>;
}
function Toggle({ on, set, label, note }: { on: boolean; set: (v: boolean) => void; label: string; note?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>{label}{note && <span className="block text-xs text-muted-foreground">{note}</span>}</span>
    </label>
  );
}

export function LivePanel() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const call = async <T,>(fn: (a: { data: any }) => Promise<T>, extra: Record<string, unknown> = {}) => {
    const token = await getToken(); if (!token) throw new Error("Not signed in");
    return fn({ data: { token, ...extra } });
  };
  const q = useQuery({ queryKey: ["studio", "live"], queryFn: () => call(studioLive), refetchInterval: 15_000 });
  const posts = useQuery(postsQuery);
  const [f, setF] = useState<LiveSettingsT | null>(null);
  useEffect(() => { if (q.data && !f) setF(q.data.settings); }, [q.data]);

  const save = useMutation({
    mutationFn: () => call(studioLiveSave, { settings: f }),
    onSuccess: () => { toast.success("Saved. Visitors see it within a minute."); qc.invalidateQueries({ queryKey: ["studio", "live"] }); qc.invalidateQueries({ queryKey: ["live-settings"] }); },
    onError: (e) => toast.error(err(e)),
  });
  const end = useMutation({ mutationFn: (code: string) => call(studioEndParty, { code }), onSuccess: () => { toast.success("Party ended"); q.refetch(); }, onError: (e) => toast.error(err(e)) });
  const clear = useMutation({ mutationFn: (lounge: string) => call(studioClearChat, { lounge }), onSuccess: () => toast.success("Chat cleared"), onError: (e) => toast.error(err(e)) });

  if (q.isError) return <div className="rounded-xl border p-4 text-sm text-destructive">{err(q.error)} <button className="underline" onClick={() => q.refetch()}>Retry</button></div>;
  if (!f || !q.data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const set = (p: Partial<LiveSettingsT>) => setF({ ...f, ...p });
  const setQuest = (id: QuestId, p: Partial<LiveSettingsT["quests"][QuestId]>) => set({ quests: { ...f.quests, [id]: { ...f.quests[id], ...p } } });
  const setLounge = (id: string, p: Partial<{ on: boolean; posts: string[] }>) => set({ lounges: { ...f.lounges, [id]: { on: true, posts: [], ...f.lounges[id], ...p } } });
  const media = (posts.data ?? []).filter((p) => isMedia(p.videoUrl));

  return (
    <div className="max-w-3xl space-y-4">
      <Box title="Loop Party (watch together)" icon={<Users className="h-5 w-5" />}>
        <Toggle on={f.partyOn} set={(v) => set({ partyOn: v })} label="Allow watch parties on my website" />
        <div className="ml-6 space-y-2">
          <Toggle on={f.partyTmdb} set={(v) => set({ partyTmdb: v })} label="Movies & TV (TMDB trailers)" />
          <Toggle on={f.partyPosts} set={(v) => set({ partyPosts: v })} label="My channel videos (my posts)" note="Works for uploaded video/audio files and YouTube links." />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Parties happening now ({q.data.parties.length})</p>
          {!q.data.parties.length ? <p className="text-xs text-muted-foreground">No active parties.</p> : (
            <ul className="divide-y rounded-lg border">
              {q.data.parties.map((p) => (
                <li key={p.code} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <span className="min-w-0 truncate"><b>{p.code}</b> · {p.title} <span className="text-xs text-muted-foreground">({p.type === "post" ? "my video" : p.type} · {p.people} watching · {p.playing ? "playing" : "paused"})</span></span>
                  <span className="flex shrink-0 gap-1">
                    <a href={`/party/${p.code}`} target="_blank" rel="noreferrer" className={btn}>Open</a>
                    <button className={btn} disabled={end.isPending} onClick={() => end.mutate(p.code)}><X className="h-3 w-3" />End</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Box>

      <Box title="Streaks & daily quests" icon={<Flame className="h-5 w-5" />}>
        <Toggle on={f.streaksOn} set={(v) => set({ streaksOn: v })} label="Show streak flame and quests to visitors" />
        <div className="space-y-2">
          {QUESTS.map((qq) => (
            <div key={qq.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
              <input type="checkbox" checked={f.quests[qq.id].on} onChange={(e) => setQuest(qq.id, { on: e.target.checked })} aria-label={`${qq.label} on`} />
              <span className="min-w-40 flex-1">{qq.label}</span>
              <label className="text-xs">Goal <input type="number" min={1} max={50} value={f.quests[qq.id].goal} onChange={(e) => setQuest(qq.id, { goal: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} className="ml-1 h-8 w-16 rounded border bg-background px-2" /></label>
              <label className="text-xs">Points <input type="number" min={0} max={10000} value={f.quests[qq.id].points} onChange={(e) => setQuest(qq.id, { points: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) })} className="ml-1 h-8 w-20 rounded border bg-background px-2" /></label>
            </div>
          ))}
        </div>
      </Box>

      <Box title="Listening lounges" icon={<Headphones className="h-5 w-5" />}>
        <Toggle on={f.loungesOn} set={(v) => set({ loungesOn: v })} label="Open lounges to visitors" />
        {LOUNGES.map((l) => {
          const cfg = f.lounges[l.id] ?? { on: true, posts: [] };
          return (
            <div key={l.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Toggle on={cfg.on} set={(v) => setLounge(l.id, { on: v })} label={l.name} note={`${q.data.lounges[l.id] ?? 0} listening now`} />
                <button className={btn} disabled={clear.isPending} onClick={() => clear.mutate(l.id)}>Clear chat</button>
              </div>
              <p className="text-xs text-muted-foreground">Playlist: {cfg.posts.length ? `${cfg.posts.length} picked` : "none picked — plays my uploads automatically"}</p>
              <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                {media.length ? media.map((p) => {
                  const on = cfg.posts.includes(p.id);
                  return <button key={p.id} onClick={() => setLounge(l.id, { posts: on ? cfg.posts.filter((x) => x !== p.id) : [...cfg.posts, p.id] })}
                    className={`rounded-full px-3 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{p.title || "Untitled"}</button>;
                }) : <span className="text-xs text-muted-foreground">Upload video or audio in Posts to build playlists.</span>}
              </div>
            </div>
          );
        })}
      </Box>

      <button onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save live settings
      </button>
    </div>
  );
}
