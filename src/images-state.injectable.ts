import { getInjectable2 } from "@k8slens/injectable";
import { appsV1, coreV1, podKind, nodeKind, namespaceKind, replicaSetKind, deploymentKind, statefulSetKind, kubeResourcesInjectionToken } from "@k8slens/kubernetes-contracts";
import { navigateToKubeResourceDetailsInjectionToken } from "@k8slens/details-panel-contracts";
import { isNavigationSupersededError } from "@k8slens/navigation-contracts";
import type { Subscribable, Subscription } from "@k8slens/subscribable";
import { action, computed, observable, onBecomeObserved, onBecomeUnobserved, runInAction, type IComputedValue } from "mobx";
import type { ChangeEvent, FormEvent } from "react";
import { collectContainerImages, groupImages, type ContainerImage, type ImageGroup, type ImagePinning, type ImageVariant, type PodLike } from "./image-model";
import { sizeForContainers, type ImageSize, type NodeLike } from "./image-sizes";
import { createResourceState } from "./resource-state";
import { filterPodsByWorkload, listWorkloads, resolvePodWorkload, type WorkloadKind, type WorkloadPodLike, type ReplicaSetLike, type WorkloadResourceLike, type NamespaceLike } from "./workload-model";

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

export const imageActionsInjectable = getInjectable2({
  id: "lens-image-explorer-actions",
  consumptions: [navigateToKubeResourceDetailsInjectionToken],
  instantiate: (di) => {
    const navigateToPod = di.inject(navigateToKubeResourceDetailsInjectionToken)();

    return (clusterId: string) => {
      const feedback = observable.box("");

      return {
        feedback,
        copyID: async (value: string) => {
          try {
            await navigator.clipboard.writeText(value);
            runInAction(() => feedback.set("Full image ID copied."));
          } catch {
            runInAction(() => feedback.set("Select the full image ID and use your keyboard to copy it."));
          }
        },
        openPod: async (container: ContainerImage) => {
          try {
            await navigateToPod({ clusterId, kind: podKind, apiVersion: coreV1,
              ref: { namespace: container.namespace, name: container.podName } });
          } catch (error) {
            if (!isNavigationSupersededError(error)) {
              runInAction(() => feedback.set(error instanceof Error ? error.message : "Unable to open pod details."));
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
  const runningOnly = observable.box(true);
  const multipleOnly = observable.box(false);
  const multipleNamespacesOnly = observable.box(false);
  const workloadType = observable.box<"" | WorkloadKind>("");
  const workloadID = observable.box("");
  const expanded = observable.set<string>();
  const sort = observable.box<"image" | "tag" | "size" | "count">("image");
  const descending = observable.box(false);
  const livePods = observable.box<IComputedValue<readonly PodLike[]> | undefined>(undefined, { deep: false });
  const failure = observable.box("");
  const liveNodes = observable.box<IComputedValue<readonly NodeLike[]> | undefined>(undefined, { deep: false });
  const nodeFailure = observable.box("");
  let subscription: Subscription<readonly PodLike[]> | undefined;
  let nodeSubscription: Subscription<readonly NodeLike[]> | undefined;
  let nodeGeneration = 0;
  let observed = false;
  let generation = 0;
  const namespaceList = createResourceState(metadata.namespaces);
  const replicaSets = createResourceState(metadata.replicaSets ? () => metadata.replicaSets!(namespace.get() || undefined) : undefined);
  const deployments = createResourceState(metadata.deployments ? () => metadata.deployments!(namespace.get() || undefined) : undefined);
  const statefulSets = createResourceState(metadata.statefulSets ? () => metadata.statefulSets!(namespace.get() || undefined) : undefined);
  const scopedMetadata = [replicaSets, deployments, statefulSets];

  const stop = () => {
    generation += 1;
    subscription?.dispose();
    subscription = undefined;
    runInAction(() => livePods.set(undefined));
  };

  const start = () => {
    stop();
    runInAction(() => failure.set(""));
    if (!observed) return;
    const current = generation;
    try {
      subscription = podsForNamespace(namespace.get() || undefined).subscribe();
      subscription.claim();
      void subscription.value.then(
        (pods) => {
          if (generation === current) runInAction(() => livePods.set(pods));
        },
        (error: unknown) => {
          if (generation === current) runInAction(() => failure.set(error instanceof Error ? error.message : "Unable to read pods."));
        },
      );
    } catch (error) {
      runInAction(() => failure.set(error instanceof Error ? error.message : "Unable to read pods."));
    }
  };

  const stopNodes = () => {
    nodeGeneration += 1;
    nodeSubscription?.dispose();
    nodeSubscription = undefined;
    runInAction(() => liveNodes.set(undefined));
  };
  const startNodes = () => {
    stopNodes();
    runInAction(() => nodeFailure.set(""));
    if (!nodesForCluster || !observed) return;
    const current = nodeGeneration;
    try {
      nodeSubscription = nodesForCluster().subscribe();
      nodeSubscription.claim();
      void nodeSubscription.value.then(
        (nodes) => { if (nodeGeneration === current) runInAction(() => liveNodes.set(nodes)); },
        (error: unknown) => {
          if (nodeGeneration === current) runInAction(() => nodeFailure.set(error instanceof Error ? error.message : "Unable to read node image inventories."));
        },
      );
    } catch (error) {
      runInAction(() => nodeFailure.set(error instanceof Error ? error.message : "Unable to read node image inventories."));
    }
  };

  const inventory = computed(() => {
    const source = livePods.get();
    const pods = source?.get() ?? [];
    const replicas = replicaSets.data.get()?.get() ?? [];
    const selectedPods = filterPodsByWorkload(pods, replicas, workloadType.get(), workloadID.get());
    const containers = collectContainerImages(selectedPods, runningOnly.get());
    const nodes = liveNodes.get()?.get() ?? [];
    const allGroups: SizedImageGroup[] = groupImages(containers).map((group) => {
      const known = group.variants.filter((variant) => variant.imageID);
      return {
        ...group,
        summaryID: group.multipleIDs ? `${known.length} image IDs`
          : known[0] ? `${known[0].shortID}${known.length < group.variants.length ? " + unreported" : ""}` : "Not reported yet",
        size: sizeForContainers(group.variants.flatMap((variant) => variant.containers), nodes),
        variants: group.variants.map((variant) => ({ ...variant, size: sizeForContainers(variant.containers, nodes) })),
      };
    });
    const workloadLabels = new Map<string, string>();
    for (const pod of selectedPods) {
      const workload = resolvePodWorkload(pod, replicas);
      if (workload) workloadLabels.set(pod.metadata?.uid ?? `${pod.metadata?.namespace ?? ""}/${pod.metadata?.name ?? ""}`, `${workload.kind}/${workload.name}`);
    }
    return { containers, allGroups, workloadLabels };
  });

  const view = computed(() => {
    const { containers, allGroups, workloadLabels } = inventory.get();
    const pods = livePods.get()?.get() ?? [];
    const namespaces = [...new Set([
      ...((namespaceList.data.get()?.get() ?? []).map((entry) => entry.metadata?.name ?? "")),
      ...pods.map((pod) => pod.metadata?.namespace ?? ""), namespace.get(),
    ].filter(Boolean))].sort();
    const workloads = listWorkloads(pods, replicaSets.data.get()?.get() ?? [], deployments.data.get()?.get() ?? [], statefulSets.data.get()?.get() ?? [])
      .filter((workload) => !workloadType.get() || workload.kind === workloadType.get());
    const sizedGroups = new Map(allGroups.map((group) => [group.id, group]));
    const groups = groupImages(containers, search.get(), multipleOnly.get(), {
      tagOrPin: tagOrPin.get(), pinning: pinning.get(), multipleNamespacesOnly: multipleNamespacesOnly.get(),
    }).map((group) => sizedGroups.get(group.id)!);
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
      status: failure.get() ? "error" as const : livePods.get() ? "ready" as const : "loading" as const,
      error: failure.get(), groups, namespaces, workloads, workloadLabels,
      workloadStatus: scopedMetadata.some((slot) => slot.error.get()) ? "error" as const
        : scopedMetadata.some((slot) => slot.configured && !slot.data.get()) ? "loading" as const : "ready" as const,
      sizeStatus: nodeFailure.get() ? "error" as const : liveNodes.get() ? "ready" as const : nodesForCluster ? "loading" as const : "unavailable" as const,
      sizeError: nodeFailure.get(),
      imageCount: allGroups.length,
      containerCount: containers.length,
      multipleCount: allGroups.filter((group) => group.multipleIDs).length,
      namespaceCount: new Set(containers.map((container) => container.namespace)).size,
    };
  });

  onBecomeObserved(view, () => { observed = true; start(); startNodes(); namespaceList.start(); scopedMetadata.forEach((slot) => slot.start()); });
  onBecomeUnobserved(view, () => { observed = false; stop(); stopNodes(); namespaceList.stop(); scopedMetadata.forEach((slot) => slot.stop()); });

  const changeNamespace = (next: string) => {
    namespaceError.set("");
    namespaceDraft.set(next);
    if (next !== namespace.get()) {
      namespace.set(next); workloadID.set(""); expanded.clear(); start();
      if (observed) scopedMetadata.forEach((slot) => slot.start());
    }
  };

  return {
    view, search, tagOrPin, pinning, namespace, namespaceDraft, namespaceError, runningOnly, multipleOnly, multipleNamespacesOnly, expanded, sort, descending, workloadType, workloadID,
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
      changeNamespace(next);
    }),
    selectNamespace: action((event: ChangeEvent<HTMLSelectElement>) => changeNamespace(event.currentTarget.value)),
    selectWorkloadType: action((event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.currentTarget.value;
      if (next === "" || next === "Deployment" || next === "StatefulSet") {
        workloadType.set(next); workloadID.set(""); expanded.clear();
      }
    }),
    selectWorkload: action((event: ChangeEvent<HTMLSelectElement>) => { workloadID.set(event.currentTarget.value); expanded.clear(); }),
    setRunningOnly: action((event: ChangeEvent<HTMLInputElement>) => runningOnly.set(event.currentTarget.checked)),
    setMultipleOnly: action((event: ChangeEvent<HTMLInputElement>) => multipleOnly.set(event.currentTarget.checked)),
    setMultipleNamespacesOnly: action((event: ChangeEvent<HTMLInputElement>) => multipleNamespacesOnly.set(event.currentTarget.checked)),
    toggleExpanded: action((id: string) => { expanded.has(id) ? expanded.delete(id) : expanded.add(id); }),
    sortBy: action((column: "image" | "tag" | "size" | "count") => {
      descending.set(sort.get() === column ? !descending.get() : column === "count" || column === "size");
      sort.set(column);
    }),
    refresh: () => {
      failure.get() ? start() : subscription?.refresh();
      nodeFailure.get() ? startNodes() : nodeSubscription?.refresh();
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
