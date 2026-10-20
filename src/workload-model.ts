import type { PodLike } from "./image-model";

export interface OwnerReferenceLike {
  readonly kind: string;
  readonly name: string;
  readonly uid?: string;
  readonly controller?: boolean;
  readonly apiVersion?: string;
}

export interface WorkloadPodLike extends PodLike {
  readonly metadata?: NonNullable<PodLike["metadata"]> & {
    readonly ownerReferences?: readonly OwnerReferenceLike[];
  };
}

export interface ReplicaSetLike {
  readonly metadata?: {
    readonly uid?: string;
    readonly name?: string;
    readonly namespace?: string;
    readonly ownerReferences?: readonly OwnerReferenceLike[];
  };
}

export interface WorkloadResourceLike {
  readonly metadata?: {
    readonly uid?: string;
    readonly name?: string;
    readonly namespace?: string;
  };
}

export interface NamespaceLike {
  readonly metadata?: {
    readonly name?: string;
  };
}

export type WorkloadKind = "Deployment" | "StatefulSet";

export interface WorkloadOption {
  readonly id: string;
  readonly kind: WorkloadKind;
  readonly name: string;
  readonly namespace: string;
}

function controllerOwner(owners: readonly OwnerReferenceLike[] | undefined): OwnerReferenceLike | undefined {
  const owner = owners?.find((candidate) => candidate.controller === true);

  return owner?.name && (owner.apiVersion === undefined || /^apps\/[^/]+$/.test(owner.apiVersion)) ? owner : undefined;
}

function option(kind: WorkloadKind, namespace: string, name: string, uid?: string): WorkloadOption {
  return { id: `${namespace}/${kind}/${uid || name}`, kind, namespace, name };
}

function replicaSetIndex(replicaSets: readonly ReplicaSetLike[]): Map<string, ReplicaSetLike> {
  const index = new Map<string, ReplicaSetLike>();

  for (const replicaSet of replicaSets) {
    const { uid, namespace } = replicaSet.metadata ?? {};

    if (uid && namespace) {
      index.set(`${namespace}\0${uid}`, replicaSet);
    }
  }

  return index;
}

function resolveWithIndex(
  pod: WorkloadPodLike,
  replicaSets: ReadonlyMap<string, ReplicaSetLike>,
): WorkloadOption | undefined {
  const namespace = pod.metadata?.namespace;
  const owner = controllerOwner(pod.metadata?.ownerReferences);

  if (!namespace || !owner) {
    return undefined;
  }

  if (owner.kind === "StatefulSet") {
    return option("StatefulSet", namespace, owner.name, owner.uid);
  }

  // ReplicaSet UIDs distinguish a controller from a deleted/recreated namesake.
  // Missing UIDs deliberately cannot establish Deployment membership.
  if (owner.kind !== "ReplicaSet" || !owner.uid) {
    return undefined;
  }

  const replicaSet = replicaSets.get(`${namespace}\0${owner.uid}`);

  if (replicaSet?.metadata?.name !== owner.name) {
    return undefined;
  }

  const deployment = controllerOwner(replicaSet.metadata.ownerReferences);

  return deployment?.kind === "Deployment"
    ? option("Deployment", namespace, deployment.name, deployment.uid)
    : undefined;
}

export function resolvePodWorkload(
  pod: WorkloadPodLike,
  replicaSets: readonly ReplicaSetLike[],
): WorkloadOption | undefined {
  return createWorkloadResolver(replicaSets)(pod);
}

/** Reuse the exact-UID ownership index when resolving a Pod snapshot. */
export function createWorkloadResolver(replicaSets: readonly ReplicaSetLike[]) {
  const index = replicaSetIndex(replicaSets);
  return (pod: WorkloadPodLike): WorkloadOption | undefined => resolveWithIndex(pod, index);
}

export function listWorkloads(
  pods: readonly WorkloadPodLike[],
  replicaSets: readonly ReplicaSetLike[],
  deployments: readonly WorkloadResourceLike[],
  statefulSets: readonly WorkloadResourceLike[],
): WorkloadOption[] {
  const options = new Map<string, WorkloadOption>();

  for (const [kind, resources] of [["Deployment", deployments], ["StatefulSet", statefulSets]] as const) {
    for (const resource of resources) {
      const { namespace, name, uid } = resource.metadata ?? {};

      if (namespace && name) {
        const workload = option(kind, namespace, name, uid);
        options.set(workload.id, workload);
      }
    }
  }

  const index = replicaSetIndex(replicaSets);

  for (const pod of pods) {
    const workload = resolveWithIndex(pod, index);

    if (workload && !options.has(workload.id)) {
      options.set(workload.id, workload);
    }
  }

  return [...options.values()].sort((left, right) => {
    const a = `${left.namespace}\0${left.kind}\0${left.name}\0${left.id}`;
    const b = `${right.namespace}\0${right.kind}\0${right.name}\0${right.id}`;

    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export function filterPodsByWorkload(
  pods: readonly WorkloadPodLike[],
  replicaSets: readonly ReplicaSetLike[],
  type: "" | WorkloadKind,
  workloadID: string,
): WorkloadPodLike[] {
  if (!type && !workloadID) {
    return [...pods];
  }

  const index = replicaSetIndex(replicaSets);

  return pods.filter((pod) => {
    const workload = resolveWithIndex(pod, index);

    return workload !== undefined && (!type || workload.kind === type) && (!workloadID || workload.id === workloadID);
  });
}
