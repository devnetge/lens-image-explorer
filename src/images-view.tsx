import { Button, Code, Div, H1, Input, Span } from "@k8slens/element-components";
import { ContentCopyIcon } from "@k8slens/icon";
import { PlainButton, TextInput } from "@k8slens/input-components";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { imageActionsInjectable, imagesStateInjectable, type SizedImageGroup } from "./images-state.injectable";
import { clusterHeadingInjectable } from "./cluster-heading.injectable";
import { RegistryBadges } from "./registry-badges";
import { registryDetailsInjectable } from "./registry-details.injectable";
import { NodeRuntime } from "./node-runtime-view";
import { NamespaceUsage } from "./namespace-usage";
import { shortImageID } from "./image-model";

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

const ImageUsage = observer(({ group, clusterId }: { group: SizedImageGroup; clusterId: string }) => {
  const actions = useSyncInject(imageActionsInjectable, clusterId);
  const state = useSyncInject(imagesStateInjectable, clusterId);
  const registry = useSyncInject(registryDetailsInjectable, group.requestedImage);
  const workloadLabels = state.view.get().workloadLabels;
  return (
    <Div $padding="l" $backgroundColor="backgroundSecondary" $flex={{ direction: "vertical", gap: "l" }}>
      <Div $flex={{ direction: "vertical", gap: "s" }}>
        <Span $color="textMuted">Requested image</Span><Code $className="lie-wrap">{group.requestedImage}</Code>
        <RegistryBadges details={registry} />
      </Div>
      {group.variants.map((variant) => (
        <Div key={variant.id} $flex={{ direction: "vertical", gap: "s" }}>
          <Span $font={{ bold: true }}>Runtime image ID · {variant.containers.length} container{variant.containers.length === 1 ? "" : "s"}</Span>
          <FullImageID value={variant.imageID} copy={actions.copyID} />
          <Span $color="textMuted" $tooltip={`Exact image-ID matches for ${variant.size.matchedContainers} of ${variant.size.totalContainers} containers on their nodes.`}>Reported size: {variant.size.label}</Span>
          <Div $className="lie-usage-grid lie-grid-heading" $color="textMuted">
            <Span>Pod / container</Span><Span>Namespace</Span><Span>Node</Span><Span>Node runtime</Span><Span>State</Span>
          </Div>
          {variant.containers.map((container) => (
            <Div key={container.id} $className="lie-usage-grid">
              <Div $flex={{ direction: "vertical", gap: "xxs" }}>
                <Button type="button" $onClick={() => actions.openPod(container)} $color="link" $className="lie-text-button">{container.podName}</Button>
                <Span $color="textMuted">{container.containerName}{container.kind === "container" ? "" : ` · ${container.kind}`}</Span>
                {workloadLabels.has(container.podUID) && <Span $color="textMuted">{workloadLabels.get(container.podUID)}</Span>}
              </Div>
              <Span>{container.namespace}</Span>
              <Span $color="textMuted">{container.nodeName || "Not scheduled"}</Span>
              <NodeRuntime clusterId={clusterId} nodeName={container.nodeName} />
              <Span $color={container.state === "running" ? "success" : "textMuted"}>{container.state}{container.state === "running" && !container.ready ? " · not ready" : ""}</Span>
            </Div>
          ))}
        </Div>
      ))}
      {group.multipleIDs && <Span $color="textMuted">Multiple runtime IDs can reflect different builds, architectures, or container runtimes. Inspect their pod usage before comparing.</Span>}
    </Div>
  );
});

const ImageRow = observer(({ group, clusterId }: { group: SizedImageGroup; clusterId: string }) => {
  const state = useSyncInject(imagesStateInjectable, clusterId);
  const registry = useSyncInject(registryDetailsInjectable, group.requestedImage);
  const expanded = state.expanded.has(group.id);
  return (
    <Div $className="lie-image-group">
      <Div $className="lie-image-grid" role="row">
        <Div role="cell" $style={{ minWidth: 0 }} $flex={{ direction: "vertical", gap: "s" }}>
          <Button type="button" $onClick={() => state.toggleExpanded(group.id)} aria-expanded={expanded}
            $className="lie-text-button" $font={{ bold: true }} $tooltip={group.requestedImage}>
            <Span aria-hidden="true">{expanded ? "▾" : "▸"} </Span>{group.repository}
          </Button>
          <RegistryBadges details={registry} />
        </Div>
        <Div role="cell" $style={{ minWidth: 0 }}><Code $className="lie-tag" $tooltip={group.pinnedDigest ? group.requestedImage : group.tag}>
          {group.pinnedDigest ? `${group.tag === "(implicit)" ? "" : `${group.tag} · `}${shortImageID(group.pinnedDigest)}` : group.tag}
        </Code></Div>
        <Button type="button" role="cell" $onClick={() => state.toggleExpanded(group.id)} $className="lie-text-button lie-mono"
          $color={group.multipleIDs ? "notice" : "code"} $tooltip="Expand to inspect full IDs and pod usage">
          {group.summaryID}
        </Button>
        <Span role="cell" $className="lie-count" $tooltip={`Node-reported image size; exact matches for ${group.size.matchedContainers} of ${group.size.totalContainers} containers.`}>{group.size.label}</Span>
        <Span role="cell" $className="lie-count">{group.containerCount}</Span>
        <Div role="cell" $className="lie-namespace-cell"><NamespaceUsage usages={group.namespaceUsages} /></Div>
      </Div>
      {expanded && <ImageUsage group={group} clusterId={clusterId} />}
    </Div>
  );
});

export const ImagesView = observer(({ clusterId }: { clusterId: string }) => {
  const state = useSyncInject(imagesStateInjectable, clusterId);
  const actions = useSyncInject(imageActionsInjectable, clusterId);
  const clusterName = useSyncInject(clusterHeadingInjectable, clusterId).get();
  const view = state.view.get();

  return (
    <Div $className="lie-explorer" $padding="xl" $flex={{ direction: "vertical", gap: "l" }} $backgroundColor="backgroundPrimary">
      <Div $flex={{ horizontalAlign: "space-between", verticalAlign: "center", gap: "l", wrap: true }}>
        <Div $flex={{ direction: "vertical", gap: "xs" }}>
          <Span $color="textMuted">{clusterName || "Kubernetes cluster"} / Workloads</Span>
          <H1 $font={{ size: "xxl", bold: true }}>Image Explorer</H1>
          <Span $color="textMuted">See what your containers are running, down to the full image ID.</Span>
        </Div>
        <Button type="button" $onClick={state.refresh}>Refresh</Button>
      </Div>
      <Div $flex={{ gap: "l", wrap: true }}>
        <Div $padding="l" $backgroundColor="backgroundSecondary" $className="lie-stat"><Span $font={{ size: "xxl", bold: true }}>{view.imageCount}</Span><Span $color="textMuted">Image references</Span></Div>
        <Div $padding="l" $backgroundColor="backgroundSecondary" $className="lie-stat"><Span $font={{ size: "xxl", bold: true }}>{view.containerCount}</Span><Span $color="textMuted">{state.runningOnly.get() ? "Running containers" : "Containers"}</Span></Div>
        <Div $padding="l" $backgroundColor="backgroundSecondary" $className="lie-stat"><Span $font={{ size: "xxl", bold: true }}>{view.namespaceCount}</Span><Span $color="textMuted">Namespaces</Span></Div>
        <Div $padding="l" $backgroundColor="backgroundSecondary" $className="lie-stat"><Span $font={{ size: "xxl", bold: true }} $color={view.multipleCount ? "notice" : "textDefault"}>{view.multipleCount}</Span><Span $color="textMuted">References with multiple IDs</Span></Div>
      </Div>
      <Div $flex={{ gap: "m", wrap: true, verticalAlign: "center" }} $className="lie-search-controls">
        <Div $padding="s" $backgroundColor="backgroundSecondary" $className="lie-filter-field lie-search-field">
          <label htmlFor={`lie-search-${clusterId}`}>Search all fields</label>
          <TextInput id={`lie-search-${clusterId}`} type="search" value={state.search.get()} onChange={state.setSearch}
            aria-label="Search images" aria-describedby={`lie-search-help-${clusterId}`}
            placeholder="Image, tag, digest, pod, or node…" $className="lie-search" />
        </Div>
        <Div $padding="s" $backgroundColor="backgroundSecondary" $className="lie-filter-field">
          <label htmlFor={`lie-tag-pin-${clusterId}`}>Tag / pin</label>
          <TextInput id={`lie-tag-pin-${clusterId}`} type="search" value={state.tagOrPin.get()} onChange={state.setTagOrPin}
            aria-label="Search tag or pin" aria-describedby={`lie-search-help-${clusterId}`}
            placeholder="e.g. v3.5.0 or sha256:abc…" $className="lie-search" />
        </Div>
        <Div $padding="s" $backgroundColor="backgroundSecondary" $className="lie-filter-field">
          <label htmlFor={`lie-pinning-${clusterId}`}>Pinning</label>
          <select id={`lie-pinning-${clusterId}`} aria-label="Image pinning" className="lie-select" value={state.pinning.get()} onChange={state.selectPinning}>
            <option value="all">All references</option><option value="pinned">Digest pinned</option><option value="unpinned">Not pinned</option>
          </select>
        </Div>
        <PlainButton $onClick={state.clearSearchFilters} $padding="s"
          $disabled={!state.search.get() && !state.tagOrPin.get() && state.pinning.get() === "all"}
          $tooltip="Clear both search fields and the pinning filter">Clear search</PlainButton>
      </Div>
      <Span id={`lie-search-help-${clusterId}`} $color="textMuted" $font={{ size: "s" }}>
        Search matches part of a value. Tag / pin checks the configured tag or digest pin; both search fields apply together.
      </Span>
      <Div $flex={{ gap: "m", wrap: true }}>
        <Div $padding="s" $backgroundColor="backgroundSecondary" $className="lie-filter-field">
          <label htmlFor={`lie-namespace-${clusterId}`}>Namespace</label>
          <select id={`lie-namespace-${clusterId}`} aria-label="Namespace" className="lie-select" value={state.namespace.get()} onChange={state.selectNamespace}>
            <option value="">All namespaces</option>
            {view.namespaces.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </Div>
        <Div $padding="s" $backgroundColor="backgroundSecondary" $className="lie-filter-field">
          <label htmlFor={`lie-workload-type-${clusterId}`}>Workload type</label>
          <select id={`lie-workload-type-${clusterId}`} aria-label="Workload type" className="lie-select" value={state.workloadType.get()} onChange={state.selectWorkloadType}>
            <option value="">All workloads</option><option value="Deployment">Deployments</option><option value="StatefulSet">StatefulSets</option>
          </select>
        </Div>
        <Div $padding="s" $backgroundColor="backgroundSecondary" $className="lie-filter-field">
          <label htmlFor={`lie-workload-${clusterId}`}>Workload</label>
          <select id={`lie-workload-${clusterId}`} aria-label="Workload" className="lie-select" value={state.workloadID.get()} onChange={state.selectWorkload}>
            <option value="">All {state.workloadType.get() === "Deployment" ? "Deployments" : state.workloadType.get() === "StatefulSet" ? "StatefulSets" : "workloads"}</option>
            {view.workloads.map((workload) => <option key={workload.id} value={workload.id}>{workload.kind}/{workload.name}{state.namespace.get() ? "" : ` · ${workload.namespace}`}</option>)}
            {state.workloadID.get() && !view.workloads.some((workload) => workload.id === state.workloadID.get()) && <option value={state.workloadID.get()}>Selected workload (no longer available)</option>}
          </select>
        </Div>
      </Div>
      <details><summary>Enter a namespace manually</summary>
        <form onSubmit={state.applyNamespace} className="lie-namespace-form">
          <Input value={state.namespaceDraft.get()} onChange={state.setNamespaceDraft} aria-label="Manual namespace" placeholder="Namespace name" />
          <Button type="submit">Apply</Button>
        </form>
      </details>
      <Div $flex={{ gap: "l", wrap: true, verticalAlign: "center" }}>
        <label className="lie-checkbox"><Input type="checkbox" checked={state.runningOnly.get()} onChange={state.setRunningOnly} />Running containers only</label>
        <label className="lie-checkbox"><Input type="checkbox" checked={state.multipleOnly.get()} onChange={state.setMultipleOnly} />Multiple image IDs only</label>
        <label className="lie-checkbox"><Input type="checkbox" checked={state.multipleNamespacesOnly.get()} onChange={state.setMultipleNamespacesOnly} />Multiple namespaces only</label>
        <Span $color="textMuted">{state.namespace.get() || "All namespaces"}</Span>
      </Div>
      {state.namespaceError.get() && <Span role="alert" $color="critical">{state.namespaceError.get()}</Span>}
      {actions.feedback.get() && <Span role="status">{actions.feedback.get()}</Span>}
      {view.workloadStatus === "loading" && <Span role="status" $color="textMuted">Loading workload ownership…</Span>}
      {view.workloadStatus === "error" && <Span role="status" $color="textMuted">Some workload data could not be read. Deployment filtering needs access to ReplicaSets; known Pod owners remain available.</Span>}
      {view.sizeStatus === "loading" && <Span role="status" $color="textMuted">Loading node image sizes…</Span>}
      {view.sizeStatus === "error" && <Span role="status" $color="textMuted" $tooltip={view.sizeError}>Image sizes unavailable: node image inventories could not be read. Image IDs and pod usage remain available.</Span>}
      {view.status === "loading" && <Div $padding="xl" role="status">Loading container images…</Div>}
      {view.status === "error" && <Div $padding="l" $backgroundColor="backgroundSecondary" role="alert" $flex={{ direction: "vertical", gap: "s" }}>
        <Span $font={{ bold: true }}>Unable to read Pods</Span><Span>{view.error}</Span>
        <Span $color="textMuted">Check the cluster connection and Pod access. For namespace-only access, enter that namespace above and apply it.</Span>
        <Button type="button" $onClick={state.refresh}>Retry</Button>
      </Div>}
      {view.status === "ready" && <Span role="status" aria-live="polite" $color="textMuted">Showing {view.groups.length} of {view.imageCount} image references</Span>}
      {view.status === "ready" && <Div $className="lie-table-scroll">
        <Div role="table" aria-label="Container images" $className="lie-image-table">
          <Div role="row" $className="lie-image-grid lie-grid-heading" $color="textMuted" $backgroundColor="backgroundSecondary">
            <Button type="button" role="columnheader" $onClick={() => state.sortBy("image")} $className="lie-text-button">Image {state.sort.get() === "image" ? state.descending.get() ? "↓" : "↑" : ""}</Button>
            <Button type="button" role="columnheader" $onClick={() => state.sortBy("tag")} $className="lie-text-button">Tag / pin {state.sort.get() === "tag" ? state.descending.get() ? "↓" : "↑" : ""}</Button>
            <Span role="columnheader">Runtime image ID</Span>
            <Button type="button" role="columnheader" $onClick={() => state.sortBy("size")} $className="lie-text-button" $tooltip="Image size reported by the nodes; unknown sizes sort last">Reported size {state.sort.get() === "size" ? state.descending.get() ? "↓" : "↑" : ""}</Button>
            <Button type="button" role="columnheader" $onClick={() => state.sortBy("count")} $className="lie-text-button">Containers {state.sort.get() === "count" ? state.descending.get() ? "↓" : "↑" : ""}</Button>
            <Span role="columnheader">Namespaces</Span>
          </Div>
          {view.groups.map((group) => <ImageRow key={group.id} group={group} clusterId={clusterId} />)}
        </Div>
        {!view.groups.length && <Div $padding="xl" $color="textMuted">{view.imageCount ? "No images match these filters." : state.runningOnly.get() ? "No running containers in this scope. Clear the running-only filter to inspect other containers." : "No containers in this scope."}</Div>}
      </Div>}
      <Span $color="textMuted">Image references come from Pod configuration; image IDs come from container runtime status. A runtime ID may differ from a registry digest. Expand a row to inspect and copy its full value.</Span>
      <Span $color="textMuted">Namespace names and counts reflect the current namespace, workload, and container-state filters. An image may also be used outside the visible scope.</Span>
      <Span $color="textMuted">Sizes come from node image inventories and may include shared layers. Missing inventory entries or Node access can leave a size unavailable; partial sizes cover only some containers.</Span>
    </Div>
  );
});
