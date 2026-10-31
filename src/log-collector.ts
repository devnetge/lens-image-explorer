import { LOG_LIMITS, parseLogs, sortLogs, type LogEntry, type LogSource } from "./log-model";
export type RunLogs = (args: string[], options: { signal: AbortSignal }) => Promise<string>;
export interface SourceResult { readonly source: LogSource; readonly status: "ready" | "forbidden" | "missing" | "error" | "timeout"; readonly limited: boolean }
export interface LogSnapshot { readonly entries: readonly LogEntry[]; readonly sources: readonly SourceResult[]; readonly omittedSources: number; readonly dropped: number; readonly collectedAt: number }
const name = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
export function logArgs(source: LogSource, sinceSeconds: number): string[] {
  if (![source.namespace, source.podName, source.containerName].every(value => value.length <= 253 && name.test(value))) throw new Error("Invalid log source");
  return ["logs", source.podName, "--namespace", source.namespace, "--container", source.containerName, "--timestamps=true", "--tail=400", "--limit-bytes=131072", `--since=${Math.min(86400, Math.max(60, Math.floor(sinceSeconds) || 900))}s`, `--request-timeout=${sinceSeconds >= 3600 ? 60 : 15}s`];
}
function abortError() { return new DOMException("Log collection stopped", "AbortError"); }
async function readSource(run: RunLogs, source: LogSource, signal: AbortSignal, since: number) {
  const controller = new AbortController();
  let timedOut = false;
  let rejectAbort!: (error: unknown) => void;
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(); rejectAbort(abortError()); };
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort(); }, since >= 3600 ? LOG_LIMITS.longRequestMs : LOG_LIMITS.requestMs);
  try {
    if (signal.aborted) throw abortError();
    const output = await Promise.race([run(logArgs(source, since), { signal: controller.signal }), cancelled]);
    if (signal.aborted) throw abortError();
    // Defense against a transport ignoring --limit-bytes. Bound parsing as well as retention.
    const encoded = new TextEncoder().encode(output.slice(0, LOG_LIMITS.sourceBytes));
    const bounded = new TextDecoder().decode(encoded.subarray(0, LOG_LIMITS.sourceBytes));
    const entries = parseLogs(bounded, source);
    return { entries, result: { source, status: "ready", limited: output.length >= LOG_LIMITS.sourceBytes || new TextEncoder().encode(bounded).length >= LOG_LIMITS.sourceBytes || entries.length >= LOG_LIMITS.tail || entries.some(e => e.truncated) } as SourceResult };
  } catch (error) {
    if (signal.aborted) throw abortError();
    const message = error instanceof Error ? error.message : "";
    // Do not surface raw stderr: it may include credentials or unrelated context.
    const status = timedOut ? "timeout" : /forbidden|unauthorized/i.test(message) ? "forbidden" : /notfound|not found/i.test(message) ? "missing" : "error";
    return { entries: [], result: { source, status, limited: false } as SourceResult };
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
export async function collectLogs(run: RunLogs, sources: readonly LogSource[], signal: AbortSignal, since = 900): Promise<LogSnapshot> {
  if (signal.aborted) throw abortError();
  const unique = new Map<string, LogSource>();
  for (const source of sources) if (!unique.has(source.id)) unique.set(source.id, source);
  const selected = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, LOG_LIMITS.sources);
  const results: { entries: LogEntry[]; result: SourceResult }[] = new Array(selected.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(selected.length, LOG_LIMITS.concurrent) }, async () => {
    while (next < selected.length) {
      if (signal.aborted) throw abortError();
      const index = next++;
      results[index] = await readSource(run, selected[index], signal, since);
    }
  }));
  if (signal.aborted) throw abortError();
  const all = sortLogs(results.flatMap(result => result.entries));
  const entries: LogEntry[] = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  for (let i = all.length - 1; i >= 0 && entries.length < LOG_LIMITS.entries; i--) {
    const size = encoder.encode(all[i].message).length;
    if (bytes + size > LOG_LIMITS.retainedBytes) break;
    bytes += size; entries.push(all[i]);
  }
  return { entries: entries.reverse(), sources: results.map(r => r.result), omittedSources: unique.size - selected.length, dropped: all.length - entries.length, collectedAt: Date.now() };
}

/** Merge overlapping bounded reads without replacing retained rows or collapsing repeated lines. */
export function mergeLogSnapshots(previous: LogSnapshot | undefined, incoming: LogSnapshot): LogSnapshot {
  if (!previous) return incoming;
  const identity = (entry: LogEntry) => JSON.stringify([entry.source.id, entry.source.requestedImage, entry.timestamp, entry.message, entry.truncated]);
  const existing = new Map<string, LogEntry[]>();
  let ordinal = 0;
  for (const entry of previous.entries) {
    const key = identity(entry);
    const group = existing.get(key) ?? [];
    group.push(entry); existing.set(key, group);
    ordinal = Math.max(ordinal, Number(entry.id.slice(entry.id.lastIndexOf(":") + 1)) || 0);
  }
  const occurrences = new Map<string, number>();
  const merged = [...previous.entries];
  for (const entry of incoming.entries) {
    const key = identity(entry);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    if (occurrence < (existing.get(key)?.length ?? 0)) continue;
    merged.push({ ...entry, id: `${entry.source.id}:${++ordinal}` });
  }
  sortLogs(merged);
  const retained: LogEntry[] = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  for (let i = merged.length - 1; i >= 0 && retained.length < LOG_LIMITS.entries; i--) {
    const size = encoder.encode(merged[i].message).length;
    if (bytes + size > LOG_LIMITS.retainedBytes) break;
    retained.push(merged[i]); bytes += size;
  }
  return { ...incoming, entries: retained.reverse(), dropped: previous.dropped + incoming.dropped + merged.length - retained.length };
}
