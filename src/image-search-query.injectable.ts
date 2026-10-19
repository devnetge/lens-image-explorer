import { getAskAiFunctionInjectableBunch, getAskAiFunctionKind } from "@k8slens/ask-ai-contracts";
import { coreV1, kubeResourcesInjectionToken, podKind } from "@k8slens/kubernetes-contracts";
import type { Subscribable, Subscription } from "@k8slens/subscribable";
import { collectContainerImages, groupImages, type ImagePinning, type PodLike } from "./image-model";
import { describeRegistry } from "./registry-model";

export interface ImageSearchInput {
  readonly clusterId: string;
  readonly namespace?: string;
  readonly query?: string;
  readonly tagOrPin?: string;
  readonly pinning?: ImagePinning;
  readonly runningOnly?: boolean;
  readonly multipleOnly?: boolean;
  readonly limit?: number;
}

export interface ImageSearchResult {
  readonly clusterId: string;
  readonly namespace: string | null;
  readonly totalMatched: number;
  readonly returned: number;
  readonly truncated: boolean;
  readonly omittedInvalidReferences: number;
  readonly images: {
    readonly requestedImage: string;
    readonly repository: string;
    readonly tag: string;
    readonly pinnedDigest: string;
    readonly runtimeImageIDs: string[];
    readonly omittedRuntimeImageIDCount: number;
    readonly unreportedContainerCount: number;
    readonly containerCount: number;
    readonly runningCount: number;
    readonly namespaces: string[];
    readonly multipleIDs: boolean;
  }[];
  readonly evidence: string;
}

function safeRuntimeImageID(value: string): boolean {
  if (!value || /[\s\u0000-\u001f\u007f\\?#%]/.test(value)) return false;
  const reference = value.replace(/^(?:docker-pullable|docker|containerd|cri-o):\/\//, "");
  if (reference.includes("://")) return false;
  if (!reference.includes("@")) return true;
  const details = describeRegistry(reference);
  return Boolean(details.registry && details.pinnedDigest);
}

function validateInput(input: ImageSearchInput): Required<ImageSearchInput> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    typeof input.clusterId !== "string" || !input.clusterId.trim() || input.clusterId.length > 512) {
    throw new Error("Provide a nonempty Lens cluster id.");
  }

  if (input.namespace !== undefined && (typeof input.namespace !== "string" ||
    (input.namespace.trim() !== "" && (input.namespace.trim().length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(input.namespace.trim()))))) {
    throw new Error("Namespace must be a Kubernetes namespace name or an empty string.");
  }
  for (const field of ["query", "tagOrPin"] as const) {
    if (input[field] !== undefined && (typeof input[field] !== "string" || input[field].length > 2048)) {
      throw new Error("Image search queries must be strings of at most 2048 characters.");
    }
  }
  if (input.pinning !== undefined && !["all", "pinned", "unpinned"].includes(input.pinning)) {
    throw new Error("Pinning must be all, pinned, or unpinned.");
  }
  for (const field of ["runningOnly", "multipleOnly"] as const) {
    if (input[field] !== undefined && typeof input[field] !== "boolean") {
      throw new Error("Running-only and multiple-ID selections must be booleans.");
    }
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
    throw new Error("The result limit must be an integer from 1 to 100.");
  }

  return {
    clusterId: input.clusterId.trim(), namespace: input.namespace?.trim() ?? "",
    query: input.query ?? "", tagOrPin: input.tagOrPin ?? "", pinning: input.pinning ?? "all",
    runningOnly: input.runningOnly ?? true, multipleOnly: input.multipleOnly ?? false, limit: input.limit ?? 50,
  };
}

/** Read one Pod snapshot, releasing this consumer's watch on success, error, or timeout. */
export function createImageSearchQuery(
  podsForScope: (clusterId: string, namespace?: string) => Subscribable<readonly PodLike[]>,
  snapshotTimeoutMs = 30_000,
) {
  return async (input: ImageSearchInput): Promise<ImageSearchResult> => {
    const options = validateInput(input);
    const timedOut = new Error("Reading Pod images timed out. Check the cluster connection and try again.");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let subscription: Subscription<readonly PodLike[]> | undefined;

    try {
      subscription = podsForScope(options.clusterId, options.namespace || undefined).subscribe();
      subscription.claim();
      const snapshot = await Promise.race([
        subscription.value,
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(timedOut), snapshotTimeoutMs); }),
      ]);
      const groups = groupImages(collectContainerImages(snapshot.get(), options.runningOnly), options.query,
        options.multipleOnly, { tagOrPin: options.tagOrPin, pinning: options.pinning });
      const validGroups = groups.filter((group) => Boolean(describeRegistry(group.requestedImage).registry));
      const images = validGroups.slice(0, options.limit).map((group) => {
        const runtimeIDs = group.variants.map((variant) => variant.imageID).filter(Boolean);
        const runtimeImageIDs = runtimeIDs.filter(safeRuntimeImageID);
        return {
          requestedImage: group.requestedImage, repository: group.repository, tag: group.tag,
          pinnedDigest: group.pinnedDigest, runtimeImageIDs,
          omittedRuntimeImageIDCount: runtimeIDs.length - runtimeImageIDs.length,
          unreportedContainerCount: group.variants.find((variant) => !variant.imageID)?.containers.length ?? 0,
          containerCount: group.containerCount, runningCount: group.runningCount,
          namespaces: group.namespaces, multipleIDs: group.multipleIDs,
        };
      });

      return {
        clusterId: options.clusterId, namespace: options.namespace || null,
        totalMatched: groups.length, returned: images.length, truncated: validGroups.length > images.length,
        omittedInvalidReferences: groups.length - validGroups.length, images,
        evidence: "One Lens Pod snapshot. References, tags and pins come from Pod configuration; runtime image IDs " +
          "come from container status and can differ from configured registry digests. No registry access, image " +
          "scan, node inventory, or visibility verification was performed. Invalid configured references and " +
          "unsafe runtime IDs were omitted from returned fields. Explorer filters were not changed.",
      };
    } catch (error) {
      if (error === timedOut) throw timedOut;
      throw new Error("Unable to read Pod images. Check cluster connectivity and Pod read access for this namespace.");
    } finally {
      clearTimeout(timeout);
      subscription?.dispose();
    }
  };
}

export const imageSearchFunctionKind = getAskAiFunctionKind<ImageSearchInput, ImageSearchResult>()("search-container-images");

export const imageSearchFunctionInjectableBunch = getAskAiFunctionInjectableBunch({
  kind: imageSearchFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Searches configured container images and reported runtime IDs in one cluster using Image Explorer's " +
    "filters. Use it to find references by tag, configured digest pin, runtime ID, or Pod usage without " +
    "changing the explorer UI. All filters combine with AND and each returned reference keeps all matching " +
    "scope's usages and ID variants. This is a read-only Pod snapshot with a 30-second read timeout; " +
    "the cluster must be connected and readable. For registry provider and visibility evidence for one " +
    "reference, use describe-image-registry instead.",
  inputDescription:
    "`clusterId` (string, required): the Lens cluster id for the conversation's cluster. " +
    "`namespace` (optional string): one Kubernetes namespace; absent or empty means all namespaces. " +
    "`query` (optional string): case-insensitive trimmed substring of reference, repository, tag, configured " +
    "pin, runtime ID, reported image, Pod name, namespace, container name, or node name; defaults empty. " +
    "`tagOrPin` (optional string): case-insensitive trimmed substring of an explicit configured tag or " +
    "configured digest pin only; runtime IDs and implicit-tag labels do not match; defaults empty. " +
    "`pinning` (optional string, all/pinned/unpinned): whether the reference has a configured digest pin; " +
    "defaults all. `runningOnly` (optional boolean): include only running containers; defaults true. " +
    "`multipleOnly` (optional boolean): require more than one distinct nonempty runtime image ID; defaults false. " +
    "`limit` (optional integer, 1-100): maximum image references returned in lexical order; defaults 50.",
  outputDescription:
    "`clusterId` (string): the queried Lens cluster id. `namespace` (string or null): selected namespace, " +
    "null for all. `totalMatched` (integer): references matching all filters before the result limit. " +
    "`returned` (integer): number of returned references. `omittedInvalidReferences` (integer): matching " +
    "references excluded because they are invalid or could contain credentials; totalMatched includes them. " +
    "`truncated` (boolean): more valid matching references were excluded by the result limit. " +
    "`images` (array of objects): each has `requestedImage` (string, full configured " +
    "reference), `repository` (string, reference without tag or pin), `tag` (string, explicit tag or '(implicit)'), " +
    "`pinnedDigest` (string, configured digest or empty), `runtimeImageIDs` (array of strings, exact distinct " +
    "nonempty safe IDs from status; not assumed equivalent to a configured pin), `omittedRuntimeImageIDCount` " +
    "(integer, distinct unsafe runtime IDs omitted from this image's result), `unreportedContainerCount` " +
    "(integer, usages without a runtime ID), `containerCount` (integer, usages in the selected scope), " +
    "`runningCount` (integer, running usages), `namespaces` (array of strings, usage namespaces), and " +
    "`multipleIDs` (boolean, multiple distinct known runtime IDs). `evidence` (string): source and verification limits. " +
    "Results exclude whole Pod specs, environment variables, and credentials.",
  invoke: {
    consumptions: [kubeResourcesInjectionToken],
    instantiate: (di) => {
      const resources = di.inject(kubeResourcesInjectionToken)();
      const search = createImageSearchQuery((clusterId, namespace) => resources(podKind, coreV1, clusterId, namespace));
      return () => search;
    },
  },
});
