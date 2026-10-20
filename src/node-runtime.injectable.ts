import { getInjectable2 } from "@k8slens/injectable";
import { coreV1, kubeResourcesInjectionToken, nodeKind } from "@k8slens/kubernetes-contracts";
import type { Subscribable } from "@k8slens/subscribable";
import { computed, onBecomeObserved, onBecomeUnobserved } from "mobx";
import { createResourceState } from "./resource-state";
import { describeNodeRuntime, type RuntimeNodeLike } from "./node-runtime";

export interface NodeRuntimeSnapshot {
  readonly nodes: readonly RuntimeNodeLike[];
  readonly reason: string;
}

/** Own a Node subscription only while a runtime view observes the computed snapshot. */
export function createNodeRuntimeState(nodesForCluster?: () => Subscribable<readonly RuntimeNodeLike[]>) {
  const resource = createResourceState(nodesForCluster);
  const snapshot = computed<NodeRuntimeSnapshot>(() => {
    const nodes = resource.data.get();
    if (resource.error.get()) return { nodes: [], reason: "Node data could not be read." };
    try {
      return {
        nodes: nodes?.get() ?? [],
        reason: nodes ? "" : nodesForCluster ? "Node data has not loaded yet." : "Node data is unavailable.",
      };
    } catch {
      return { nodes: [], reason: "Node data could not be read." };
    }
  });
  onBecomeObserved(snapshot, resource.start);
  onBecomeUnobserved(snapshot, resource.stop);
  return snapshot;
}

export const nodeRuntimeStateInjectable = getInjectable2({
  id: "lens-image-explorer-node-runtime-state",
  consumptions: [kubeResourcesInjectionToken],
  instantiate: (di) => {
    const resources = di.inject(kubeResourcesInjectionToken)();
    return (clusterId: string) => createNodeRuntimeState(() => resources(nodeKind, coreV1, clusterId));
  },
});

export const nodeRuntimeDetailsInjectable = getInjectable2({
  id: "lens-image-explorer-node-runtime-details",
  // Bound derived entries only; the shared per-cluster subscription owner stays stable.
  maxCacheSize: 1024,
  instantiate: (di) => {
    const stateForCluster = di.inject(nodeRuntimeStateInjectable);
    return (clusterId: string, nodeName: string) => {
      const state = stateForCluster(clusterId);
      return computed(() => {
        if (!nodeName) return describeNodeRuntime("", []);
        const snapshot = state.get();
        return describeNodeRuntime(nodeName, snapshot.nodes, snapshot.reason);
      });
    };
  },
});
