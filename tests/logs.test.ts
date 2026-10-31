import assert from "node:assert/strict";
import { test } from "node:test";
import { autorun, computed } from "mobx";
import { collectLogs, logArgs, mergeLogSnapshots, type LogSnapshot } from "../src/log-collector";
import { LOG_LIMITS, parseLogs, severityOf, matchesLog, emptyLogFilter, type LogSource } from "../src/log-model";
import { createLogsState } from "../src/logs-state.injectable";
import { queryLoadedLogs } from "../src/logs-query.injectable";
const source = (n = 0): LogSource => ({ id: `uid-${String(n).padStart(3, "0")}:container:app`, podUID: `uid-${n}`, namespace: "test", podName: `app-${n}`, containerName: "app", requestedImage: "example/app:1", nodeName: "node-1" });
const line = (n = 0, message = '{"level":"error","status":504,"msg":"timeout"}') => `2026-10-30T08:00:${String(n).padStart(2,"0")}.000000001Z ${message}\n`;
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
test("log parsing preserves source, timestamp precision, unknown severity and literal markup", () => {
  const entries = parseLogs(line() + line(1, "<script>untrusted</script>") + "no timestamp\n", source());
  assert.equal(entries.length, 3); assert.equal(entries[0].timestamp, "2026-10-30T08:00:00.000000001Z");
  assert.equal(entries[0].severity, "error"); assert.equal(entries[1].severity, "unknown");
  assert.equal(entries[2].timestamp, ""); assert.equal(entries[1].source.podUID, "uid-0");
  assert.equal(severityOf("payment error field is optional").severity, "unknown");
  assert.equal(severityOf("WARN retrying").severity, "warn");
  assert.equal(matchesLog(entries[0], { ...emptyLogFilter(), text: "status:504" }), true);
  assert.equal(matchesLog(entries[0], { ...emptyLogFilter(), text: "status:200" }), false);
  assert.equal(matchesLog(entries[0], { ...emptyLogFilter(), namespace: "other" }), false);
  const oversized = parseLogs(line(0, "a".repeat(100000)), source());
  assert.equal(oversized[0].message.length, LOG_LIMITS.messageChars); assert.equal(oversized[0].truncated, true);
});
test("bounded fanout retains deterministic newest entries and exposes partial failures", async () => {
  let active = 0, peak = 0, calls = 0;
  const result = await collectLogs(async args => {
    active++; calls++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    if (args[1] === "app-0") throw new Error("Forbidden: private stderr must not escape");
    return Array.from({ length: 400 }, (_, n) => line(n % 60)).join("");
  }, Array.from({ length: 25 }, (_, i) => source(i)), new AbortController().signal);
  assert.equal(calls, 20); assert.equal(peak, 3); assert.equal(result.omittedSources, 5);
  assert.equal(result.sources[0].status, "forbidden"); assert.equal(result.entries.length, 3000);
  assert.equal(result.dropped, 19 * 400 - 3000); assert.equal(result.sources[1].limited, true);
  assert.equal(JSON.stringify(result).includes("private stderr"), false);
  assert.throws(() => logArgs({ ...source(), podName: "--help" }, 900));
  assert.equal(logArgs(source(), 900).includes("--follow"), false);
});
test("retained Unicode messages obey the byte budget", async () => {
  const result = await collectLogs(async () => Array.from({length:400}, () => line(0,"界".repeat(300))).join(""), Array.from({length:20},(_,i)=>source(i)),new AbortController().signal);
  assert.ok(result.entries.reduce((sum,e)=>sum+new TextEncoder().encode(e.message).length,0) <= LOG_LIMITS.retainedBytes);
  assert.ok(result.sources.every(s=>s.limited));
});
test("cancellation stops scheduling even when a transport ignores abort", async () => {
  let calls = 0;
  const controller = new AbortController();
  const promise = collectLogs(async () => { calls++; return new Promise<string>(() => {}); }, Array.from({length:20},(_,i)=>source(i)),controller.signal);
  controller.abort();
  await assert.rejects(promise, { name: "AbortError" }); assert.equal(calls, 3);
});
function metadata() {
  let disposed = 0;
  const pods = [{ metadata: { uid: "p", name: "app-0", namespace: "test" }, spec: { containers: [{ name: "app", image: "example/app:1" }] }, status: { containerStatuses: [{ name: "app", state: { running: {} } }] } }];
  const resource = <T>(value: T) => ({ isLive: () => true, subscribe: () => ({ value: Promise.resolve(computed(() => value)), claim: () => {}, refresh: () => {}, dispose: () => { disposed++; } }) });
  return { pods: resource(pods), replicas: resource([]), disposed: () => disposed };
}
test("view lifecycle rejects stale completions, avoids overlap and clears loaded logs on release", async () => {
  const meta = metadata(); let calls = 0; let complete!: (text: string) => void;
  const state = createLogsState(async () => { calls++; return new Promise(resolve => { complete = resolve; }); }, () => meta.pods, () => meta.replicas);
  const unobserve = autorun(() => state.view.get()); await tick();
  const first = state.refresh(); await state.refresh(); assert.equal(calls, 1);
  state.setScope("namespace", "other"); complete(line()); await first;
  assert.equal(state.snapshot.get(), undefined);
  state.setScope("namespace", "test"); const second = state.refresh(); complete(line()); await second;
  assert.equal(state.snapshot.get()?.entries.length, 1);
  const query = queryLoadedLogs(state.snapshot.get(), { clusterId: "cluster", query: "status:504" });
  assert.equal(query.entries.length,1); assert.equal(calls,2);
  assert.equal(state.view.get().filter.text, "");
  unobserve(); assert.equal(state.snapshot.get(),undefined); assert.equal(meta.disposed(),2);
});
test("inspection and page changes pause auto refresh without starting extra collection", async () => {
  const meta=metadata(); let calls=0;
  const state=createLogsState(async()=>{calls++;return line();},()=>meta.pods,()=>meta.replicas);
  const release=autorun(()=>state.view.get()); await tick(); state.setAuto(); await tick();
  assert.equal(state.view.get().auto,true); assert.equal(calls,1);
  state.select(state.snapshot.get()!.entries[0]); assert.equal(state.view.get().auto,false);
  state.setAuto(); await tick(); state.setPage(1); assert.equal(state.view.get().auto,false); release();
});
test("loaded-log queries validate bounds and report unavailable snapshots honestly", () => {
  assert.equal(queryLoadedLogs(undefined,{clusterId:"cluster"}).loaded,false);
  assert.throws(()=>queryLoadedLogs(undefined,{clusterId:"cluster",limit:1000}));
  assert.throws(()=>queryLoadedLogs(undefined,{clusterId:"cluster",query:"a".repeat(2049)}));
});

test("request timeout aborts hung sources and returns explicit coverage", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let aborted = false;
  const pending = collectLogs(async (_args, options) => { options.signal.addEventListener("abort", () => { aborted = true; }); return new Promise<string>(() => {}); }, [source()], new AbortController().signal);
  t.mock.timers.tick(LOG_LIMITS.requestMs);
  const result = await pending;
  assert.equal(aborted, true); assert.equal(result.sources[0].status, "timeout"); assert.equal(result.entries.length, 0);
});

test("overlapping refreshes reuse row objects, preserve repeated lines and keep failed-source history", async () => {
  const { mergeLogSnapshots } = await import("../src/log-collector");
  const first = await collectLogs(async () => line(1) + line(1) + line(2), [source()], new AbortController().signal);
  const next = await collectLogs(async () => line(1) + line(1) + line(2) + line(3), [source()], new AbortController().signal);
  const merged = mergeLogSnapshots(first, next);
  assert.equal(merged.entries.length, 4);
  assert.equal(merged.entries[0], first.entries[0]);
  assert.equal(merged.entries[1], first.entries[1]);
  assert.equal(new Set(merged.entries.map(e => e.id)).size, 4);
  const replay = mergeLogSnapshots(merged, next);
  assert.deepEqual(replay.entries, merged.entries);
  const failed = await collectLogs(async () => { throw new Error("Forbidden"); }, [source()], new AbortController().signal);
  const retained = mergeLogSnapshots(replay, failed);
  assert.deepEqual(retained.entries, replay.entries);
  assert.equal(retained.sources[0].status, "forbidden");
});

test("scheduled auto-refresh preserves the current page, row identities, filters and selected details", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const meta = metadata();
  let output = Array.from({length: 160}, (_,i) => line(10, `INFO entry-${i}`)).join("");
  const state = createLogsState(async () => output, () => meta.pods, () => meta.replicas);
  const release = autorun(() => state.view.get());
  try {
    await tick(); await state.refresh();
    state.setFilter("severity", "info"); state.setPage(1);
    const firstRow = state.view.get().rows[0];
    state.select(firstRow);
    output = line(0, "INFO late older entry") + output + line(20, "INFO new entry");
    state.setAuto(); await tick();
    assert.equal(state.view.get().page, 1);
    assert.equal(state.view.get().rows[0], firstRow);
    assert.equal(state.view.get().selected, firstRow);
    assert.equal(state.view.get().filter.severity, "info");
    const count = state.snapshot.get()!.entries.length;
    output += line(21, "INFO another new entry");
    t.mock.timers.tick(LOG_LIMITS.refreshMs); await tick();
    assert.equal(state.snapshot.get()!.entries.length, count + 1);
    assert.equal(state.view.get().rows[0], firstRow);
    assert.equal(state.view.get().page, 1);
  } finally { release(); }
});

test("merging refreshes keeps the entry and byte limits", async () => {
  const { mergeLogSnapshots } = await import("../src/log-collector");
  const first = await collectLogs(async () => Array.from({length:400}, (_,i)=>line(1,`INFO old-${i}`)).join(""),Array.from({length:10},(_,i)=>source(i)),new AbortController().signal);
  const next = await collectLogs(async () => Array.from({length:400}, (_,i)=>line(2,`INFO new-${i}`)).join(""),Array.from({length:10},(_,i)=>source(i)),new AbortController().signal);
  const merged = mergeLogSnapshots(first,next);
  assert.equal(merged.entries.length,LOG_LIMITS.entries);
  assert.ok(merged.dropped > 0);
  assert.ok(merged.entries.reduce((sum,e)=>sum+new TextEncoder().encode(e.message).length,0)<=LOG_LIMITS.retainedBytes);
});

test("a slow 24-hour read does not overlap and the refresh delay starts after completion", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const meta = metadata(); let calls = 0; let finish!: (value: string) => void;
  const state = createLogsState(async args => {
    calls++; assert.ok(args.includes("--since=86400s")); assert.ok(args.includes("--request-timeout=60s"));
    return new Promise(resolve => { finish = resolve; });
  }, () => meta.pods, () => meta.replicas);
  const release = autorun(() => state.view.get());
  try {
    await tick(); state.setRange(86400); state.setAuto();
    assert.equal(calls, 1);
    t.mock.timers.tick(25000); await tick();
    await state.refresh(); assert.equal(calls, 1); assert.equal(state.view.get().busy, true);
    finish(line()); await tick();
    assert.equal(state.view.get().busy, false);
    t.mock.timers.tick(9999); await tick(); assert.equal(calls, 1);
    t.mock.timers.tick(1); await tick(); assert.equal(calls, 2);
    state.pause();
  } finally { release(); }
});

test("cancellation keeps the busy guard until the old collection has settled", async () => {
  const meta = metadata(); let calls = 0;
  const state = createLogsState(async () => { calls++; return new Promise<string>(() => {}); }, () => meta.pods, () => meta.replicas);
  const release = autorun(() => state.view.get());
  try {
    await tick(); const pending = state.refresh();
    state.pause(); const retry = state.refresh();
    assert.equal(state.view.get().busy, true); assert.equal(calls, 1);
    await pending; await retry;
    assert.equal(state.view.get().busy, false);
  } finally { release(); }
});

test("day-range requests receive a longer but bounded timeout", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let aborted = false;
  const pending = collectLogs(async (_args, options) => {
    options.signal.addEventListener("abort", () => { aborted = true; });
    return new Promise<string>(() => {});
  }, [source()], new AbortController().signal, 86400);
  t.mock.timers.tick(15000); await tick(); assert.equal(aborted, false);
  t.mock.timers.tick(45000);
  const result = await pending;
  assert.equal(aborted, true); assert.equal(result.sources[0].status, "timeout");
});

test("fast sources publish bounded results while another source is still pending", async () => {
  let finish!: (value: string) => void;
  const updates: { entries: number; completed: number; total: number }[] = [];
  let settled = false;
  const pending = collectLogs(async args => args[1] === "app-0" ? line() : new Promise(resolve => { finish = resolve; }),
    [source(0), source(1)], new AbortController().signal, 900,
    (snapshot, progress) => updates.push({ entries: snapshot.entries.length, ...progress }));
  void pending.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false);
  assert.deepEqual(updates, [{ entries: 1, completed: 1, total: 2 }]);
  finish(line(1)); await pending;
  assert.deepEqual(updates.at(-1), { entries: 2, completed: 2, total: 2 });
});

test("initial progressive logs survive Stop and late results cannot contaminate a new scope", async () => {
  const meta = metadata(); let calls = 0;
  const twoPods = { ...meta.pods, subscribe: () => ({ value: Promise.resolve(computed(() => [
    { metadata: { uid: "a", name: "app-0", namespace: "test" }, spec: { containers: [{ name: "app", image: "example/app:1" }] } },
    { metadata: { uid: "b", name: "app-1", namespace: "test" }, spec: { containers: [{ name: "app", image: "example/app:1" }] } },
  ])), claim() {}, dispose() {}, refresh() {} }) };
  let finish!: (value: string) => void;
  const state = createLogsState(async args => { calls++; return args[1] === "app-0" ? line() : new Promise(resolve => { finish = resolve; }); }, () => twoPods, () => meta.replicas);
  const release = autorun(() => state.view.get());
  try {
    await tick(); const pending = state.refresh(); await tick();
    assert.equal(calls, 2);
    assert.equal(state.view.get().busy, true);
    assert.equal(state.snapshot.get()?.entries.length, 1);
    assert.deepEqual(state.view.get().progress, { completed: 1, total: 2 });
    state.pause(); await pending;
    assert.equal(state.snapshot.get()?.entries.length, 1);
    assert.match(state.view.get().notice, /Already loaded logs are kept/);
    state.setScope("namespace", "elsewhere");
    finish(line(1)); await tick();
    assert.equal(state.snapshot.get(), undefined);
  } finally { release(); }
});

test("cumulative progress counts discarded lines once and preserves visible row identities", async () => {
  const before = await collectLogs(async () => line(0, "INFO retained before refresh"), [source()], new AbortController().signal);
  let visible: LogSnapshot | undefined = before;
  let retainedRow = before.entries[0];
  const final = await collectLogs(async () => Array.from({ length: 400 }, (_, i) => line(1, `INFO fresh-${i}`)).join(""),
    Array.from({ length: 12 }, (_, i) => source(i)), new AbortController().signal, 900,
    (snapshot, progress) => {
      visible = mergeLogSnapshots(before, snapshot, visible);
      assert.ok(visible.entries.length <= LOG_LIMITS.entries);
      if (progress.completed === 1) retainedRow = visible.entries.at(-1)!;
      if (progress.completed === 2) assert.ok(visible.entries.includes(retainedRow));
    });
  const lastRow = visible!.entries.at(-1)!;
  visible = mergeLogSnapshots(before, final, visible);
  assert.equal(visible.dropped, mergeLogSnapshots(before, final).dropped);
  assert.equal(visible.dropped, 1801);
  assert.equal(visible.entries.at(-1), lastRow);
  assert.equal(new Set(visible.entries.map(e => e.id)).size, visible.entries.length);
});
