import { getInjectable2 } from "@k8slens/injectable";
import { appsV1, coreV1, podKind, nodeKind, namespaceKind, replicaSetKind, deploymentKind, statefulSetKind, kubeResourcesInjectionToken } from "@k8slens/kubernetes-contracts";
import { navigateToKubeResourceDetailsInjectionToken } from "@k8slens/details-panel-contracts";
import { isNavigationSupersededError } from "@k8slens/navigation-contracts";
import type { Subscribable } from "@k8slens/subscribable";
import { action, computed, observable, onBecomeObserved, onBecomeUnobserved, runInAction } from "mobx";
import type { ChangeEvent, FormEvent } from "react";
import { collectContainerImages, groupImages, filterImageGroups, type ContainerImage, type ImageGroup, type ImagePinning, type ImageVariant, type PodLike } from "./image-model";
import { createImageSizeLookup, type ImageSize, type NodeLike } from "./image-sizes";
import { createResourceState } from "./resource-state";
import { filterPodsByWorkload, listWorkloads, createWorkloadResolver, type WorkloadKind, type WorkloadPodLike, type ReplicaSetLike, type WorkloadResourceLike, type NamespaceLike } from "./workload-model";

export interface ExplorerMetadataSources {
  readonly namespaces?: () => Subscribable<readonly NamespaceLike[]>;
  readonly replicaSets?: (namespace?: string) => Subscribable<readonly ReplicaSetLike[]>;
  readonly deployments?: (namespace?: string) => Subscribable<readonly WorkloadResourceLike[]>;
  readonly statefulSets?: (namespace?: string) => Subscribable<readonly WorkloadResourceLike[]>;
}

export type SizedImageGroup = Omit<ImageGroup, "variants"> & {
  readonly size: ImageSize;
  readonly summaryID: string;
  readonly variants: (ImageVariant & { readonly size: ImageSize })[];
};

export type ImageFilterId = "search" | "tagOrPin" | "pinning" | "namespace" | "workloadType" | "workloadID"
  | "runningOnly" | "multipleOnly" | "multipleNamespacesOnly";

export interface ActiveImageFilter {
  readonly id: ImageFilterId;
  readonly label: string;
  readonly value?: string;
}

export interface RelaxedImageFilter extends ActiveImageFilter {
  readonly count: number;
}

export interface ImageCopyFeedback {
  readonly value: string;
  readonly status: "copied" | "failed";
}

export const imageActionsInjectable = getInjectable2({
  id: "lens-image-explorer-actions",
  consumptions: [navigateToKubeResourceDetailsInjectionToken],
  instantiate: (di) => {
    const navigateToPod = di.inject(navigateToKubeResourceDetailsInjectionToken)();

    return (clusterId: string) => {
      const feedback = observable.box("");
      const copyFeedback = observable.box<ImageCopyFeedback | undefined>(undefined, { deep: false });
      let copyGeneration = 0;
      let copyTimer: ReturnType<typeof setTimeout> | undefined;
      let copyMessage: string | undefined;
      const clearCopyFeedback = () => {
        clearTimeout(copyTimer);
        copyTimer = undefined;
        runInAction(() => {
          copyFeedback.set(undefined);
          if (copyMessage && feedback.get() === copyMessage) feedback.set("");
          copyMessage = undefined;
        });
      };
      onBecomeUnobserved(copyFeedback, () => { copyGeneration += 1; clearCopyFeedback(); });

      return {
        feedback, copyFeedback,
        copyID: async (value: string) => {
          const current = ++copyGeneration;
          clearCopyFeedback();
          let status: ImageCopyFeedback["status"];
          try {
            await navigator.clipboard.writeText(value);
            status = "copied";
          } catch {
            status = "failed";
          }
          if (current !== copyGeneration) return;
          const message = status === "copied" ? "Copied to clipboard." : "Select the value and use your keyboard to copy it.";
          copyMessage = message;
          runInAction(() => { feedback.set(message); copyFeedback.set({ value, status }); });
          if (current === copyGeneration) copyTimer = setTimeout(() => { if (current === copyGeneration) clearCopyFeedback(); }, 1500);
        },
        openPod: async (container: ContainerImage) => {
          try {
            await navigateToPod({ clusterId, kind: podKind, apiVersion: coreV1,
              ref: { namespace: container.namespace, name: container.podName } });
          } catch (error) {
            if (!isNavigationSupersededError(error)) {
              runInAction(() => { copyMessage = undefined; feedback.set(error instanceof Error ? error.message : "Unable to open pod details."); });
            }
          }
        },
      };
    };
  },
});

/** Subscription ownership lives here, outside React render and Suspense. */
export function createImagesState(
  podsForNamespace: (namespace?: string) => Subscribable<readonly WorkloadPodLike[]>,
  nodesForCluster?: () => Subscribable<readonly NodeLike[]>,
  metadata: ExplorerMetadataSources = {},
) {
  const search = observable.box("");
  const tagOrPin = observable.box("");
  const pinning = observable.box<ImagePinning>("all");
  const namespace = observable.box("");
  const namespaceDraft = observable.box("");
  const namespaceError = observable.box("");
  const namespaceManual = observable.box(false);
  const scopeOpen = observable.box(false);
  const runningOnly = observable.box(true);
  const multipleOnly = observable.box(false);
  const multipleNamespacesOnly = observable.box(false);
  const workloadType = observable.box<"" | WorkloadKind>("");
  const workloadID = observable.box("");
  const expanded = observable.set<string>();
  const namespaceExpanded = observable.set<string>();
  const sort = observable.box<"image" | "tag" | "size" | "count">("image");
  const descending = observable.box(false);
  const pods = createResourceState(() => podsForNamespace(namespace.get() || undefined), "Unable to read pods.");
  const nodes = createResourceState(nodesForCluster, "Unable to read node image inventories.");
  let observed = false;
  const namespaceList = createResourceState(metadata.namespaces);
  const replicaSets = createResourceState(metadata.replicaSets ? () => metadata.replicaSets!(namespace.get() || undefined) : undefined);
  const deployments = createResourceState(metadata.deployments ? () => metadata.deployments!(namespace.get() || undefined) : undefined);
  const statefulSets = createResourceState(metadata.statefulSets ? () => metadata.statefulSets!(namespace.get() || undefined) : undefined);
  const scopedMetadata = [replicaSets, deployments, statefulSets];

  const nodeSizeLookup = computed(() => createImageSizeLookup(nodes.read([])));

  const inventory = computed(() => {
    const podValues = pods.read([]);
    const replicas = replicaSets.read([]);
    const selectedPods = filterPodsByWorkload(podValues, replicas, workloadType.get(), workloadID.get());
    const containers = collectContainerImages(selectedPods, runningOnly.get());
    const sizeFor = nodeSizeLookup.get();
    const allGroups: SizedImageGroup[] = groupImages(containers).map((group) => {
      const known = group.variants.filter((variant) => variant.imageID);
      return {
        ...group,
        summaryID: group.multipleIDs ? `${known.length} image IDs`
          : known[0] ? `${known[0].shortID}${known.length < group.variants.length ? " + unreported" : ""}` : "Not reported yet",
        size: sizeFor(group.variants.flatMap((variant) => variant.containers)),
        variants: group.variants.map((variant) => ({ ...variant, size: sizeFor(variant.containers) })),
      };
    });
    const workloadLabels = new Map<string, string>();
    const resolveWorkload = createWorkloadResolver(replicas);
    for (const pod of selectedPods) {
      const workload = resolveWorkload(pod);
      if (workload) workloadLabels.set(pod.metadata?.uid ?? `${pod.metadata?.namespace ?? ""}/${pod.metadata?.name ?? ""}`, `${workload.kind}/${workload.name}`);
    }
    return { containers, allGroups, workloadLabels };
  });

  const scopeOptions = computed(() => {
    const podValues = pods.read([]);
    const namespaces = [...new Set([
      ...namespaceList.read([]).map((entry) => entry.metadata?.name ?? ""),
      ...podValues.map((pod) => pod.metadata?.namespace ?? ""), namespace.get(),
    ].filter(Boolean))].sort();
    const workloads = listWorkloads(podValues, replicaSets.read([]), deployments.read([]), statefulSets.read([]))
      .filter((workload) => !workloadType.get() || workload.kind === workloadType.get());
    return { namespaces, workloads };
  });

  const matchFields = computed(() => {
    const matches = new Map<string, string[]>();
    const needle = search.get().trim().toLowerCase();
    if (!needle) return matches;
    for (const group of inventory.get().allGroups) {
      if ([group.requestedImage, group.repository, group.tag, group.pinnedDigest]
        .some((value) => value.toLowerCase().includes(needle))
        || group.namespaces.some((value) => value.toLowerCase().includes(needle))) continue;
      const fields = new Set<string>();
      for (const variant of group.variants) for (const container of variant.containers) {
        if (container.reportedImage.toLowerCase().includes(needle)) fields.add("reported image");
        if (container.imageID.toLowerCase().includes(needle)) fields.add("runtime ID");
        if (container.podName.toLowerCase().includes(needle)) fields.add("pod");
        if (container.containerName.toLowerCase().includes(needle)) fields.add("container");
        if (container.nodeName.toLowerCase().includes(needle)) fields.add("node");
      }
      if (fields.size) matches.set(group.id, ["reported image", "runtime ID", "pod", "container", "node"].filter((field) => fields.has(field)));
    }
    return matches;
  });

  const activeFilters = computed<ActiveImageFilter[]>(() => {
    const filters: ActiveImageFilter[] = [];
    const query = search.get().trim();
    const tagQuery = tagOrPin.get().trim();
    if (query) filters.push({ id: "search", label: "Search", value: query });
    if (tagQuery) filters.push({ id: "tagOrPin", label: "Tag / pin", value: tagQuery });
    if (pinning.get() !== "all") filters.push({ id: "pinning", label: "Pinning", value: pinning.get() === "pinned" ? "Digest pinned" : "Not pinned" });
    if (namespace.get()) filters.push({ id: "namespace", label: "Namespace", value: `${namespace.get()}${namespaceManual.get() ? " (manual)" : ""}` });
    if (workloadType.get()) filters.push({ id: "workloadType", label: "Workload type", value: workloadType.get() });
    if (workloadID.get()) {
      const workload = scopeOptions.get().workloads.find((entry) => entry.id === workloadID.get());
      const value = workload ? `${workload.name}${namespace.get() ? "" : ` · ${workload.namespace}`}` : "Selected workload (no longer available)";
      filters.push({ id: "workloadID", label: "Workload", value });
    }
    if (runningOnly.get()) filters.push({ id: "runningOnly", label: "Running containers only" });
    if (multipleOnly.get()) filters.push({ id: "multipleOnly", label: "Multiple image IDs only" });
    if (multipleNamespacesOnly.get()) filters.push({ id: "multipleNamespacesOnly", label: "Multiple namespaces only" });
    return filters;
  });
  const scopeCount = computed(() => Number(Boolean(namespace.get())) + Number(Boolean(workloadType.get()))
    + Number(Boolean(workloadID.get())) + Number(!runningOnly.get()) + Number(multipleOnly.get()) + Number(multipleNamespacesOnly.get()));
  const hasActiveFilters = computed(() => activeFilters.get().length > 0);
  const showReset = computed(() => Boolean(search.get() || tagOrPin.get() || pinning.get() !== "all" || namespace.get()
    || namespaceDraft.get() || namespaceManual.get() || workloadType.get() || workloadID.get() || !runningOnly.get()
    || multipleOnly.get() || multipleNamespacesOnly.get()));

  const view = computed(() => {
    const { containers, allGroups, workloadLabels } = inventory.get();
    const { namespaces, workloads } = scopeOptions.get();
    const groups = filterImageGroups(allGroups, search.get(), multipleOnly.get(), {
      tagOrPin: tagOrPin.get(), pinning: pinning.get(), multipleNamespacesOnly: multipleNamespacesOnly.get(),
    });
    groups.sort((a, b) => {
      if (sort.get() === "size") {
        if (a.size.maxBytes === undefined || b.size.maxBytes === undefined) {
          return a.size.maxBytes === undefined && b.size.maxBytes === undefined ? a.id.localeCompare(b.id) : a.size.maxBytes === undefined ? 1 : -1;
        }
        return (a.size.maxBytes - b.size.maxBytes || a.id.localeCompare(b.id)) * (descending.get() ? -1 : 1);
      }
      const comparison = sort.get() === "count" ? a.containerCount - b.containerCount
        : (sort.get() === "tag" ? a.tag.localeCompare(b.tag) : a.repository.localeCompare(b.repository));
      return (comparison || a.id.localeCompare(b.id)) * (descending.get() ? -1 : 1);
    });

    return {
      status: pods.error.get() ? "error" as const : pods.data.get() ? "ready" as const : "loading" as const,
      error: pods.error.get(), groups, namespaces, workloads, workloadLabels, matchFields: matchFields.get(),
      workloadStatus: scopedMetadata.some((slot) => slot.error.get()) ? "error" as const
        : scopedMetadata.some((slot) => slot.configured && !slot.data.get()) ? "loading" as const : "ready" as const,
      sizeStatus: nodes.error.get() ? "error" as const : nodes.data.get() ? "ready" as const : nodesForCluster ? "loading" as const : "unavailable" as const,
      sizeError: nodes.error.get(),
      imageCount: allGroups.length,
      containerCount: containers.length,
      multipleCount: allGroups.filter((group) => group.multipleIDs).length,
      namespaceCount: new Set(containers.map((container) => container.namespace)).size,
    };
  });

  // These broader scopes are only observed for an empty result, then reused while text filters change.
  const relaxedScopeGroups = computed(() => {
    const podValues = pods.read([]);
    const replicas = replicaSets.read([]);
    const type = workloadType.get();
    const selectedWorkload = workloadID.get();
    const running = runningOnly.get();
    const groups: Partial<Record<ImageFilterId, ImageGroup[]>> = {};
    if (type) groups.workloadType = groupImages(collectContainerImages(podValues, running));
    if (selectedWorkload) groups.workloadID = groupImages(collectContainerImages(filterPodsByWorkload(podValues, replicas, type, ""), running));
    if (running) groups.runningOnly = groupImages(collectContainerImages(filterPodsByWorkload(podValues, replicas, type, selectedWorkload), false));
    return groups;
  });
  const relaxedFilters = computed<RelaxedImageFilter[]>(() => {
    const current = view.get();
    if (current.status !== "ready" || current.groups.length) return [];
    const groups = inventory.get().allGroups;
    const relaxed: RelaxedImageFilter[] = [];
    for (const chip of activeFilters.get()) {
      if (chip.id === "namespace") continue;
      const scoped = chip.id === "workloadType" || chip.id === "workloadID" || chip.id === "runningOnly"
        ? relaxedScopeGroups.get()[chip.id] ?? groups : groups;
      const count = filterImageGroups(scoped, chip.id === "search" ? "" : search.get(),
        chip.id === "multipleOnly" ? false : multipleOnly.get(), {
          tagOrPin: chip.id === "tagOrPin" ? "" : tagOrPin.get(),
          pinning: chip.id === "pinning" ? "all" : pinning.get(),
          multipleNamespacesOnly: chip.id === "multipleNamespacesOnly" ? false : multipleNamespacesOnly.get(),
        }).length;
      if (count) relaxed.push({ ...chip, count });
    }
    return relaxed;
  });

  onBecomeObserved(view, () => { observed = true; pods.start(); nodes.start(); namespaceList.start(); scopedMetadata.forEach((slot) => slot.start()); });
  onBecomeUnobserved(view, () => { observed = false; pods.stop(); nodes.stop(); namespaceList.stop(); scopedMetadata.forEach((slot) => slot.stop()); });

  const changeNamespace = (next: string) => {
    namespaceError.set("");
    namespaceDraft.set(next);
    if (next !== namespace.get()) {
      namespace.set(next); workloadID.set(""); expanded.clear(); namespaceExpanded.clear();
      observed ? pods.start() : pods.stop();
      if (observed) scopedMetadata.forEach((slot) => slot.start());
    }
  };
  const changeWorkloadType = (next: "" | WorkloadKind) => {
    workloadType.set(next); workloadID.set(""); expanded.clear(); namespaceExpanded.clear();
  };
  const changeWorkload = (next: string) => { workloadID.set(next); expanded.clear(); namespaceExpanded.clear(); };
  const clearFilter = action((id: ImageFilterId) => {
    switch (id) {
      case "search": search.set(""); break;
      case "tagOrPin": tagOrPin.set(""); break;
      case "pinning": pinning.set("all"); break;
      case "namespace": namespaceManual.set(false); changeNamespace(""); break;
      case "workloadType": changeWorkloadType(""); break;
      case "workloadID": changeWorkload(""); break;
      case "runningOnly": runningOnly.set(false); break;
      case "multipleOnly": multipleOnly.set(false); break;
      case "multipleNamespacesOnly": multipleNamespacesOnly.set(false); break;
    }
  });
  const resetAllFilters = action(() => {
    search.set(""); tagOrPin.set(""); pinning.set("all");
    namespaceManual.set(false); changeNamespace("");
    if (workloadType.get() || workloadID.get()) changeWorkloadType("");
    runningOnly.set(true); multipleOnly.set(false); multipleNamespacesOnly.set(false);
  });

  return {
    view, search, tagOrPin, pinning, namespace, namespaceDraft, namespaceError, runningOnly, multipleOnly, multipleNamespacesOnly, expanded, sort, descending, workloadType, workloadID,
    namespaceManual, scopeOpen, activeFilters, scopeCount, hasActiveFilters, showReset, clearFilter, resetAllFilters,
    namespaceExpanded, relaxedFilters,
    toggleScope: action(() => scopeOpen.set(!scopeOpen.get())),
    toggleNamespaces: action((id: string) => { namespaceExpanded.has(id) ? namespaceExpanded.delete(id) : namespaceExpanded.add(id); }),
    toggleMultipleOnly: action(() => multipleOnly.set(!multipleOnly.get())),
    setSearch: action((event: ChangeEvent<HTMLInputElement>) => search.set(event.currentTarget.value)),
    setTagOrPin: action((event: ChangeEvent<HTMLInputElement>) => tagOrPin.set(event.currentTarget.value)),
    selectPinning: action((event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.currentTarget.value;
      if (next === "all" || next === "pinned" || next === "unpinned") pinning.set(next);
    }),
    clearSearchFilters: action(() => { search.set(""); tagOrPin.set(""); pinning.set("all"); }),
    setNamespaceDraft: action((event: ChangeEvent<HTMLInputElement>) => namespaceDraft.set(event.currentTarget.value)),
    applyNamespace: action((event: FormEvent) => {
      event.preventDefault();
      const next = namespaceDraft.get().trim();
      if (next && (next.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(next))) {
        namespaceError.set("Enter a namespace name, or leave blank for all namespaces.");
        return;
      }
      namespaceManual.set(true);
      changeNamespace(next);
    }),
    selectNamespace: action((event: ChangeEvent<HTMLSelectElement>) => {
      if (event.currentTarget.value === "__manual__") {
        namespaceManual.set(true); namespaceDraft.set(namespace.get()); namespaceError.set("");
        return;
      }
      namespaceManual.set(false);
      changeNamespace(event.currentTarget.value);
    }),
    selectWorkloadType: action((event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.currentTarget.value;
      if (next === "" || next === "Deployment" || next === "StatefulSet") {
        changeWorkloadType(next);
      }
    }),
    selectWorkload: action((event: ChangeEvent<HTMLSelectElement>) => changeWorkload(event.currentTarget.value)),
    setRunningOnly: action((event: ChangeEvent<HTMLInputElement>) => runningOnly.set(event.currentTarget.checked)),
    setMultipleOnly: action((event: ChangeEvent<HTMLInputElement>) => multipleOnly.set(event.currentTarget.checked)),
    setMultipleNamespacesOnly: action((event: ChangeEvent<HTMLInputElement>) => multipleNamespacesOnly.set(event.currentTarget.checked)),
    toggleExpanded: action((id: string) => { expanded.has(id) ? expanded.delete(id) : expanded.add(id); }),
    sortBy: action((column: "image" | "tag" | "size" | "count") => {
      descending.set(sort.get() === column ? !descending.get() : column === "count" || column === "size");
      sort.set(column);
    }),
    refresh: () => {
      if (!observed) return;
      pods.refresh(); nodes.refresh();
      namespaceList.refresh(); scopedMetadata.forEach((slot) => slot.refresh());
    },
  };
}

export const imagesStateInjectable = getInjectable2({
  id: "lens-image-explorer-state",
  consumptions: [kubeResourcesInjectionToken],
  instantiate: (di) => {
    const resources = di.inject(kubeResourcesInjectionToken)();
    return (clusterId: string) => createImagesState(
      (namespace) => resources(podKind, coreV1, clusterId, namespace),
      () => resources(nodeKind, coreV1, clusterId),
      {
        namespaces: () => resources(namespaceKind, coreV1, clusterId),
        replicaSets: (namespace) => resources(replicaSetKind, appsV1, clusterId, namespace),
        deployments: (namespace) => resources(deploymentKind, appsV1, clusterId, namespace),
        statefulSets: (namespace) => resources(statefulSetKind, appsV1, clusterId, namespace),
      },
    );
  },
});

export const describePodImagesInjectable = getInjectable2({
  id: "lens-image-explorer-describe-pod",
  instantiate: () => () => (pod: PodLike) => collectContainerImages([pod], false),
});
