import { isValidImageDigest } from "./registry-model";

interface ContainerSpecLike {
  readonly name: string;
  readonly image?: string;
}

interface ContainerStatusLike {
  readonly name: string;
  readonly image?: string;
  readonly imageID?: string;
  readonly ready?: boolean;
  readonly state?: {
    readonly running?: unknown;
    readonly waiting?: unknown;
    readonly terminated?: unknown;
  };
}

/** The Pod fields this view needs; Kubernetes PodV1 resources fit this shape. */
export interface PodLike {
  readonly metadata?: {
    readonly uid?: string;
    readonly name?: string;
    readonly namespace?: string;
  };
  readonly spec?: {
    readonly nodeName?: string;
    readonly containers?: readonly ContainerSpecLike[];
    readonly initContainers?: readonly ContainerSpecLike[];
    readonly ephemeralContainers?: readonly ContainerSpecLike[];
  };
  readonly status?: {
    readonly phase?: string;
    readonly containerStatuses?: readonly ContainerStatusLike[];
    readonly initContainerStatuses?: readonly ContainerStatusLike[];
    readonly ephemeralContainerStatuses?: readonly ContainerStatusLike[];
  };
}

export interface ContainerImage {
  readonly id: string;
  readonly podUID: string;
  readonly podName: string;
  readonly namespace: string;
  readonly containerName: string;
  readonly kind: "container" | "init" | "ephemeral";
  readonly requestedImage: string;
  readonly reportedImage: string;
  readonly imageID: string;
  readonly nodeName: string;
  readonly state: "running" | "waiting" | "terminated" | "unknown";
  readonly ready: boolean;
}

export interface ImageVariant {
  readonly id: string;
  readonly imageID: string;
  readonly shortID: string;
  readonly containers: ContainerImage[];
}

export interface ImageGroup {
  readonly id: string;
  readonly requestedImage: string;
  readonly repository: string;
  readonly tag: string;
  readonly pinnedDigest: string;
  readonly variants: ImageVariant[];
  readonly containerCount: number;
  readonly runningCount: number;
  readonly namespaces: string[];
  readonly namespaceUsages: NamespaceUsage[];
  readonly multipleIDs: boolean;
}

export type ImagePinning = "all" | "pinned" | "unpinned";

export interface ImageMetadataFilters {
  readonly tagOrPin?: string;
  readonly pinning?: ImagePinning;
  readonly multipleNamespacesOnly?: boolean;
}

export interface NamespaceUsage {
  readonly namespace: string;
  readonly containerCount: number;
}

export function parseImageReference(image: string): {
  repository: string;
  tag: string;
  pinnedDigest: string;
} {
  const digestSeparator = image.indexOf("@");
  const reference = digestSeparator < 0 ? image : image.slice(0, digestSeparator);
  const digest = digestSeparator < 0 ? "" : image.slice(digestSeparator + 1);
  const pinnedDigest = isValidImageDigest(digest) ? digest : "";
  const tagSeparator = reference.lastIndexOf(":");
  const hasTag = tagSeparator > reference.lastIndexOf("/");

  return {
    repository: hasTag ? reference.slice(0, tagSeparator) : reference,
    tag: hasTag ? reference.slice(tagSeparator + 1) : "(implicit)",
    pinnedDigest,
  };
}

/** Only abbreviate familiar hash forms; retain unknown runtime formats verbatim. */
export function shortImageID(raw: string): string {
  if (!raw) {
    return "Not reported yet";
  }

  const digest = /(?:^|@|:\/\/)(sha256|sha384|sha512):([a-fA-F0-9]{12,})$/.exec(raw);

  if (!digest) {
    return raw;
  }

  const [, algorithm, hash] = digest;

  return `${algorithm}:${hash.slice(0, 12)}${hash.length > 12 ? "…" : ""}`;
}

function containerState(status: ContainerStatusLike | undefined): ContainerImage["state"] {
  const state = status?.state;

  if (state?.running != null) {
    return "running";
  }

  if (state?.waiting != null) {
    return "waiting";
  }

  if (state?.terminated != null) {
    return "terminated";
  }

  return "unknown";
}

export function collectContainerImages(
  pods: readonly PodLike[],
  runningOnly = true,
): ContainerImage[] {
  const images: ContainerImage[] = [];

  for (const pod of pods) {
    const namespace = pod.metadata?.namespace ?? "";
    const podName = pod.metadata?.name ?? "";
    const podUID = pod.metadata?.uid ?? `${namespace}/${podName}`;
    const nodeName = pod.spec?.nodeName ?? "";
    const categories = [
      ["container", pod.spec?.containers, pod.status?.containerStatuses],
      ["init", pod.spec?.initContainers, pod.status?.initContainerStatuses],
      ["ephemeral", pod.spec?.ephemeralContainers, pod.status?.ephemeralContainerStatuses],
    ] as const;

    for (const [kind, containers, statuses] of categories) {
      const statusesByName = new Map(statuses?.map((status) => [status.name, status]));

      for (const container of containers ?? []) {
        const status = statusesByName.get(container.name);
        const state = containerState(status);

        if (runningOnly && state !== "running") {
          continue;
        }

        images.push({
          id: `${podUID}:${kind}:${container.name}`,
          podUID,
          podName,
          namespace,
          containerName: container.name,
          kind,
          requestedImage: container.image ?? "",
          reportedImage: status?.image ?? "",
          imageID: status?.imageID ?? "",
          nodeName,
          state,
          ready: status?.ready === true,
        });
      }
    }
  }

  return images;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Count every container usage in the supplied scope, retaining exact namespace names. */
export function summarizeNamespaceUsage(containers: readonly ContainerImage[]): NamespaceUsage[] {
  const counts = new Map<string, number>();
  for (const container of containers) counts.set(container.namespace, (counts.get(container.namespace) ?? 0) + 1);
  return [...counts].sort(([left], [right]) => lexical(left, right))
    .map(([namespace, containerCount]) => ({ namespace, containerCount }));
}

function matchesMetadata(
  reference: ReturnType<typeof parseImageReference>,
  namespaceCount: number,
  tagOrPinNeedle: string,
  filters: ImageMetadataFilters,
): boolean {
  if (filters.multipleNamespacesOnly && namespaceCount < 2) return false;
  const pinned = Boolean(reference.pinnedDigest);
  if ((filters.pinning === "pinned" && !pinned) || (filters.pinning === "unpinned" && pinned)) return false;
  return !tagOrPinNeedle || (reference.tag !== "(implicit)" && reference.tag.toLowerCase().includes(tagOrPinNeedle))
    || reference.pinnedDigest.toLowerCase().includes(tagOrPinNeedle);
}

function matchesReference(requestedImage: string, reference: ReturnType<typeof parseImageReference>, needle: string): boolean {
  return requestedImage.toLowerCase().includes(needle) || reference.repository.toLowerCase().includes(needle)
    || reference.tag.toLowerCase().includes(needle) || reference.pinnedDigest.toLowerCase().includes(needle);
}

function matchesContainer(container: ContainerImage, needle: string): boolean {
  return container.reportedImage.toLowerCase().includes(needle) || container.imageID.toLowerCase().includes(needle)
    || container.podName.toLowerCase().includes(needle) || container.namespace.toLowerCase().includes(needle)
    || container.containerName.toLowerCase().includes(needle) || container.nodeName.toLowerCase().includes(needle);
}

/** Filter existing groups without rebuilding variants, namespace counts, or usage arrays. */
export function filterImageGroups<T extends ImageGroup>(
  groups: readonly T[],
  query = "",
  multipleOnly = false,
  filters: ImageMetadataFilters = {},
): T[] {
  const needle = query.trim().toLowerCase();
  const tagOrPinNeedle = (filters.tagOrPin ?? "").trim().toLowerCase();
  return groups.filter((group) => (!multipleOnly || group.multipleIDs)
    && matchesMetadata(group, group.namespaceUsages.length, tagOrPinNeedle, filters)
    && (!needle || matchesReference(group.requestedImage, group, needle)
      || group.variants.some((variant) => variant.containers.some((container) => matchesContainer(container, needle)))));
}

export function groupImages(
  containers: readonly ContainerImage[],
  query = "",
  multipleOnly = false,
  filters: ImageMetadataFilters = {},
): ImageGroup[] {
  const byImage = new Map<string, ContainerImage[]>();

  for (const container of containers) {
    const imageContainers = byImage.get(container.requestedImage);

    if (imageContainers) {
      imageContainers.push(container);
    } else {
      byImage.set(container.requestedImage, [container]);
    }
  }

  const needle = query.trim().toLowerCase();
  const tagOrPinNeedle = (filters.tagOrPin ?? "").trim().toLowerCase();
  const groups: ImageGroup[] = [];

  for (const [requestedImage, imageContainers] of byImage) {
    const reference = parseImageReference(requestedImage);
    const namespaceUsages = summarizeNamespaceUsage(imageContainers);
    if (!matchesMetadata(reference, namespaceUsages.length, tagOrPinNeedle, filters)) continue;
    const byID = new Map<string, ContainerImage[]>();

    for (const container of imageContainers) {
      const variantContainers = byID.get(container.imageID);

      if (variantContainers) {
        variantContainers.push(container);
      } else {
        byID.set(container.imageID, [container]);
      }
    }

    const multipleIDs = [...byID.keys()].filter((id) => id !== "").length > 1;

    if (multipleOnly && !multipleIDs) {
      continue;
    }

    if (needle && !matchesReference(requestedImage, reference, needle)
      && !imageContainers.some((container) => matchesContainer(container, needle))) continue;

    groups.push({
      id: requestedImage,
      requestedImage,
      ...reference,
      variants: [...byID].sort(([left], [right]) => lexical(left, right)).map(([imageID, usages]) => ({
        id: imageID,
        imageID,
        shortID: shortImageID(imageID),
        containers: [...usages].sort((left, right) => lexical(left.id, right.id)),
      })),
      containerCount: imageContainers.length,
      runningCount: imageContainers.filter((container) => container.state === "running").length,
      namespaces: namespaceUsages.map((usage) => usage.namespace),
      namespaceUsages,
      multipleIDs,
    });
  }

  return groups.sort((left, right) => lexical(left.requestedImage, right.requestedImage));
}
