import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { PostTile } from "@/components/PostTile";
import { postsQuery } from "@/lib/posts-query";
import { Page } from "@/components/lg";

export const Route = createFileRoute("/posts")({
  validateSearch: z.object({ c: z.string().max(40).optional() }),
  head: () => ({
    meta: [
      { title: "Posts — LoopgramChannel" },
      { name: "description", content: "Latest videos, gaming, music and news posted by LoopgramChannel." },
      { property: "og:title", content: "Posts — LoopgramChannel" },
      { property: "og:description", content: "Latest videos, gaming, music and news posted by LoopgramChannel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: PostsPage,
});

function PostsPage() {
  const { data } = useSuspenseQuery(postsQuery);
  const { c } = Route.useSearch();
  const cats = [...new Set(data.map((p) => p.category).filter(Boolean))];
  const list = c ? data.filter((p) => p.category === c) : data;
  const chip = (on: boolean) => `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"}`;
  return (
    <Page>
      <h1 className="sr-only">Posts</h1>
      <div className="scrollbar-none sticky top-14 z-20 flex gap-2 overflow-x-auto bg-background px-4 py-3">
        <Link to="/posts" search={{}} className={chip(!c)}>All</Link>
        {cats.map((x) => <Link key={x} to="/posts" search={{ c: x }} className={chip(c === x)}>{x}</Link>)}
      </div>
      {list.length === 0 ? <p className="px-4 text-sm text-muted-foreground">Nothing posted here yet.</p> : (
        <div className="grid grid-cols-1 gap-y-6 pb-6 sm:grid-cols-2 sm:gap-x-4 sm:px-4 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => <PostTile key={p.id} post={p} />)}
        </div>
      )}
    </Page>
  );
}
