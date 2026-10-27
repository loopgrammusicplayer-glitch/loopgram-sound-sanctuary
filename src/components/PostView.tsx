// Shared post display: one player for uploads, direct files and platform links (YouTube, Vimeo, Twitch…).
import { useEffect, useState } from "react";
import { Pin } from "lucide-react";
import type { PostT } from "@/lib/posts";
import { parseVideoSource } from "@/lib/video-source";

function useHost() {
  const [h, setH] = useState("localhost");
  useEffect(() => setH(window.location.hostname), []);
  return h;
}

export function SourceBadge({ url, className = "" }: { url: string; className?: string }) {
  if (!url) return null;
  const s = parseVideoSource(url);
  const label = s.provider === "file" ? "HD Video" : s.provider === "unknown" ? "Loopgram" : s.label;
  return <span className={`rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary ${className}`}>{label}</span>;
}

/** True when a player message reports that the video can't play in the embed. */
function isEmbedError(data: unknown): boolean {
  let d: unknown = data;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return /error|forbidden|restricted/i.test(d as string); } }
  if (!d || typeof d !== "object") return false;
  const o = d as { event?: unknown; method?: unknown };
  if (o.event === "error" || o.event === "onError" || o.method === "error") return true; // Vimeo / YouTube
  if (typeof o.event === "string" && /error/i.test(o.event)) return true; // Dailymotion & others
  return false;
}

export function PostVideo({ url, poster }: { url: string; poster?: string }) {
  const parent = useHost();
  const src = parseVideoSource(url, { parent });
  const [ratio, setRatio] = useState(16 / 9);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  useEffect(() => {
    if (!src.embed) return;
    let origin = "";
    try { origin = new URL(src.embed).origin; } catch { return; }
    const onMsg = (e: MessageEvent) => { if (e.origin === origin && isEmbedError(e.data)) setFailed(true); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [src.embed]);
  if (src.embed) {
    // X posts are tall cards, not 16:9 videos.
    const box = src.provider === "twitter" ? "h-[620px]" : "aspect-video";
    if (failed) {
      const pic = poster || src.thumb;
      return (
        <div className="relative grid aspect-video w-full place-items-center overflow-hidden bg-black sm:rounded-xl">
          {pic && <img src={pic} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
          <div className="relative flex flex-col items-center gap-3 p-4 text-center">
            <p className="text-sm font-semibold text-primary-foreground">This video can't play here</p>
            <div className="flex flex-wrap justify-center gap-2">
              <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Watch on {src.label} ↗</a>
              <button onClick={() => setFailed(false)} className="rounded-full bg-secondary px-4 py-2 text-sm font-medium">Try again</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className={`w-full overflow-hidden bg-black sm:rounded-xl ${box}`}>
        <iframe src={src.embed} title={src.label} loading="lazy" className="block h-full w-full border-0" allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }
  // Native file: fill the full width at the video's own shape (no side bars); only very tall videos are capped.
  return (
    <div className="w-full overflow-hidden bg-black sm:rounded-xl" style={{ aspectRatio: String(ratio), maxHeight: ratio < 1 ? "80vh" : undefined }}>
      <video src={url} poster={poster || undefined} controls playsInline preload="metadata" className={`block h-full w-full ${ratio < 1 ? "object-contain" : "object-cover"}`}
        onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setRatio(Math.min(4, Math.max(0.25, v.videoWidth / v.videoHeight))); }} />
    </div>
  );
}

/** Picture for a post: its image, else the platform thumbnail or a frame from its video, else the title. */
export function PostThumb({ post, className = "" }: { post: Pick<PostT, "imageUrl" | "videoUrl" | "title" | "text">; className?: string }) {
  if (post.imageUrl) return <img src={post.imageUrl} alt="" loading="lazy" className={`object-cover ${className}`} />;
  if (post.videoUrl) {
    const s = parseVideoSource(post.videoUrl);
    if (s.thumb) return <img src={s.thumb} alt="" loading="lazy" className={`object-cover ${className}`} />;
    if (!s.embed) return <video src={`${post.videoUrl}#t=1`} preload="metadata" muted playsInline className={`pointer-events-none object-cover ${className}`} />;
  }
  return <div className={`grid place-items-center bg-secondary p-2 text-center text-xs font-semibold ${className}`}>{post.title || post.text.slice(0, 60) || "Video"}</div>;
}

export function PostCard({ post }: { post: PostT }) {
  return (
    <article id={post.id} className="-mx-4 scroll-mt-20 border-b pb-4 sm:mx-0 sm:rounded-2xl sm:border sm:bg-card sm:p-4 [&>*:not(.post-media)]:px-4 sm:[&>*:not(.post-media)]:px-0">
      {post.videoUrl ? <div className="post-media mb-3"><PostVideo url={post.videoUrl} poster={post.imageUrl} /></div>
        : post.imageUrl ? <img src={post.imageUrl} alt={post.title} loading="lazy" className="post-media mb-3 w-full object-contain sm:rounded-xl" /> : null}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {post.pinned && <span className="inline-flex items-center gap-1 text-primary"><Pin className="h-3 w-3" />Pinned</span>}
        {post.category && <span className="rounded-full bg-secondary px-2 py-0.5">{post.category}</span>}
        <SourceBadge url={post.videoUrl} />
        <time dateTime={new Date(post.createdAt).toISOString()}>{new Date(post.createdAt).toLocaleDateString()}</time>
      </div>
      {post.title && <h2 className="mb-1 text-lg font-bold">{post.title}</h2>}
      {post.text && <p className="whitespace-pre-line text-sm">{post.text}</p>}
    </article>
  );
}
