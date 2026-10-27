import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Flame, Headphones, Users } from "lucide-react";
import { Page } from "@/components/lg";
import { BADGES, LOUNGES } from "@/lib/social";
import { activeQuests } from "@/lib/live-settings";
import { useLive } from "@/lib/use-live";
import { loungeCounts } from "@/lib/social.functions";
import { recordVisit, useStreak } from "@/lib/streak";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live — Streaks, Lounges & Watch Parties | LoopgramChannel" },
      { name: "description", content: "Keep your daily streak, finish quests, listen together in Lounges and watch with friends in a Loop Party." },
      { property: "og:title", content: "Live on LoopgramChannel" },
      { property: "og:description", content: "Daily streaks, listening lounges and watch-together parties." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LivePage,
});

function LivePage() {
  const s = useStreak();
  useEffect(() => { recordVisit(); }, []);
  const counts = useQuery({ queryKey: ["lounge-counts"], queryFn: () => loungeCounts(), refetchInterval: 15_000 });
  const next = BADGES.find((b) => b.days > s.count);
  const live = useLive();
  const quests = activeQuests(live);
  const lounges = LOUNGES.filter((l) => live.lounges[l.id]?.on !== false);
  return (
    <Page>
      <div className="space-y-6 p-4">
        {live.streaksOn && <>
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <Flame className="h-10 w-10 text-primary" />
            <div>
              <p className="text-3xl font-black">{s.count} day streak</p>
              <p className="text-sm text-muted-foreground">Best {s.best} · {s.points} points{next ? ` · ${next.days - s.count} more day(s) for “${next.name}”` : ""}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {BADGES.map((b) => <span key={b.name} className={`rounded-full px-3 py-1 text-xs ${s.best >= b.days ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{b.name} · {b.days}d</span>)}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">Today's quests</h2>
          <ul className="space-y-2">
            {quests.map((q) => {
              const v = s.quests[q.id], done = v >= q.goal;
              return (
                <li key={q.id} className="rounded-xl border p-3">
                  <div className="flex justify-between text-sm"><span className={done ? "line-through text-muted-foreground" : ""}>{q.label}</span><span className="font-semibold">+{q.points}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${(v / q.goal) * 100}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </section>

        </>}

        {live.loungesOn && lounges.length > 0 && <section>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Headphones className="h-5 w-5" />Listening Lounges</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {lounges.map((l) => (
              <Link key={l.id} to="/lounge/$id" params={{ id: l.id }} className="rounded-xl border p-4 hover:bg-accent">
                <p className="font-bold">{l.name}</p>
                <p className="text-sm text-muted-foreground">{l.blurb}</p>
                <p className="mt-2 flex items-center gap-1 text-xs"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" />{counts.data?.[l.id] ?? 0} listening now</p>
              </Link>
            ))}
          </div>
        </section>}

        {live.partyOn && <section className="rounded-xl border p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5" />Loop Party</h2>
          <p className="text-sm text-muted-foreground">Open {live.partyTmdb && live.partyPosts ? "any movie, show or channel video" : live.partyTmdb ? "any movie or show" : "any channel video"} and tap <b>Watch together</b>. You'll get a link to send to friends — everyone sees the video play and pause at the same moment, with live chat.</p>
          <Link to={live.partyTmdb ? "/explore" : "/posts"} className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Pick something to watch</Link>
        </section>}
      </div>
    </Page>
  );
}
