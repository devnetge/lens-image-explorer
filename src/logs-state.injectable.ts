import { getInjectable2 } from "@k8slens/injectable";
import { runKubectlInjectionToken } from "@k8slens/kubectl-contracts";
import { appsV1, coreV1, kubeResourcesInjectionToken, podKind, replicaSetKind } from "@k8slens/kubernetes-contracts";
import { action, computed, observable, onBecomeObserved, onBecomeUnobserved, runInAction } from "mobx";
import type { Subscribable } from "@k8slens/subscribable";
import { collectContainerImages } from "./image-model";
import { filterPodsByWorkload, listWorkloads, type WorkloadPodLike, type ReplicaSetLike } from "./workload-model";
import { createResourceState } from "./resource-state";
import { mergeLogSnapshots, collectLogs, type LogSnapshot, type RunLogs } from "./log-collector";
import { emptyLogFilter, LOG_LIMITS, matchesLog, type LogEntry, type LogFilter } from "./log-model";

export function createLogsState(run: RunLogs, loadPods: () => Subscribable<readonly WorkloadPodLike[]>, loadReplicas: () => Subscribable<readonly ReplicaSetLike[]>) {
  const pods = createResourceState(loadPods);
  const replicas = createResourceState(loadReplicas);
  const snapshot = observable.box<LogSnapshot | undefined>(undefined, { deep: false });
  const busy = observable.box(false);
  const auto = observable.box(false);
  const scope = observable.box({ namespace: "", image: "", workload: "" }, { deep: false });
  const filter = observable.box<LogFilter>(emptyLogFilter(), { deep: false });
  const range = observable.box(900);
  const page = observable.box(0);
  const anchor = observable.box<string | undefined>(undefined);
  const selected = observable.box<LogEntry | undefined>(undefined, { deep: false });
  const facetsOpen = observable.box(true);
  const wrap = observable.box(false);
  const showNamespace = observable.box(true);
  const showPod = observable.box(true);
  const notice = observable.box("");
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let observed = false;
  const inventory = computed(() => {
    const all = pods.read([]);
    const namespacePods = all.filter(p => !scope.get().namespace || p.metadata?.namespace === scope.get().namespace);
    const scopedPods = filterPodsByWorkload(namespacePods, replicas.read([]), "", scope.get().workload);
    const containers = collectContainerImages(scopedPods, false).filter(c => c.state !== "waiting");
    return { namespaces: [...new Set(all.map(p => p.metadata?.namespace).filter((n): n is string => Boolean(n)))].sort(),
      images: [...new Set(containers.map(c => c.requestedImage))].sort(), workloads: listWorkloads(namespacePods, replicas.read([]), [], []),
      sources: containers.filter(c => !scope.get().image || c.requestedImage === scope.get().image) };
  });
  const cancel = () => { generation++; controller?.abort(); controller = undefined; clearTimeout(timer); timer = undefined; };
  const refresh = async () => {
    if (!observed || busy.get()) return;
    clearTimeout(timer); timer = undefined;
    const current = ++generation;
    const abort = new AbortController(); controller = abort;
    runInAction(() => { busy.set(true); notice.set(""); });
    try {
      const value = await collectLogs(run, inventory.get().sources, abort.signal, range.get());
      if (generation === current) runInAction(() => { const firstVisible = view.get().rows[0]?.id;
        snapshot.set(mergeLogSnapshots(snapshot.get(), value));
        anchor.set(firstVisible); });
    } catch {
      if (generation === current && !abort.signal.aborted) runInAction(() => notice.set("Unable to collect logs. Check cluster connectivity and try again."));
    } finally {
      // Keep the single-flight guard until all cancelled workers have settled too.
      controller = undefined;
      runInAction(() => busy.set(false));
      if (auto.get() && observed) timer = setTimeout(() => void refresh(), LOG_LIMITS.refreshMs);
    }
  };
  const stop = () => {
    observed = false; cancel();
    pods.stop(); replicas.stop();
    runInAction(() => { auto.set(false); snapshot.set(undefined); selected.set(undefined); });
  };
  const matching = computed(() => snapshot.get()?.entries.filter(e => matchesLog(e, filter.get())) ?? []);
  const facetValues = computed(() => {
    const result: Record<string, { value: string; count: number }[]> = {};
    for (const field of ["namespace", "pod", "container", "image", "severity"] as const) {
      const counts = new Map<string, number>();
      const relaxed = { ...filter.get(), [field]: "" };
      for (const e of snapshot.get()?.entries ?? []) if (matchesLog(e, relaxed)) {
        const value = field === "severity" ? e.severity : field === "namespace" ? e.source.namespace : field === "pod" ? e.source.podName : field === "container" ? e.source.containerName : e.source.requestedImage;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      result[field] = [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    return result;
  });
  const view = computed(() => {
    const entries = matching.get();
    const pages = Math.max(1, Math.ceil(entries.length / LOG_LIMITS.page));
    const anchoredIndex = anchor.get() ? entries.findIndex(e => e.id === anchor.get()) : -1;
    const start = anchoredIndex >= 0 ? anchoredIndex : Math.min(page.get(), pages - 1) * LOG_LIMITS.page;
    const currentPage = Math.floor(start / LOG_LIMITS.page);
    const finite = entries.filter(e => e.timestamp);
    const first = finite[0]?.time ?? 0, last = finite.at(-1)?.time ?? first;
    const width = Math.max(1, Math.ceil((last - first + 1) / 40));
    const buckets = Array.from({ length: 40 }, (_, i) => ({ from: first + i * width, to: first + (i + 1) * width - 1, total: 0, error: 0 }));
    for (const e of finite) { const b = buckets[Math.min(39, Math.floor((e.time - first) / width))]; b.total++; if (e.severity === "error") b.error++; }
    return { inventory: inventory.get(), snapshot: snapshot.get(), busy: busy.get(), auto: auto.get(), scope: scope.get(), filter: filter.get(), range: range.get(),
      selected: selected.get(), facetsOpen: facetsOpen.get(), facets: facetValues.get(), wrap: wrap.get(), showNamespace: showNamespace.get(), showPod: showPod.get(), notice: notice.get(),
      podError: Boolean(pods.error.get()), metadataPending: !pods.data.get() && !pods.error.get(), workloadError: Boolean(replicas.error.get()),
      matched: entries.length, rows: entries.slice(start, start + LOG_LIMITS.page), pages, page: currentPage, buckets,
      context: selected.get() ? (snapshot.get()?.entries.filter(e => e.source.id === selected.get()!.source.id) ?? []).filter(e => e.time >= selected.get()!.time - 30000 && e.time <= selected.get()!.time + 30000).slice(-30) : [] };
  });
  onBecomeObserved(view, () => {
    observed = true; pods.start(); replicas.start();
    // Source membership updates are picked up on the next read, without interrupting a slow one.

  });
  onBecomeUnobserved(view, stop);
  const setFilter = action((field: keyof LogFilter, value: string | number) => {
    filter.set({ ...filter.get(), [field]: typeof value === "string" ? value.slice(0, 2048) : value }); page.set(0); anchor.set(undefined);
  });
  return { view, snapshot, matching, stop, refresh, setFilter,
    setScope: action((field: "namespace" | "image" | "workload", value: string) => {
      cancel(); auto.set(false); snapshot.set(undefined); selected.set(undefined); page.set(0); anchor.set(undefined); filter.set(emptyLogFilter());
      scope.set(field === "namespace" ? { namespace: value, image: "", workload: "" } : { ...scope.get(), [field]: value });
    }),
    setRange: action((value: number) => { if (![300, 900, 3600, 86400].includes(value)) return; cancel(); auto.set(false); snapshot.set(undefined); selected.set(undefined); range.set(value); anchor.set(undefined); page.set(0); filter.set(emptyLogFilter()); }),
    setAuto: action(() => { auto.set(!auto.get()); if (auto.get()) void refresh(); else cancel(); }),
    pause: action(() => { auto.set(false); cancel(); }),
    select: action((entry: LogEntry | undefined) => { selected.set(entry); if (entry) { auto.set(false); cancel(); } }),
    reset: action(() => { filter.set(emptyLogFilter()); page.set(0); anchor.set(undefined); }),
    setPage: action((value: number) => { auto.set(false); cancel(); anchor.set(undefined); page.set(Math.max(0, value)); }),
    toggleFacets: action(() => facetsOpen.set(!facetsOpen.get())), toggleWrap: action(() => wrap.set(!wrap.get())),
    toggleNamespace: action(() => showNamespace.set(!showNamespace.get())), togglePod: action(() => showPod.set(!showPod.get())),
    copy: async (value: string) => { try { await navigator.clipboard.writeText(value); runInAction(() => notice.set("Copied.")); } catch { runInAction(() => notice.set("Copy failed. Select the text and copy with your keyboard.")); } },
    retryMetadata: () => { pods.refresh(); replicas.refresh(); },
  };
}
export const logsStateInjectable = getInjectable2({
  id: "lens-image-explorer-logs-state",
  consumptions: [runKubectlInjectionToken, kubeResourcesInjectionToken],
  instantiate: di => {
    const runFor = di.inject(runKubectlInjectionToken);
    const resources = di.inject(kubeResourcesInjectionToken)();
    return (clusterId: string) => createLogsState(runFor(clusterId), () => resources(podKind, coreV1, clusterId), () => resources(replicaSetKind, appsV1, clusterId));
  },
});
