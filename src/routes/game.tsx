import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, img } from "@/lib/api";
import { setState, useStore } from "@/lib/store";
import { ErrorBox, Page, type Item } from "@/components/lg";

export const Route = createFileRoute("/game")({
  head: () => ({
    meta: [
      { title: "Daily Discovery Game — LoopgramChannel" },
      { name: "description", content: "Guess today's trending movie from clues revealed one at a time. Keep your streak alive." },
      { property: "og:title", content: "Daily Discovery Game — LoopgramChannel" },
      { property: "og:description", content: "One new movie puzzle every day. Fewer clues, higher score." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Game,
});

type GameData = { date: string; answer_id: number; year: string; clues: string[]; options: Item[] };

function Game() {
  // One puzzle per day: cache it for hours so huge traffic hits the cached copy, not the server.
  const q = useQuery({ queryKey: ["game"], queryFn: () => api<GameData>({ a: "game" }), staleTime: 6 * 60 * 60_000, gcTime: 24 * 60 * 60_000 });
  const results = useStore((s) => s.game);
  const [shown, setShown] = useState(1);

  if (q.isPending)
    return (
      <Page title="Daily Discovery">
        <div className="space-y-3 px-4">
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
        </div>
      </Page>
    );
  if (q.isError) return <Page title="Daily Discovery"><ErrorBox error={q.error} retry={() => q.refetch()} /></Page>;

  const g = q.data;
  const done = results[g.date];
  const streak = (() => { let n = 0; const d = new Date(g.date); while (results[d.toISOString().slice(0, 10)]?.correct) { n++; d.setDate(d.getDate() - 1); } return n; })();
  const answer = g.options.find((o) => o.id === g.answer_id)!;
  // Clue 1 is the release year (vague); cast names come one by one after.
  const clues = [g.year ? `Released in ${g.year}` : "A trending movie right now", ...g.clues.map((c) => `Stars ${c}`)];
  const visible = done ? clues.length : Math.min(shown, clues.length);
  const score = Math.max(1, clues.length - visible + 1);

  const pick = (id: number) => {
    if (done) return;
    setState((s) => ({ ...s, game: { ...s.game, [g.date]: { picked: id, correct: id === g.answer_id } } }));
  };
  const share = () => {
    const bar = clues.map((_, i) => (i < visible ? "🟨" : "⬛")).join("");
    const t = `LoopgramChannel Daily ${g.date}\n${done?.correct ? "✅" : "❌"} ${bar}\n🔥 Streak ${streak}`;
    import("@/lib/share").then((m) => m.shareLink({ text: t, url: location.origin + "/game" }));
  };

  return (
    <Page title="Daily Discovery">
      <div className="mx-auto w-full max-w-xl px-4 pb-10">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Today" value={g.date.slice(5)} />
          <Stat label="Streak" value={`🔥 ${streak}`} />
          <Stat label="Clues" value={`${visible}/${clues.length}`} />
        </div>

        {done && (
          <div role="status" className={`mt-4 rounded-2xl border-2 p-4 ${done.correct ? "border-primary bg-primary/10" : "border-destructive bg-destructive/10"}`}>
            <div className="flex items-center gap-3">
              {answer.poster_path && <img src={img(answer.poster_path, "w185")!} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0">
                <p className="text-lg font-black">{done.correct ? "Correct! 🎉" : "Not quite"}</p>
                <p className="truncate text-sm">The answer is <b>{answer.title}</b></p>
                <p className="text-xs text-muted-foreground">{done.correct ? `Solved with ${visible} clue${visible > 1 ? "s" : ""}` : "Come back tomorrow for a new puzzle"}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link to="/t/$type/$id" params={{ type: "movie", id: String(answer.id) }} className="rounded-full bg-primary py-2 text-center text-sm font-semibold text-primary-foreground">View title</Link>
              <button onClick={share} className="rounded-full border py-2 text-sm font-semibold">Share result</button>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guess the movie</p>
          <ol className="mt-2 space-y-2">
            {clues.slice(0, visible).map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-base">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                <span className="min-w-0">{c}</span>
              </li>
            ))}
          </ol>
          {!done && visible < clues.length && (
            <button onClick={() => setShown(visible + 1)} className="mt-3 w-full rounded-full border border-dashed py-2 text-sm font-semibold">
              Need a hint? Reveal clue {visible + 1}
            </button>
          )}
          {!done && <p className="mt-2 text-xs text-muted-foreground">Fewer clues = higher score. Current score: {score}</p>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {g.options.map((o) => {
            const isAnswer = o.id === g.answer_id;
            const isPicked = done?.picked === o.id;
            const cls = !done
              ? "border-border bg-card active:scale-95 hover:border-primary"
              : isAnswer
                ? "border-primary bg-primary/15 ring-2 ring-primary"
                : isPicked
                  ? "border-destructive bg-destructive/15 line-through"
                  : "border-border opacity-50";
            return (
              <button
                key={o.id}
                onClick={() => pick(o.id)}
                disabled={!!done}
                aria-label={o.title}
                className={`flex min-h-16 items-center justify-between gap-2 rounded-xl border-2 p-3 text-left text-sm font-semibold transition ${cls}`}
              >
                <span className="min-w-0 break-words">{o.title}</span>
                {done && isAnswer && <span className="shrink-0" aria-hidden>✓</span>}
                {done && isPicked && !isAnswer && <span className="shrink-0" aria-hidden>✗</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-2 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate font-bold">{value}</p>
    </div>
  );
}
