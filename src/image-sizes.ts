import type { ContainerImage } from "./image-model";

/** Node fields used for the node-reported size of a locally cached image. */
export interface NodeLike {
  readonly metadata?: {
    readonly name?: string;
  };
  readonly status?: {
    readonly images?: readonly {
      readonly names?: readonly string[];
      readonly sizeBytes?: number;
    }[];
  };
}

export interface ImageSize {
  readonly label: string;
  readonly minBytes?: number;
  readonly maxBytes?: number;
  readonly matchedContainers: number;
  readonly totalContainers: number;
}

/** Keep repository-qualified digests separate from bare runtime/config digests. */
function immutableImageID(raw: string): string | undefined {
  const reference = raw.replace(/^(?:docker-pullable|docker|containerd|cri-o):\/\//i, "");

  if (reference.includes("://")) {
    return undefined;
  }

  const match = /^(?:([^@\s]+)@)?(sha256|sha384|sha512):([a-f0-9]+)$/i.exec(reference);

  if (!match) {
    return undefined;
  }

  const [, repository, rawAlgorithm, rawHash] = match;
  const algorithm = rawAlgorithm.toLowerCase();
  const expectedLength = algorithm === "sha256" ? 64 : algorithm === "sha384" ? 96 : 128;

  if (rawHash.length !== expectedLength) {
    return undefined;
  }

  return `${repository ? `${repository}@` : ""}${algorithm}:${rawHash.toLowerCase()}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unavailable";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
  const unit = bytes === 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** Math.max(unit, 0);

  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${units[Math.max(unit, 0)]}`;
}

/**
 * Match immutable aliases on the exact node running the container. Node sizes
 * describe image caches; repeated containers do not add to an image's size.
 */
export function sizeForContainers(
  containers: readonly ContainerImage[],
  nodes: readonly NodeLike[],
): ImageSize {
  const byNode = new Map<string, Map<string, Set<number>>>();

  for (const node of nodes) {
    const nodeName = node.metadata?.name;

    if (!nodeName) {
      continue;
    }

    const aliases = byNode.get(nodeName) ?? new Map<string, Set<number>>();
    byNode.set(nodeName, aliases);

    for (const image of node.status?.images ?? []) {
      const size = image.sizeBytes;

      if (size === undefined || !Number.isFinite(size) || size < 0) {
        continue;
      }

      for (const name of image.names ?? []) {
        const alias = immutableImageID(name);

        if (!alias) {
          continue;
        }

        const sizes = aliases.get(alias) ?? new Set<number>();
        sizes.add(size);
        aliases.set(alias, sizes);
      }
    }
  }

  let matchedContainers = 0;
  let minBytes = Infinity;
  let maxBytes = -Infinity;

  for (const container of containers) {
    const alias = immutableImageID(container.imageID);
    const sizes = alias ? byNode.get(container.nodeName)?.get(alias) : undefined;

    if (!sizes?.size) {
      continue;
    }

    matchedContainers += 1;

    for (const size of sizes) {
      minBytes = Math.min(minBytes, size);
      maxBytes = Math.max(maxBytes, size);
    }
  }

  const totalContainers = containers.length;

  if (matchedContainers === 0) {
    return { label: "Unavailable", matchedContainers, totalContainers };
  }

  const range = minBytes === maxBytes ? formatBytes(minBytes) : `${formatBytes(minBytes)}–${formatBytes(maxBytes)}`;

  return {
    label: `${range}${matchedContainers < totalContainers ? " · partial" : ""}`,
    minBytes,
    maxBytes,
    matchedContainers,
    totalContainers,
  };
}
