import { Div } from "@k8slens/element-components";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import type { CSSProperties, KeyboardEvent } from "react";
import { logsStateInjectable } from "./logs-state.injectable";
import { clusterHeadingInjectable } from "./cluster-heading.injectable";
import type { LogFilter } from "./log-model";

const labels = { namespace: "Namespace", pod: "Pod", container: "Container", image: "Image", severity: "Severity" } as const;
const time = (value: string) => value ? value.replace("T", " ").replace("Z", " UTC") : "Time unavailable";
function structuredFields(value: string): [string, string][] {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed).filter(([key, val]) => /^[\w.]+$/.test(key) && ["string", "number", "boolean"].includes(typeof val))
      .slice(0, 30).map(([key, val]) => [key, String(val).slice(0, 512)]);
  } catch { return []; }
}
function formatted(value: string) { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } }
export const LogsView = observer(({ clusterId }: { clusterId: string }) => {
  const state = useSyncInject(logsStateInjectable, clusterId);
  const v = state.view.get();
  const cluster = useSyncInject(clusterHeadingInjectable, clusterId).get();
  const snapshot = v.snapshot;
  const successful = snapshot?.sources.filter(s => s.status === "ready").length ?? 0;
  const failed = snapshot?.sources.filter(s => s.status !== "ready") ?? [];
  const chips = Object.entries(v.filter).filter(([, value]) => Boolean(value));
  const maxBucket = Math.max(1, ...v.buckets.map(b => b.total));
  const columns = `190px 85px ${v.showNamespace ? "150px " : ""}${v.showPod ? "230px " : ""}minmax(250px, 1fr)`;
  const style = { "--log-columns": columns } as CSSProperties;
  const rowKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const sibling = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
    if (sibling instanceof HTMLElement) sibling.focus();
  };
  return <Div $className="lle" $backgroundColor="backgroundPrimary" $color="textDefault" style={style}
    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) { event.preventDefault(); event.currentTarget.querySelector<HTMLInputElement>(".lle-search")?.focus(); }
      if (event.key === "Escape") state.select(undefined);
    }}>
    <header className="lle-header">
      <div className="lle-crumb">{cluster} <span> / Workloads / Logs</span></div>
      <div className="lle-headline"><h1>Logs Explorer</h1><span className="lle-mode">Kubernetes pod logs</span>
        <details className="lle-coverage"><summary>{snapshot ? `${successful} / ${snapshot.sources.length} readable containers` : v.metadataPending ? "Discovering containers…" : "Not collected yet"} ▾</summary>
          <div className="lle-popover"><strong>Source coverage</strong>{snapshot ? <ul>{snapshot.sources.map(s => <li key={s.source.id}><span className="lle-mono">{s.source.namespace} / {s.source.podName} / {s.source.containerName}</span><span>{s.status === "ready" ? "Loaded" : s.status === "forbidden" ? "Log access denied" : s.status === "missing" ? "Source no longer exists" : s.status === "timeout" ? "Timed out" : "Read failed"}{s.limited ? " · Limited" : ""}</span></li>)}</ul> : <p>Choose a scope and load logs.</p>}<p>Snapshots of available pod logs. No indexed history; coverage may be partial.</p></div>
        </details>
        <div className="lle-actions"><label>Range <select aria-label="Log retrieval range" value={v.range} onChange={e => state.setRange(Number(e.target.value))}><option value={300}>Last 5 minutes</option><option value={900}>Last 15 minutes</option><option value={3600}>Last hour</option><option value={86400}>Last 24 hours</option></select></label>
          <button type="button" className="lle-load-primary" disabled={v.metadataPending || !v.inventory.sources.length || v.busy} onClick={() => void state.refresh()}>{v.busy ? "Loading…" : "Load / Refresh"}</button>
          <button type="button" aria-pressed={v.auto} disabled={v.metadataPending || !v.inventory.sources.length} onClick={state.setAuto}>{v.auto ? "◉ Auto-refresh · Pause" : "Auto-refresh off"}</button>
          {v.busy && <button type="button" onClick={state.pause}>Stop</button>}
        </div>
      </div>
      <div className="lle-scope">
        <label>Namespace<select value={v.scope.namespace} onChange={e => state.setScope("namespace", e.target.value)}><option value="">All namespaces</option>{v.inventory.namespaces.map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Workload<select value={v.scope.workload} onChange={e => state.setScope("workload", e.target.value)}><option value="">All observed workloads</option>{v.inventory.workloads.map(w => <option value={w.id} key={w.id}>{w.namespace} / {w.kind} / {w.name}</option>)}</select></label>
        <label>Image<select value={v.scope.image} onChange={e => state.setScope("image", e.target.value)}><option value="">All images</option>{v.inventory.images.map(i => <option key={i}>{i}</option>)}</select></label>
        <span className="lle-muted">{v.inventory.sources.length} eligible containers · up to 20 per snapshot</span>
      </div>
    </header>
    <div className="lle-searchbar"><button type="button" aria-expanded={v.facetsOpen} onClick={state.toggleFacets}>☷ Filters</button>
      <input className="lle-search" aria-label="Search loaded logs" maxLength={2048} placeholder="Search loaded logs · text or JSON field:value (status:504)" value={v.filter.text} onChange={e => state.setFilter("text", e.target.value)} />
      {chips.length > 0 && <button type="button" className="lle-link" onClick={state.reset}>Clear all ({chips.length})</button>}
      {chips.length > 0 && <div className="lle-chips">{chips.map(([field, value]) => <button type="button" key={field} title={String(value)} onClick={() => state.setFilter(field as keyof LogFilter, typeof value === "number" ? 0 : "")}>{field}: {typeof value === "number" ? new Date(value).toISOString() : value} ×</button>)}</div>}
    </div>
    <div className="lle-body">
      {v.facetsOpen && <aside className="lle-facets" aria-label="Loaded log filters">{Object.entries(labels).map(([field, label]) => <details key={field} open><summary>{label}</summary><div>{v.facets[field].slice(0, 60).map(f => <button type="button" className={v.filter[field as keyof LogFilter] === f.value ? "active" : ""} key={f.value} aria-pressed={v.filter[field as keyof LogFilter] === f.value} title={f.value} onClick={() => state.setFilter(field as keyof LogFilter, v.filter[field as keyof LogFilter] === f.value ? "" : f.value)}><span>{f.value || "Unknown"}</span><small>{f.count}</small></button>)}{!v.facets[field].length && <p className="lle-muted">No loaded values</p>}{v.facets[field].length > 60 && <p className="lle-muted">Top 60 values shown. Use search to narrow.</p>}</div></details>)}<p className="lle-muted">Counts reflect loaded entries matching the other filters.</p></aside>}
      <main className="lle-main">
        {(v.podError || v.workloadError) && <div className="lle-banner" role="status">{v.podError ? "Pod metadata unavailable. Check cluster connection and Pod read access." : "Some workload metadata is unavailable; image and namespace scope remain usable."}<button type="button" onClick={state.retryMetadata}>Retry metadata</button></div>}
        {(failed.length > 0 || Boolean(snapshot?.omittedSources) || Boolean(snapshot?.dropped) || snapshot?.sources.some(s => s.limited)) && <div className="lle-banner" role="status"><strong>Partial results</strong> · {failed.length} source reads failed{snapshot?.omittedSources ? ` · ${snapshot.omittedSources} containers excluded by the 20-source limit; narrow the scope` : ""}{snapshot?.dropped ? ` · ${snapshot.dropped} oldest entries dropped to stay within memory limits` : ""}{snapshot?.sources.some(s => s.limited) ? " · Some containers reached the line/byte limit. Older data may not be loaded." : ""}</div>}
        {v.notice && <div className="lle-notice" role="status">{v.notice}</div>}
        {snapshot && <section className="lle-timeline" aria-label="Loaded log timeline"><div><strong>Loaded logs</strong><span className="lle-muted">Click a bucket to filter · UTC · errors in red</span></div><div className="lle-bars">{v.buckets.map((b, i) => <button type="button" key={i} disabled={!b.total} title={`${new Date(b.from).toISOString()} · ${b.total} entries, ${b.error} errors`} aria-label={`${b.total} entries from ${new Date(b.from).toISOString()}`} onClick={() => { state.setFilter("from", b.from); state.setFilter("to", b.to); }}><i style={{ height: `${Math.max(2, b.total / maxBucket * 100)}%` }}><em style={{ height: `${b.total ? b.error / b.total * 100 : 0}%` }} /></i></button>)}</div><div className="lle-timeline-foot"><span>{snapshot.entries.find(e => e.timestamp)?.timestamp || "No timestamps"}</span><span>{snapshot.entries.filter(e => e.timestamp).at(-1)?.timestamp}</span></div></section>}
        <div className="lle-results"><span role="status"><strong>{v.matched.toLocaleString()}</strong> matching entries <span className="lle-muted">/ {snapshot?.entries.length.toLocaleString() ?? 0} loaded{snapshot ? ` · updated ${new Date(snapshot.collectedAt).toLocaleTimeString()}` : ""}</span></span><div><button type="button" aria-pressed={v.wrap} onClick={state.toggleWrap}>Wrap</button><details className="lle-columns"><summary>Columns</summary><div className="lle-popover"><label><input type="checkbox" checked={v.showNamespace} onChange={state.toggleNamespace} />Namespace</label><label><input type="checkbox" checked={v.showPod} onChange={state.togglePod} />Pod / container</label></div></details></div></div>
        <div className="lle-logscroll" onWheel={v.auto ? state.pause : undefined}>
          {v.metadataPending ? <div className="lle-empty" role="status"><h2>Loading container metadata…</h2></div> : !snapshot ? <div className="lle-empty"><h2>{v.busy ? "Collecting log snapshots…" : "Choose a scope, then load logs"}</h2><p>{v.inventory.sources.length ? "Narrow by namespace, workload or image to focus your investigation." : "No eligible containers in this scope."}</p>{!v.busy && v.inventory.sources.length > 0 && <button type="button" className="lle-load-primary lle-load-cta" onClick={() => void state.refresh()}>{v.inventory.sources.length > 20 ? "Load first 20 containers" : "Load scoped logs"}</button>}<p>Up to 400 lines / 128 KB per container. Auto-refresh uses a new bounded snapshot every 10 seconds after completion; gaps are possible.</p></div> : !v.rows.length ? <div className="lle-empty"><h2>{successful ? "No matching log entries" : "No readable log sources"}</h2><p>{successful ? "Try clearing filters, widening the retrieval range, or refreshing." : "Open source coverage for read failures. Check pod-log permissions and connectivity."}</p>{chips.length > 0 && <button type="button" onClick={state.reset}>Clear filters</button>}</div> : <><div className="lle-row lle-tablehead"><span>Time (UTC)</span><span>Severity</span>{v.showNamespace && <span>Namespace</span>}{v.showPod && <span>Pod / container</span>}<span>Message</span></div>
          {v.rows.map(entry => <button type="button" key={entry.id} className={`lle-row lle-logrow ${v.wrap ? "wrap" : ""} ${v.selected === entry ? "selected" : ""}`} aria-label={`${entry.severity}: ${entry.message.slice(0, 160)}`} onKeyDown={rowKeys} onClick={() => state.select(entry)}><time className="lle-mono" title={time(entry.timestamp)}>{entry.timestamp ? entry.timestamp.slice(11).replace("Z", "") : "Unavailable"}</time><span className={`lle-severity ${entry.severity}`}>{entry.severity}</span>{v.showNamespace && <span title={entry.source.namespace}>{entry.source.namespace}</span>}{v.showPod && <span title={`${entry.source.podName} / ${entry.source.containerName}`}>{entry.source.podName}<small>{entry.source.containerName}</small></span>}<span className="lle-message">{entry.message}{entry.truncated && " [line truncated]"}</span></button>)}</>}
        </div>
        <footer className="lle-footer"><span>{v.busy ? "Reading logs · next refresh waits until this read finishes" : v.auto ? "Auto-refresh on · inspecting or scrolling pauses it" : "Auto-refresh off · snapshot held"}</span><div><button type="button" disabled={v.page === 0} onClick={() => state.setPage(v.page - 1)}>Previous</button><span>Page {v.page + 1} / {v.pages}</span><button type="button" disabled={v.page + 1 >= v.pages} onClick={() => state.setPage(v.page + 1)}>Next</button></div></footer>
      </main>
      {v.selected && <aside className="lle-drawer" aria-label="Log entry details"><div className="lle-drawerhead"><strong>Log details</strong><button type="button" aria-label="Close log details" onClick={() => state.select(undefined)}>×</button></div><div className="lle-drawerbody"><time>{time(v.selected.timestamp)}</time><p><span className={`lle-severity ${v.selected.severity}`}>{v.selected.severity}</span> · {v.selected.severityEvidence}</p><button type="button" onClick={() => void state.copy(v.selected!.message)}>Copy raw message</button><pre>{formatted(v.selected.message)}</pre>{v.selected.truncated && <p className="lle-banner">This line was truncated to protect memory.</p>}<h3>Structured fields</h3><dl>{structuredFields(v.selected.message).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><button type="button" title="Filter loaded logs by this field" onClick={() => state.setFilter("text", `${key}:${value}`)}>{value}</button></dd></div>)}</dl><h3>Source metadata</h3><dl>{([ ["namespace", v.selected.source.namespace], ["pod", v.selected.source.podName], ["container", v.selected.source.containerName], ["image", v.selected.source.requestedImage] ] as const).map(([field, value]) => <div key={field}><dt>{labels[field]}</dt><dd><button type="button" onClick={() => state.setFilter(field, value)}>{value}</button></dd></div>)}<dt>Node</dt><dd>{v.selected.source.nodeName || "Unavailable"}</dd></dl><h3>Nearby loaded lines · same container</h3><p className="lle-muted">Up to 30 lines within ±30 seconds. Context is limited to this snapshot.</p>{v.context.map(e => <button type="button" className="lle-context" key={e.id} onClick={() => state.select(e)}><time>{e.timestamp.slice(11)}</time> {e.message.slice(0, 300)}</button>)}</div></aside>}
    </div>
  </Div>;
});
