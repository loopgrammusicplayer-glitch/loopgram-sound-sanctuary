import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Chip, DiscoverGrid, PlayableChip, prefetchDiscover, useGenres } from "@/components/Browse";
import { isSlowNetwork } from "@/lib/speed";
import { Page } from "@/components/lg";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore — LoopgramChannel" },
      { name: "description", content: "Explore movies and TV by genre, popularity, rating and release date." },
      { property: "og:title", content: "Explore — LoopgramChannel" },
      { property: "og:description", content: "Browse movies and TV by genre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Explore,
});

function Explore() {
  const [type, setType] = useState<"movie" | "tv">("movie");
  const [genre, setGenre] = useState<number | null>(null);
  const [sort, setSort] = useState("popularity.desc");
  const g = useGenres();
  const qc = useQueryClient();
  // Warm the first few categories in the background (skipped on slow networks) so taps feel instant.
  useEffect(() => {
    if (isSlowNetwork()) return;
    const list = g.data?.[type] ?? [];
    const t = setTimeout(() => list.slice(0, 6).forEach((x) => prefetchDiscover(qc, type, sort, String(x.id))), 800);
    return () => clearTimeout(t);
  }, [g.data, type, sort, qc]);
  const sorts = [["popularity.desc", "Popular"], ["vote_average.desc", "Top rated"], [type === "movie" ? "primary_release_date.desc" : "first_air_date.desc", "Newest"]];
  const switchType = (t: "movie" | "tv") => { setType(t); setGenre(null); setSort("popularity.desc"); };
  return (
    <Page title="Explore">
      <div className="w-full min-w-0 overflow-x-hidden">
        <div className="px-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
            {(["movie", "tv"] as const).map((t) => (
              <button key={t} onClick={() => switchType(t)} aria-pressed={type === t}
                className={`rounded-lg py-2 text-sm font-semibold transition ${type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {t === "movie" ? "Movies" : "TV Shows"}
              </button>
            ))}
          </div>
        </div>

        <section className="px-4 pt-4">
          <h2 className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort by</h2>
          <div className="flex flex-wrap gap-2">
            {sorts.map(([k, l]) => <Chip key={k} active={sort === k} onClick={() => setSort(k!)}>{l}</Chip>)}
            <PlayableChip />
          </div>
        </section>

        <section className="px-4 pt-4">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories</h2>
            {genre !== null && <button onClick={() => setGenre(null)} className="text-xs font-medium text-primary">Clear</button>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active={genre === null} onClick={() => setGenre(null)}>All</Chip>
            {g.data?.[type].map((x) => (
              <span key={x.id} onPointerEnter={() => prefetchDiscover(qc, type, sort, String(x.id))} onTouchStart={() => prefetchDiscover(qc, type, sort, String(x.id))}>
                <Chip active={genre === x.id} onClick={() => setGenre(x.id)}>{x.name}</Chip>
              </span>
            ))}
          </div>
        </section>

        <h2 className="px-4 pb-3 pt-6 text-lg font-bold">
          {genre !== null ? g.data?.[type].find((x) => x.id === genre)?.name ?? "Results" : `All ${type === "movie" ? "Movies" : "TV Shows"}`}
        </h2>
        <DiscoverGrid type={type} sort={sort} genre={genre ? String(genre) : undefined} />
      </div>
    </Page>
  );
}
