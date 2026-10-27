// Site-wide background heartbeat: at most once a minute (Redis gate shared by every server instance)
// it runs one resumable TMDB import step and drains a small batch of queued jobs.
// Runs after the response via waitUntil, so visitors never wait for it. Every step is idempotent,
// so an instance being stopped mid-run only means the same work is retried next minute.
import { onceEvery, redis } from "./backend.server";

export async function heartbeat() {
  if (!onceEvery("heartbeat", 30_000)) return; // cheap local gate before touching Redis
  const go = await redis(["SET", "lg:heartbeat", "1", "NX", "EX", 60]).catch(() => null);
  if (go !== "OK") return;
  const { log, flushLogs } = await import("./log.server");
  try {
    const { importStep } = await import("./tmdb-import.server");
    const { refreshStep } = await import("./tmdb-import.server");
    // 3-hour refresh of the newest lists runs first; the long full-catalogue walk continues after it.
    const refresh = await refreshStep(10).catch((e) => ({ error: String(e).slice(0, 200) }));
    const step = await importStep(10).catch((e) => ({ error: String(e).slice(0, 200) }));
    const { processBatch } = await import("./sqs.server");
    const { handleSearchJob } = await import("./algolia.server");
    const batch = await Promise.all([1, 2, 3].map(() => processBatch(handleSearchJob, 10))).catch((e) => ({ error: String(e).slice(0, 200) }));
    log("info", "heartbeat", { refresh, step, batch });
  } finally {
    await flushLogs().catch(() => {});
  }
}
