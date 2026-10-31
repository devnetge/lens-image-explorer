import type { ContainerImage } from "./image-model";

export type Severity = "error" | "warn" | "info" | "debug" | "unknown";
export type LogSource = Pick<ContainerImage, "id" | "podUID" | "podName" | "namespace" | "containerName" | "requestedImage" | "nodeName">;
export interface LogEntry {
  readonly id: string;
  readonly source: LogSource;
  readonly timestamp: string;
  readonly time: number;
  readonly message: string;
  readonly severity: Severity;
  readonly severityEvidence: string;
  readonly truncated: boolean;
}
export const LOG_LIMITS = Object.freeze({ sources: 20, concurrent: 3, tail: 400, sourceBytes: 128 * 1024,
  entries: 3000, retainedBytes: 4 * 1024 * 1024, messageChars: 16 * 1024, page: 100, requestMs: 15000, longRequestMs: 60000, refreshMs: 10000 });
const levels: Record<string, Severity> = { trace: "debug", debug: "debug", info: "info", warning: "warn", warn: "warn", error: "error", fatal: "error", critical: "error", panic: "error" };
export function severityOf(message: string): { severity: Severity; severityEvidence: string } {
  try {
    const json = JSON.parse(message);
    if (json && typeof json === "object") for (const field of ["level", "severity", "log.level"]) {
      if (typeof json[field] === "string" && levels[json[field].toLowerCase()]) return { severity: levels[json[field].toLowerCase()], severityEvidence: `JSON ${field} field` };
    }
  } catch { /* Plain text remains searchable. */ }
  const prefix = /^(?:\d{4}-\d\d-\d\d[ T][\d:.]+\s+)?(?:\[)?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|CRITICAL)(?:\]|:|\s)/i.exec(message);
  return prefix ? { severity: levels[prefix[1].toLowerCase()], severityEvidence: "Leading level token" }
    : { severity: "unknown", severityEvidence: "No recognized level field or prefix" };
}

/** Kubernetes --timestamps emits one timestamp per physical line; do not guess multiline grouping. */
export function parseLogs(output: string, source: LogSource): LogEntry[] {
  const entries: LogEntry[] = [];
  let start = 0;
  let lineNumber = 0;
  while (start < output.length && entries.length < LOG_LIMITS.tail) {
    const end = output.indexOf("\n", start);
    const stop = end < 0 ? output.length : end;
    const length = stop - start;
    const raw = output.slice(start, Math.min(stop, start + LOG_LIMITS.messageChars + 64)).replace(/\r$/, "");
    start = end < 0 ? output.length : end + 1;
    const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (.*)$/s.exec(raw);
    const timestamp = match && Number.isFinite(Date.parse(match[1])) ? match[1] : "";
    const message = (timestamp ? match![2] : raw).slice(0, LOG_LIMITS.messageChars);
    entries.push({ id: `${source.id}:${lineNumber++}`, source, timestamp, time: timestamp ? Date.parse(timestamp) : 0,
      message, truncated: length > raw.length || message.length < (timestamp ? match![2] : raw).length, ...severityOf(message) });
  }
  return entries;
}
export interface LogFilter { text: string; namespace: string; pod: string; container: string; image: string; severity: string; from: number; to: number }
export const emptyLogFilter = (): LogFilter => ({ text: "", namespace: "", pod: "", container: "", image: "", severity: "", from: 0, to: 0 });
export function matchesLog(entry: LogEntry, filter: LogFilter): boolean {
  if (filter.namespace && entry.source.namespace !== filter.namespace || filter.pod && entry.source.podName !== filter.pod
    || filter.container && entry.source.containerName !== filter.container || filter.image && entry.source.requestedImage !== filter.image
    || filter.severity && entry.severity !== filter.severity || filter.from && entry.time < filter.from || filter.to && entry.time > filter.to) return false;
  const rawQuery = filter.text.trim();
  const query = rawQuery.toLowerCase();
  if (!query) return true;
  const token = /^([\w.]+):(.+)$/.exec(rawQuery);
  if (token) {
    try { const json = JSON.parse(entry.message); return json !== null && typeof json === "object" && Object.hasOwn(json, token[1]) && String(json[token[1]]).toLowerCase().includes(token[2].toLowerCase()); }
    catch { return false; }
  }
  return [entry.message, entry.source.namespace, entry.source.podName, entry.source.containerName, entry.source.requestedImage].some(value => value.toLowerCase().includes(query));
}
export function sortLogs(entries: LogEntry[]): LogEntry[] {
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.source.id.localeCompare(b.source.id) || Number(a.id.slice(a.id.lastIndexOf(":") + 1)) - Number(b.id.slice(b.id.lastIndexOf(":") + 1)));
}
