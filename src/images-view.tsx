import { openImageLogsInjectable } from "./logs-navigation.injectable";
import { Code, Div } from "@k8slens/element-components";
import { ContentCopyIcon } from "@k8slens/icon";
import { PlainButton } from "@k8slens/input-components";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import type { KeyboardEvent, ReactNode, SelectHTMLAttributes } from "react";
import { imageActionsInjectable, imagesStateInjectable, type SizedImageGroup } from "./images-state.injectable";
import { clusterHeadingInjectable } from "./cluster-heading.injectable";
import { RegistryBadges } from "./registry-badges";
import { registryDetailsInjectable } from "./registry-details.injectable";
import type { RegistryDetails } from "./registry-model";
import { NodeRuntime } from "./node-runtime-view";
import { shortImageID } from "./image-model";
import { ImageIcon, ImageSortIcon } from "./images-icons";

export const FullImageID = ({ value, copy }: { value: string; copy: (value: string) => Promise<void> }) => (
  <Div $className="lie-full-id">
    <Code aria-label="Full runtime image ID" $padding="s" $backgroundColor="backgroundPrimary"
      $color={value ? "textDefault" : "textMuted"} $className="lie-runtime-id lie-mono">
      {value || "Not reported yet"}
    </Code>
    <PlainButton Icon={ContentCopyIcon} $disabled={!value} $onClick={() => copy(value)}
      aria-label="Copy full runtime image ID" $tooltip="Copy the complete runtime image ID"
      $padding="xs" $font={{ size: "s" }} $className="lie-copy-id">Copy</PlainButton>
  </Div>
);

const Field = ({ id, label, className, children }: { id: string; label: string; className: string; children: ReactNode }) => (
  <div className={`field ${className}`}><label className="field-label" htmlFor={id}>{label}</label>{children}</div>
);
const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="select-wrap"><select {...props} className="input select" /><span className="select-caret"><ImageIcon name="chevron" /></span></div>
);
const Copy = observer(({ value, copy, clusterId, label = "Copy runtime image ID" }: { value: string; copy: (value: string) => Promise<void>; clusterId: string; label?: string }) => {
  const feedback = useSyncInject(imageActionsInjectable, clusterId).copyFeedback.get();
  const status = feedback?.value === value ? feedback.status : undefined;
  return <span className="copy-wrap"><button type="button" className={`icon-btn copy${status === "copied" ? " copied" : ""}`} disabled={!value} aria-label={label} title={label}
    onClick={() => copy(value)}><ImageIcon name={status === "copied" ? "check" : "copy"} /></button>
    <span className={`copied-tip${status ? "" : " sr-only"}`} role="status" aria-live="polite">{status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : ""}</span></span>;
});
const registryMarks: Partial<Record<RegistryDetails["provider"], string>> = {
  "aws-ecr": "ECR", "aws-ecr-public": "ECR", "docker-hub": "HUB", "google-artifact-registry": "GCP",
  "google-container-registry": "GCP", "github-container-registry": "GH", "azure-container-registry": "ACR", "quay": "QY",
};
const Visibility = ({ details }: { details: RegistryDetails }) => (
  <span className={`vis vis-${details.visibility}`} title={details.tooltip}>
    <ImageIcon name={details.visibility === "private" ? "lock" : details.visibility === "public" ? "globe" : "help"} />
    {details.visibility === "private" ? "Private" : details.visibility === "public" ? "Public" : "Unknown"}
  </span>
);

const ImageUsage = observer(({ group, clusterId, id }: { group: SizedImageGroup; clusterId: string; id: string }) => {
  const actions = useSyncInject(imageActionsInjectable, clusterId);
  const state = useSyncInject(imagesStateInjectable, clusterId);
  const registry = useSyncInject(registryDetailsInjectable, group.requestedImage);
  const labels = state.view.get().workloadLabels;
  const reported = group.variants.filter((variant) => variant.imageID);
  const unreported = group.variants.filter((variant) => !variant.imageID).reduce((count, variant) => count + variant.containers.length, 0);
  return <tr className="detail-row" id={id}><td colSpan={6}><div className="detail">
    <div className="detail-ref"><span className="detail-label">Reference</span><code className="mono wrap">{group.requestedImage}</code>
      <Copy value={group.requestedImage} copy={actions.copyID} clusterId={clusterId} label="Copy image reference" /></div>
    <RegistryBadges details={registry} />
    <section className="detail-sec"><h4 className="detail-h">Runtime image IDs <span className="count">{reported.length}</span></h4>
      {!reported.length && <p className="muted small">No container status reports an image ID. The image may not have been pulled yet.</p>}
      <ul className="rid-list">{reported.map((variant) => <li key={variant.id} className="rid-item">
        <code className="mono wrap" aria-label="Full runtime image ID">{variant.imageID}</code><Copy value={variant.imageID} copy={actions.copyID} clusterId={clusterId} label="Copy full runtime image ID" />
        <span className="rid-meta" title={`Exact image-ID matches for ${variant.size.matchedContainers} of ${variant.size.totalContainers} containers on their nodes.`}>
          {variant.containers.length} container{variant.containers.length === 1 ? "" : "s"} · {variant.size.label}</span>
      </li>)}</ul>
      {reported.length > 0 && unreported > 0 && <p className="note muted">{unreported} container{unreported === 1 ? " has" : "s have"} no reported image ID.</p>}
      {group.multipleIDs && <p className="note warn-text">One reference resolves to {reported.length} different image IDs in scope. Builds, architectures, or runtimes may differ.</p>}
    </section>
    <section className="detail-sec"><h4 className="detail-h">Usages <span className="count">{group.containerCount}</span></h4>
      <div className="usages-wrap"><table className="usages" aria-label={`Container usages for ${group.requestedImage}`}><thead><tr>
        {['Namespace', 'Workload', 'Pod', 'Container', 'Node', 'Node runtime', 'State', 'Image ID'].map((label) => <th key={label} scope="col">{label}</th>)}
      </tr></thead><tbody>{group.variants.flatMap((variant) => variant.containers.map((container) => <tr key={container.id}>
        <td>{container.namespace}</td><td>{labels.get(container.podUID) || <span className="muted">Unavailable</span>}</td>
        <td className="mono"><button type="button" className="link-btn" onClick={() => actions.openPod(container)}>{container.podName}</button></td>
        <td>{container.containerName}{container.kind === "container" ? "" : ` · ${container.kind}`}</td>
        <td className="mono">{container.nodeName || "Not scheduled"}</td><td><NodeRuntime clusterId={clusterId} nodeName={container.nodeName} /></td>
        <td><span className={`state state-${container.state}`}><i aria-hidden="true" />{container.state}{container.state === "running" && !container.ready ? " · not ready" : ""}</span></td>
        <td className="mono" title={container.imageID || undefined}>{container.imageID ? shortImageID(container.imageID) : <span className="muted">—</span>}</td>
      </tr>))}</tbody></table></div>
    </section>
  </div></td></tr>;
});

const ImageRow = observer(({ group, clusterId }: { group: SizedImageGroup; clusterId: string }) => {
  const state = useSyncInject(imagesStateInjectable, clusterId);
  const actions = useSyncInject(imageActionsInjectable, clusterId);
  const registry = useSyncInject(registryDetailsInjectable, group.requestedImage);
  const openLogs = useSyncInject(openImageLogsInjectable, clusterId);
  const expanded = state.expanded.has(group.id);
  const detailID = `lie-detail-${clusterId}-${group.id}`;
  const variants = group.variants.filter((variant) => variant.imageID);
  const namespaces = group.namespaces;
  const nsOpen = state.namespaceExpanded.has(group.id);
  return <><tr className={`ref-row${expanded ? " open" : ""}`}>
    <td className="col-image"><div className="img-cell">
      <button type="button" className="expander" aria-expanded={expanded} aria-controls={detailID} aria-label={`${expanded ? "Collapse" : "Expand"} ${group.requestedImage}`}
        onClick={() => state.toggleExpanded(group.id)}><ImageIcon name="chevron" /></button>
      <span className="reg-mark" role="img" aria-label={registry.providerLabel} title={registry.providerLabel}>{registryMarks[registry.provider] || "?"}</span>
      <div className="img-text"><div className="img-meta"><span className="img-name">{registry.repository || "Unrecognized image reference"}</span><Visibility details={registry} /><button type="button" className="btn-text" aria-label={`Open logs for ${group.requestedImage}`} onClick={() => void openLogs(group.requestedImage).catch(() => undefined)}>Logs</button></div>
        <div className="img-host" title={group.requestedImage}>{registry.registry || "Registry unavailable"}</div>
        {!!state.view.get().matchFields.get(group.id)?.length && <div className="img-match">Matched on {state.view.get().matchFields.get(group.id)!.join(", ")}</div>}
      </div>
    </div></td>
    <td className="col-pin"><div className="mono pin" title={group.pinnedDigest || group.tag}>{group.pinnedDigest ? shortImageID(group.pinnedDigest) : group.tag}</div>
      <div className="sub">{group.pinnedDigest ? `${group.tag === "(implicit)" ? "" : `${group.tag} · `}digest pin` : "tag"}</div></td>
    <td className="col-rid">{!variants.length ? <span className="muted" title="No container status reports an image ID for this reference">Not reported</span> : <>
      <div className="rid-line"><span className="mono" title={variants[0].imageID}>{shortImageID(variants[0].imageID)}</span><Copy value={variants[0].imageID} copy={actions.copyID} clusterId={clusterId} /></div>
      {group.multipleIDs && <button type="button" className="link-btn sub warn" onClick={() => state.toggleExpanded(group.id)} aria-expanded={expanded} aria-controls={detailID}>{variants.length} different IDs</button>}
      {variants.length < group.variants.length && <span className="sub">Some IDs not reported</span>}
    </>}</td>
    <td className="col-size num"><span className={group.size.maxBytes === undefined ? "muted" : undefined}
      title={`Node-reported image size; exact matches for ${group.size.matchedContainers} of ${group.size.totalContainers} containers.`}>{group.size.label}</span></td>
    <td className="col-cnt num">{group.containerCount}{!state.runningOnly.get() && group.runningCount !== group.containerCount && <div className="sub">{group.runningCount} running</div>}</td>
    <td className="col-ns"><span className="ns-list">{(nsOpen ? namespaces : namespaces.slice(0, 2)).join(", ") || "Unavailable"}</span>
      {namespaces.length > 2 && <button type="button" className="link-btn ns-more" aria-expanded={nsOpen}
        aria-label={nsOpen ? "Show fewer namespaces" : `Show all ${namespaces.length} namespaces`} onClick={() => state.toggleNamespaces(group.id)}>{nsOpen ? "fewer" : `+${namespaces.length - 2}`}</button>}</td>
  </tr>{expanded && <ImageUsage group={group} clusterId={clusterId} id={detailID} />}</>;
});

const Skeleton = () => <>{Array.from({ length: 6 }, (_, index) => <tr key={index} className="skeleton-row" aria-hidden="true">
  {['col-image', 'col-pin', 'col-rid', 'col-size num', 'col-cnt num', 'col-ns'].map((name) => <td key={name} className={name}>
    <div className={`sk ${name === "col-image" ? "sk-l" : name.includes("num") ? "sk-xs" : "sk-m"}`} />{name === "col-image" && <div className="sk sk-s" />}</td>)}
</tr>)}</>;

/** Keyboard handling is scoped to this extension's own DOM and never intercepts Lens inputs. */
const explorerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable=true]")) return;
  const input = event.currentTarget.querySelector<HTMLInputElement>('input[aria-label="Search images"]');
  if (input) { event.preventDefault(); input.focus(); }
};

export const ImagesView = observer(({ clusterId }: { clusterId: string }) => {
  const state = useSyncInject(imagesStateInjectable, clusterId);
  const actions = useSyncInject(imageActionsInjectable, clusterId);
  const clusterName = useSyncInject(clusterHeadingInjectable, clusterId).get();
  const view = state.view.get();
  const prefix = `lie-${clusterId}`;
  const clearDisabled = !state.search.get() && !state.tagOrPin.get() && state.pinning.get() === "all";
  const chips = state.activeFilters.get();
  const sortHeader = (column: "image" | "tag" | "size" | "count", label: string, className: string) => {
    const active = state.sort.get() === column;
    const direction = active ? state.descending.get() ? "descending" : "ascending" : undefined;
    return <th scope="col" className={className} aria-sort={direction || "none"}><button type="button" className={`th-btn${active ? " active" : ""}`}
      onClick={() => state.sortBy(column)} title={`Sort by ${label.toLowerCase()}`}>{label}<span className="sort-ico"><ImageSortIcon direction={direction} /></span></button></th>;
  };
  return <main className="lie-explorer lx" onKeyDown={explorerKeyDown} tabIndex={-1}>
    <div className="lx-crumb"><span>{clusterName || "Kubernetes cluster"}</span><span>/</span><span>Workloads</span></div>
    <header className="lx-head"><div className="lx-head-main"><h1 className="lx-title">Image Explorer</h1><div className="stats">
      <span className="stat"><b>{view.imageCount}</b>image references</span><span className="stat"><b>{view.containerCount}</b>{state.runningOnly.get() ? "running containers" : "containers"}</span>
      <span className="stat"><b>{view.namespaceCount}</b>namespaces</span><button type="button" className={`stat stat-btn${state.multipleOnly.get() ? " on" : ""}`}
        aria-pressed={state.multipleOnly.get()} title="Toggle references with multiple runtime image IDs" onClick={state.toggleMultipleOnly}><b>{view.multipleCount}</b>with multiple IDs</button>
    </div></div><div className="lx-head-actions"><span className="refreshed">{view.status === "loading" ? "Refreshing…" : view.status === "ready" ? "Live cluster data" : "Connection unavailable"}</span>
      <button type="button" className={`btn${view.status === "loading" ? " is-loading" : ""}`} onClick={state.refresh}><span className="btn-ico"><ImageIcon name="refresh" /></span>Refresh</button></div></header>
    <div className="toolbar" role="search" aria-label="Image search and filters"><div className="row row-search">
      <Field id={`${prefix}-search`} label="Search" className="f-search"><div className="search-wrap">
        <input id={`${prefix}-search`} className="input" type="text" value={state.search.get()} onChange={state.setSearch} aria-label="Search images" aria-describedby={`${prefix}-help`}
          placeholder="Image reference, tag, digest, pod, namespace, container, or node" autoComplete="off" spellCheck={false}
          onKeyDown={(event) => { if (event.key === "Escape") { if (state.search.get()) { event.preventDefault(); state.clearFilter("search"); } else event.currentTarget.blur(); } }} />
        <span className="search-ico"><ImageIcon name="search" /></span><span className="search-tools">{state.search.get() ?
          <button type="button" className="icon-btn" aria-label="Clear search text" title="Clear (Esc)" onClick={() => state.clearFilter("search")}><ImageIcon name="close" /></button> :
          <kbd className="key" title="Press / while the explorer is focused to focus search">/</kbd>}</span>
      </div></Field>
      <Field id={`${prefix}-tag`} label="Tag / pin" className="f-tq"><input id={`${prefix}-tag`} className="input mono" type="text" value={state.tagOrPin.get()} onChange={state.setTagOrPin}
        aria-label="Search tag or pin" aria-describedby={`${prefix}-help`} placeholder="v3.5.0 or sha256:…" autoComplete="off" spellCheck={false} /></Field>
      <Field id={`${prefix}-pinning`} label="Pinning" className="f-pinning"><Select id={`${prefix}-pinning`} aria-label="Image pinning" value={state.pinning.get()} onChange={state.selectPinning}>
        <option value="all">All references</option><option value="pinned">Digest pinned</option><option value="unpinned">Not pinned</option></Select></Field>
      <div className="row-actions"><button type="button" className="btn-text" disabled={clearDisabled} onClick={state.clearSearchFilters} title="Clears Search, Tag / pin and Pinning. Scope and display toggles stay.">Clear search</button>
        <button type="button" className={`btn scope-btn${state.scopeOpen.get() ? " open" : ""}`} aria-expanded={state.scopeOpen.get()} aria-controls={`${prefix}-scope`} onClick={state.toggleScope}>
          <span className="btn-ico chev"><ImageIcon name="chevron" /></span>Scope{state.scopeCount.get() > 0 && <span className="badge" aria-label={`${state.scopeCount.get()} active`}>{state.scopeCount.get()}</span>}</button></div>
    </div><p className="hint" id={`${prefix}-help`}>Case-insensitive, matches part of a value. Search and Tag / pin apply together. Tag / pin checks the configured tag or digest pin; runtime image IDs are matched by Search.</p>
      <div id={`${prefix}-scope`} className="row row-scope" hidden={!state.scopeOpen.get()}>
        <Field id={`${prefix}-namespace`} label="Namespace" className="f-ns"><Select id={`${prefix}-namespace`} aria-label="Namespace" value={state.namespaceManual.get() ? "__manual__" : state.namespace.get()} onChange={state.selectNamespace}>
          <option value="">All namespaces</option>{view.namespaces.map((name) => <option key={name} value={name}>{name}</option>)}<option value="__manual__">Enter a namespace manually…</option></Select></Field>
        {state.namespaceManual.get() && <Field id={`${prefix}-manual`} label="Namespace name" className="f-ns-manual"><form onSubmit={state.applyNamespace} className="row">
          <input id={`${prefix}-manual`} className="input mono" value={state.namespaceDraft.get()} onChange={state.setNamespaceDraft} aria-label="Manual namespace" placeholder="Namespace name" autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn">Apply</button></form><span className="field-hint">Exact name; Apply to change scope.</span></Field>}
        <Field id={`${prefix}-type`} label="Workload type" className="f-wtype"><Select id={`${prefix}-type`} aria-label="Workload type" value={state.workloadType.get()} onChange={state.selectWorkloadType}>
          <option value="">All types</option><option value="Deployment">Deployment</option><option value="StatefulSet">StatefulSet</option></Select></Field>
        <Field id={`${prefix}-workload`} label="Workload" className="f-workload"><Select id={`${prefix}-workload`} aria-label="Workload" value={state.workloadID.get()} onChange={state.selectWorkload} disabled={!view.workloads.length && !state.workloadID.get()}>
          <option value="">{view.workloads.length ? "All workloads" : "No workloads in scope"}</option>{view.workloads.map((workload) => <option key={workload.id} value={workload.id}>{workload.name}{state.workloadType.get() ? "" : ` (${workload.kind})`}{state.namespace.get() ? "" : ` · ${workload.namespace}`}</option>)}
          {state.workloadID.get() && !view.workloads.some((workload) => workload.id === state.workloadID.get()) && <option value={state.workloadID.get()}>Selected workload (no longer available)</option>}</Select></Field>
        <div className="field f-toggles" role="group" aria-labelledby={`${prefix}-show`}><span className="field-label" id={`${prefix}-show`}>Show only</span><div className="toggles">
          <label className="check"><input type="checkbox" checked={state.runningOnly.get()} onChange={state.setRunningOnly} />Running containers</label>
          <label className="check"><input type="checkbox" checked={state.multipleOnly.get()} onChange={state.setMultipleOnly} />Multiple image IDs</label>
          <label className="check"><input type="checkbox" checked={state.multipleNamespacesOnly.get()} onChange={state.setMultipleNamespacesOnly} />Multiple namespaces</label>
        </div></div>
      </div>
    </div>
    {state.namespaceError.get() && <p role="alert">{state.namespaceError.get()}</p>}
    {actions.feedback.get() && !actions.copyFeedback.get() && <div className="hint" role="status">{actions.feedback.get()}</div>}
    {view.workloadStatus === "loading" && <div className="hint" role="status">Loading workload ownership…</div>}
    {view.workloadStatus === "error" && <div className="hint" role="status">Some workload data could not be read. Deployment filtering needs access to ReplicaSets; known Pod owners remain available.</div>}
    {view.sizeStatus === "loading" && <div className="hint" role="status">Loading node image sizes…</div>}
    {view.sizeStatus === "error" && <div className="hint" role="status" title={view.sizeError}>Image sizes unavailable: node image inventories could not be read. Image IDs and pod usage remain available.</div>}
    <div className="results-bar"><div className="results-count" role="status" aria-live="polite">{view.status === "loading" ? "Refreshing…" : <>Showing <b>{view.groups.length}</b> of <b>{view.imageCount}</b> image references</>}</div>
      {!!chips.length && <ul className="chips" aria-label="Active filters">{chips.map((chip) => <li key={chip.id} className="chip"><span className={`chip-k${chip.value == null ? " chip-only" : ""}`}>{chip.label}</span>
        {chip.value != null && <span className="chip-v" title={chip.value}>{chip.value}</span>}<button type="button" className="chip-x" title="Remove filter" aria-label={`Remove filter: ${chip.label}${chip.value != null ? ` ${chip.value}` : ""}`} onClick={() => state.clearFilter(chip.id)}><ImageIcon name="close" /></button></li>)}</ul>}
      {state.showReset.get() && <button type="button" className="btn-text reset-btn" onClick={state.resetAllFilters}>Reset all filters</button>}
    </div>
    {view.status === "error" ? <div className="toolbar" role="alert"><strong>Unable to read Pods</strong><span>{view.error}</span><span className="hint">Check the cluster connection and Pod access. For namespace-only access, open Scope, enter that namespace manually, and apply it.</span><button type="button" className="btn" onClick={state.refresh}>Retry</button></div> :
      <div className={`table-wrap${view.status === "loading" ? " is-loading" : ""}`} tabIndex={0} aria-label="Scrollable image results"><table className="results" aria-label="Container images" aria-busy={view.status === "loading"}>
        <colgroup>{['col-image', 'col-pin', 'col-rid', 'col-size', 'col-cnt', 'col-ns'].map((name) => <col key={name} className={name} />)}</colgroup>
        <thead><tr>{sortHeader("image", "Image", "col-image")}{sortHeader("tag", "Tag / pin", "col-pin")}<th scope="col" className="col-rid">Runtime image ID</th>{sortHeader("size", "Reported size", "col-size num")}{sortHeader("count", "Containers", "col-cnt num")}<th scope="col" className="col-ns">Namespaces</th></tr></thead>
        <tbody>{view.status === "loading" ? <Skeleton /> : view.groups.length ? view.groups.map((group) => <ImageRow key={group.id} group={group} clusterId={clusterId} />) :
          <tr className="empty-row"><td colSpan={6}><div className="empty"><div className="empty-title">No image references match</div><p className="empty-text">{view.imageCount ? "Nothing matches every active filter at once. Search and Tag / pin apply together, and Tag / pin only checks configured tags and digest pins." : state.runningOnly.get() ? "No running containers in this scope. Remove the running-only filter to inspect other containers." : "No containers in this scope."}</p>
            {state.multipleNamespacesOnly.get() && state.namespace.get() && <p className="empty-text">“Multiple namespaces only” cannot match while Namespace is set to a single namespace.</p>}
            {!!state.relaxedFilters.get().length && <div className="empty-relax"><div className="empty-sub">Remove one filter to see results</div><ul className="relax-list">{state.relaxedFilters.get().map((chip) => <li key={chip.id}><button type="button" className="relax-btn" onClick={() => state.clearFilter(chip.id)}><ImageIcon name="close" /><span>{chip.label}{chip.value != null ? `: ${chip.value}` : ""}</span><span className="relax-n">{chip.count} result{chip.count === 1 ? "" : "s"}</span></button></li>)}</ul></div>}
            <div className="empty-actions"><button type="button" className="btn" onClick={state.clearSearchFilters} disabled={clearDisabled}>Clear search</button><button type="button" className="btn-text" onClick={state.resetAllFilters}>Reset all filters</button></div>
          </div></td></tr>}</tbody>
      </table></div>}
    <p className="hint">Image references come from Pod configuration; runtime IDs may differ from registry digests. Namespace usage reflects the current scope. Node-reported sizes may include shared layers; partial or missing inventory remains explicit.</p>
  </main>;
});
