// Pure, testable job-queue rules shared by the SQS producer/consumer.
import type { SearchJob } from "./search-index";

export const MAX_RECEIVES = 5; // after this many failed deliveries a message is dead-lettered
export type QueueJob = SearchJob & { v: 1 };

/** Idempotency key: the same logical job always maps to the same key, so duplicate deliveries are skipped. */
export function jobKey(j: SearchJob): string {
  return j.kind === "reconcile" ? "reconcile" : `${j.kind}:${j.type}:${j.id}`;
}
export function parseJob(body: string): QueueJob | null {
  try {
    const j = JSON.parse(body);
    if (j?.v !== 1) return null;
    if (j.kind === "reconcile") return j;
    if ((j.kind === "index" || j.kind === "delete") && (j.type === "movie" || j.type === "tv") && Number.isInteger(j.id) && j.id > 0) return j;
    return null;
  } catch { return null; }
}
/** Exponential backoff with full jitter, in seconds, capped at 15 minutes (SQS visibility limit we allow). */
export function backoffSeconds(receiveCount: number, rand = Math.random()): number {
  const cap = Math.min(900, 10 * 2 ** Math.max(0, receiveCount - 1));
  return Math.max(1, Math.floor(cap * rand));
}
/** What to do with a failed message. Permanent errors and exhausted retries go to the dead-letter list. */
export function failureAction(receiveCount: number, permanent: boolean): "retry" | "dead" {
  return permanent || receiveCount >= MAX_RECEIVES ? "dead" : "retry";
}
