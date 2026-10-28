<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Keep the four data flows separate (see docs/ARCHITECTURE.md): ordinary page reads must not touch DynamoDB or R2, so one failing service can't take down pages.
- All TMDB calls go through `tmdb()` in backend.server.ts, which handles the allowlist, caching, request merging and the refresh lock; never fetch TMDB directly.
- YouTube trailers must pass the `resolveVideos()` playability check before they're shown; LOOPGRAM never presents trailers as full movies.
- Paged lists use `useInfiniteList` (src/lib/infinite.ts) + `InfiniteFooter`; one engine keeps dedupe, end detection and retry consistent.
- Full-length playback comes only from the owner's R2 bucket via `findStream()` (playback.server.ts); never embed third-party piracy/"embed provider" sites — titles without an uploaded file fall back to the trailer.
- Search index writes go only through `handleSearchJob()` in algolia.server.ts (admin key, server-only); the browser queries Algolia with the search-only key. One job entry point lets a future SQS worker reuse it.
- Background work goes through `sendJob()`/`processBatch()` (sqs.server.ts) with a Redis done-marker per job key; producers fall back to running inline when the queue is unavailable. Server logs go through `log()` (log.server.ts), which scrubs secrets and ships to CloudWatch best-effort.
- Auth is Firebase email/password; the browser never decides roles. Every Studio server function calls `requireOwner()` (auth.server.ts: verifies the ID token via Google JWKS, owner = OWNER_UID or verified `role: owner` claim, account live, session not revoked). Admin calls use the Identity Toolkit REST API with the service account (no firebase-admin, it doesn't run on workerd).
- Studio audit entries are written only server-side via `audit()`; public site settings (banner, maintenance) live in Redis `site:settings` and maintenance never blocks /login or /studio.
- Constants used by both a route's options (validateSearch, loader) and its component live in `src/lib`, not the route file; the route code-splitter cannot share non-exported route-file constants.
- Studio uploads go browser → R2 via short-lived signed PUT links from `upload.functions.ts`; destination keys come only from `uploadKey()` (upload-keys.ts) so movie/episode files land where `findStream()` looks. Large files never pass through the worker.
- Owner posts live in Redis `site:posts`, read/written only via posts.functions.ts; TMDB master switch is `tmdbEnabled` in `site:settings`, enforced inside `tmdb()` so every caller obeys it.

- TMDB answers are saved permanently (no TTL) in DynamoDB `TMDB#<cacheKey>`/`RESPONSE` via catalog.server.ts; DynamoDB is read only as the last fallback after Redis so the site survives TMDB being off/revoked. Why: owner requires data to outlive TMDB access.
- Periodic work (TMDB import step + SQS drain) runs from `heartbeat()` (heartbeat.server.ts), started via `ctx.waitUntil` in src/server.ts and gated by Redis `lg:heartbeat` (≈1/min across instances). Why: no external scheduler; every step is idempotent so cut-off runs just retry.
- Owner posts are searchable only through the separate Algolia index `loopgram_posts`, written by `syncPost()`/`reconcilePosts()` from the DynamoDB post state (PUBLISHED only). Why: keeps the two content sources distinguishable and drafts out of search.

- Loop Party keeps state only in Redis with TTLs via social.functions.ts; hot reads use a short per-isolate memo and writes use per-IP local rate limits. Why: protects Redis under bursts and keeps DynamoDB/R2 off ordinary page reads.
