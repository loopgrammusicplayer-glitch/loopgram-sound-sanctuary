import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { Page } from "@/components/lg";
import { LiveChat, useMe } from "@/components/LiveChat";
import { LOUNGES, loungeNow, SLOT_SEC } from "@/lib/social";
import { getLounge, loungeChat, loungePing } from "@/lib/social.functions";
import { postsQuery } from "@/lib/posts-query";
import { questStep } from "@/lib/streak";
import { useLive } from "@/lib/use-live";

export const Route = createFileRoute("/lounge/$id")({
  loader: ({ params }) => {
    const l = LOUNGES.find((x) => x.id === params.id);
    if (!l) throw notFound();
    return { name: l.name, blurb: l.blurb };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Lounge"} — Live Lounge | LoopgramChannel` },
      { name: "description", content: `${loaderData?.blurb ?? "Listen together"} — join the live listening lounge on LoopgramChannel.` },
      { property: "og:title", content: `${loaderData?.name ?? "Lounge"} on LoopgramChannel` },
      { property: "og:description", content: "Everyone hears the same track at the same moment. Hop in and chat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoungePage,
});

const isMedia = (u: string) => !!u && !/youtube\.com|youtu\.be/.test(u);

function LoungePage() {
  const { id } = Route.useParams();
  const info = Route.useLoaderData();
  const idx = LOUNGES.findIndex((l) => l.id === id);
  const posts = useQuery(postsQuery);
  const live = useLive();
  const picked = live.lounges[id]?.posts ?? [];
  const closed = !live.loungesOn || live.lounges[id]?.on === false;
  // Owner's playlist from Studio if set; otherwise media posts shared round-robin across lounges.
  const tracks = useMemo(() => {
    const all = (posts.data ?? []).filter((p) => isMedia(p.videoUrl)).sort((a, b) => a.createdAt - b.createdAt);
    if (picked.length) return picked.map((pid) => all.find((p) => p.id === pid)).filter((p): p is NonNullable<typeof p> => !!p);
    const mine = all.filter((_, i) => i % LOUNGES.length === idx);
    return mine.length >= 2 ? mine : all;
  }, [posts.data, idx, picked.join(",")]);
  const room = useQuery({ queryKey: ["lounge", id], queryFn: () => getLounge({ data: { id } }), refetchInterval: 4000 });
  const { me } = useMe();
  const [on, setOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const { index, offset } = loungeNow(tracks.length, now);
  const track = tracks[index];

  useEffect(() => {
    if (!on || !me) return;
    const ping = () => loungePing({ data: { id, me: me.id } }).catch(() => {});
    ping();
    let mins = 0;
    const p = setInterval(ping, 30_000);
    const q = setInterval(() => { mins++; questStep("listen"); if (mins >= 2) clearInterval(q); }, 60_000);
    return () => { clearInterval(p); clearInterval(q); };
  }, [on, me?.id, id]);

  // Jump to the shared position whenever the track changes or the listener joins.
  useEffect(() => {
    const v = ref.current;
    if (!v || !on || !track) return;
    const seek = () => { const d = v.duration || SLOT_SEC; v.currentTime = offset % d; v.play().catch(() => {}); };
    if (v.readyState >= 1) seek(); else v.addEventListener("loadedmetadata", seek, { once: true });
  }, [track?.id, on]);

  return (
    <Page>
      <div className="space-y-4 p-4">
        <Link to="/live" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />All lounges</Link>
        <div>
          <h1 className="text-2xl font-black">{info.name}</h1>
          <p className="text-sm text-muted-foreground">{info.blurb} · <span className="font-semibold text-foreground">{room.data?.people ?? 0} listening now</span></p>
        </div>
        {closed ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">This lounge is closed right now. Check back soon!</p>
        ) : !tracks.length ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">{posts.isPending ? "Loading…" : "No music has been uploaded for this lounge yet. Check back soon!"}</p>
        ) : (
          <div className="rounded-xl border p-4">
            <p className="text-xs uppercase text-muted-foreground">Now playing</p>
            <p className="text-lg font-bold">{track?.title || "Untitled track"}</p>
            <video key={track?.id} ref={ref} src={track?.videoUrl} playsInline loop preload="metadata" className={on ? "mt-3 max-h-56 w-full rounded-lg bg-muted" : "hidden"} />
            {!on && <button onClick={() => setOn(true)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground"><Play className="h-4 w-4" />Join & listen</button>}
            <p className="mt-2 text-xs text-muted-foreground">Next track in {SLOT_SEC - offset}s{tracks.length > 1 && ` · Up next: ${tracks[(index + 1) % tracks.length]?.title || "Untitled"}`}</p>
          </div>
        )}
        {!closed && <LiveChat chat={room.data?.chat ?? []} onSend={async (name, msg) => { await loungeChat({ data: { id, name, msg } }); room.refetch(); }} />}
      </div>
    </Page>
  );
}
