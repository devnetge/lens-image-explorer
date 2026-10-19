import { getAskAiFunctionInjectableBunch, getAskAiFunctionKind } from "@k8slens/ask-ai-contracts";
import { coreV1, kubeResourcesInjectionToken, nodeKind, podKind } from "@k8slens/kubernetes-contracts";
import type { Subscribable, Subscription } from "@k8slens/subscribable";
import { collectContainerImages, type PodLike } from "./image-model";
import { describeNodeRuntime, type NodeRuntimeInfo, type RuntimeNodeLike } from "./node-runtime";
import { describeRegistry } from "./registry-model";

export interface ImageRuntimesInput {
  readonly clusterId: string;
  readonly namespace?: string;
  readonly imageReference?: string;
  readonly runningOnly?: boolean;
  readonly limit?: number;
}

export interface ImageRuntimesResult {
  readonly clusterId: string;
  readonly namespace: string | null;
  readonly totalMatched: number;
  readonly returned: number;
  readonly truncated: boolean;
  readonly omittedInvalidReferences: number;
  readonly nodeStatus: "ready" | "unavailable";
  readonly nodeReason: string;
  readonly images: {
    readonly requestedImage: string;
    readonly containerCount: number;
    readonly totalNodeUsages: number;
    readonly usagesTruncated: boolean;
    readonly usages: {
      readonly nodeName: string;
      readonly runtime: NodeRuntimeInfo;
      readonly containerCount: number;
    }[];
  }[];
  readonly evidence: string;
}

const nodeUsageLimit = 100;

function validateInput(input: ImageRuntimesInput): Required<ImageRuntimesInput> {
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.clusterId !== "string" ||
    !input.clusterId.trim() || input.clusterId.length > 512 || /[\u0000-\u001f\u007f]/.test(input.clusterId)) {
    throw new Error("Provide a nonempty Lens cluster id.");
  }
  if (input.namespace !== undefined && (typeof input.namespace !== "string" ||
    (input.namespace.trim() !== "" && (input.namespace.trim().length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(input.namespace.trim()))))) {
    throw new Error("Namespace must be a Kubernetes namespace name or an empty string.");
  }
  if (input.imageReference !== undefined && (typeof input.imageReference !== "string" ||
    !input.imageReference || input.imageReference.length > 4096 || !describeRegistry(input.imageReference).registry)) {
    throw new Error("Provide an exact configured container image reference without a URL scheme, credentials, or whitespace.");
  }
  if (input.runningOnly !== undefined && typeof input.runningOnly !== "boolean") {
    throw new Error("Running-only must be a boolean.");
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
    throw new Error("The result limit must be an integer from 1 to 100.");
  }
  return { clusterId: input.clusterId.trim(), namespace: input.namespace?.trim() ?? "",
    imageReference: input.imageReference ?? "", runningOnly: input.runningOnly ?? true, limit: input.limit ?? 50 };
}

function safeNodeName(name: string): boolean {
  return Boolean(name && name.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(name));
}

/** Read scoped Pods and optional Node metadata without retaining either consumer's watch. */
export function createImageRuntimesQuery(
  podsForScope: (clusterId: string, namespace?: string) => Subscribable<readonly PodLike[]>,
  nodesForCluster: (clusterId: string) => Subscribable<readonly RuntimeNodeLike[]>,
  snapshotTimeoutMs = 30_000,
) {
  return async (input: ImageRuntimesInput): Promise<ImageRuntimesResult> => {
    const options = validateInput(input);
    const cancelled = Symbol("image-runtime-query-finished");
    let cancel!: (value: typeof cancelled) => void;
    const cancellation = new Promise<typeof cancelled>((resolve) => { cancel = resolve; });
    const cleanups = new Set<() => void>();
    const podTimeout = new Error("Reading Pod runtimes timed out. Check the cluster connection and try again.");
    const nodeTimeout = new Error("Node snapshot timed out.");

    const readSnapshot = async <T>(load: () => Subscribable<readonly T[]>, timeoutError: Error): Promise<readonly T[]> => {
      let subscription: Subscription<readonly T[]> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let disposed = false;
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        clearTimeout(timeout);
        cleanups.delete(cleanup);
        try { subscription?.dispose(); } catch { /* Do not expose host errors or prevent sibling cleanup. */ }
      };
      cleanups.add(cleanup);
      try {
        subscription = load().subscribe();
        subscription.claim();
        const snapshot = await Promise.race([
          subscription.value,
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(timeoutError), snapshotTimeoutMs); }),
          cancellation,
        ]);
        if (snapshot === cancelled) throw cancelled;
        return snapshot.get();
      } finally {
        cleanup();
      }
    };

    try {
      const pods = readSnapshot(() => podsForScope(options.clusterId, options.namespace || undefined), podTimeout)
        .catch((error: unknown) => {
          if (error === podTimeout) throw podTimeout;
          throw new Error("Unable to read Pod runtimes. Check cluster connectivity and Pod read access for this namespace.");
        });
      const nodes = readSnapshot(() => nodesForCluster(options.clusterId), nodeTimeout)
        .then((values) => ({ values, status: "ready" as const, reason: "" }))
        .catch((error: unknown) => ({ values: [] as readonly RuntimeNodeLike[], status: "unavailable" as const,
          reason: error === nodeTimeout ? "Node runtime information is unavailable because reading Nodes timed out."
            : "Node runtime information is unavailable because Node data could not be read." }));
      const [podSnapshot, nodeSnapshot] = await Promise.all([pods, nodes]);
      const scopedPods = options.namespace ? podSnapshot.filter((pod) => pod.metadata?.namespace === options.namespace) : podSnapshot;
      const grouped = new Map<string, Map<string, number>>();
      for (const container of collectContainerImages(scopedPods, options.runningOnly)) {
        if (options.imageReference && container.requestedImage !== options.imageReference) continue;
        let usages = grouped.get(container.requestedImage);
        if (!usages) { usages = new Map(); grouped.set(container.requestedImage, usages); }
        usages.set(container.nodeName, (usages.get(container.nodeName) ?? 0) + 1);
      }
      const references = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
      const validReferences = references.filter((reference) => Boolean(describeRegistry(reference).registry));
      const images = validReferences.slice(0, options.limit).map((requestedImage) => {
        const nodeGroups = [...grouped.get(requestedImage)!.entries()].sort(([a], [b]) => a.localeCompare(b));
        const usages = nodeGroups.slice(0, nodeUsageLimit).map(([nodeName, containerCount]) => {
          const safeName = safeNodeName(nodeName);
          return { nodeName: safeName ? nodeName : "", containerCount,
            runtime: describeNodeRuntime(nodeName, nodeSnapshot.values,
              nodeSnapshot.reason || (nodeName && !safeName ? "Unavailable Node name." : undefined)) };
        });
        return { requestedImage, containerCount: nodeGroups.reduce((count, [, containers]) => count + containers, 0),
          totalNodeUsages: nodeGroups.length, usagesTruncated: nodeGroups.length > usages.length, usages };
      });
      return { clusterId: options.clusterId, namespace: options.namespace || null, totalMatched: references.length,
        returned: images.length, truncated: validReferences.length > images.length,
        omittedInvalidReferences: references.length - validReferences.length,
        nodeStatus: nodeSnapshot.status, nodeReason: nodeSnapshot.reason, images,
        evidence: "One scoped Lens Pod snapshot joined by assigned Node name to one independent Node snapshot. " +
          "Runtime and version come from Node.status.nodeInfo.containerRuntimeVersion; they describe the Node, " +
          "not a registry artifact or the runtime identity of an individual container. Image pins and runtime " +
          "image-ID prefixes are not used to infer a runtime. Missing or unreadable Node data is Unavailable. " +
          "Each reference includes at most 100 Node usage groups; totalNodeUsages and usagesTruncated identify omissions. " +
          "Invalid configured references and unsafe Node names are omitted from returned fields. No Pod names, " +
          "whole Pod specs, environment variables, credentials, or runtime image IDs are returned. No registry requests or UI changes are performed.",
      };
    } finally {
      cancel(cancelled);
      for (const cleanup of [...cleanups]) cleanup();
    }
  };
}

export const imageRuntimesFunctionKind = getAskAiFunctionKind<ImageRuntimesInput, ImageRuntimesResult>()("describe-image-runtimes");

export const imageRuntimesQueryBunch = getAskAiFunctionInjectableBunch({
  kind: imageRuntimesFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Reports the Node-reported container runtime and version for configured images used in one cluster through " +
    "Image Explorer. Use it to compare containerd, CRI-O, Docker or other reported runtimes across Nodes, or to " +
    "explain unavailable runtime metadata. It reads Pods and optional Nodes concurrently with a 30-second snapshot " +
    "timeout and releases its subscriptions. Node access failures preserve Pod image results with Unavailable " +
    "runtime metadata. It does not infer runtimes from image-ID prefixes or pins. For image/tag/digest searching " +
    "use search-container-images; for registry provider and visibility use describe-image-registry.",
  inputDescription:
    "`clusterId` (string, required): the Lens cluster id for the conversation's cluster. `namespace` (optional " +
    "string): a Kubernetes namespace, absent or empty for all namespaces. `imageReference` (optional string): " +
    "an exact configured image reference, including its tag or pin; omitted for all references. Do not supply " +
    "a URL scheme, credentials, or whitespace. `runningOnly` (optional boolean): include only running containers; " +
    "defaults true. `limit` (optional integer, 1-100): maximum image references in lexical order; defaults 50.",
  outputDescription:
    "`clusterId` (string) and `namespace` (string or null for all) identify the scope. `totalMatched` (integer) " +
    "counts matching configured references before safety omissions and the limit; `returned` (integer) counts " +
    "returned references; `truncated` (boolean) indicates valid references excluded by the limit. " +
    "`omittedInvalidReferences` (integer) counts unsafe or invalid references omitted. `nodeStatus` (string, " +
    "ready/unavailable) and `nodeReason` (string, empty when ready) describe the optional Node snapshot. " +
    "`images` (array) contains `requestedImage` (string, full configured reference), `containerCount` (integer, " +
    "matching container usages), `totalNodeUsages` (integer), `usagesTruncated` (boolean), and `usages` (array, " +
    "at most 100 Node groups). Each usage has `nodeName` (string, empty if unscheduled or unsafe), `containerCount` " +
    "(integer), and `runtime` (object): `available` (boolean), `label` (string), `runtime` (string), `version` " +
    "(string), `reported` (string, safe original Node report), and `reason` (string, source or availability explanation). " +
    "Unavailable reports have empty runtime/version/reported fields and an explanatory reason. `evidence` (string) " +
    "describes the source, non-atomic snapshots, bounds, and verification limits. No Pod names, specs, environment " +
    "variables, credentials, or runtime image IDs are returned.",
  invoke: {
    consumptions: [kubeResourcesInjectionToken],
    instantiate: (di) => {
      const resources = di.inject(kubeResourcesInjectionToken)();
      const query = createImageRuntimesQuery(
        (clusterId, namespace) => resources(podKind, coreV1, clusterId, namespace),
        (clusterId) => resources(nodeKind, coreV1, clusterId),
      );
      return () => query;
    },
  },
});
