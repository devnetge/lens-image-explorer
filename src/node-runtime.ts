export interface RuntimeNodeLike {
  readonly metadata?: { readonly name?: string };
  readonly status?: { readonly nodeInfo?: { readonly containerRuntimeVersion?: string } };
}

export interface NodeRuntimeInfo {
  readonly available: boolean;
  readonly label: string;
  readonly runtime: string;
  readonly version: string;
  readonly reported: string;
  readonly reason: string;
}

/** Parse only a safe Node-reported runtime/version pair, preserving vendor version suffixes. */
export function parseNodeRuntimeVersion(reported: string): {
  readonly runtime: string;
  readonly version: string;
  readonly reported: string;
} | undefined {
  if (typeof reported !== "string" || reported.length > 512 || /[\s\u0000-\u001f\u007f]/.test(reported)) return undefined;
  const match = /^([A-Za-z][A-Za-z0-9._-]{0,63}):\/\/([vV]?[0-9][A-Za-z0-9.+_~-]{0,255})$/.exec(reported);
  if (!match) return undefined;
  return { runtime: match[1], version: match[2], reported };
}

function unavailable(reason: string): NodeRuntimeInfo {
  return { available: false, label: "Unavailable", runtime: "", version: "", reported: "", reason };
}

/** Resolve the Pod's exact assigned Node; image-ID schemes never establish a runtime or version. */
export function describeNodeRuntime(
  nodeName: string,
  nodes: readonly RuntimeNodeLike[],
  unavailableReason?: string,
): NodeRuntimeInfo {
  if (!nodeName) return unavailable("The Pod has not been assigned to a Node.");
  if (unavailableReason) {
    return unavailable("Node runtime information is unavailable because Node data could not be read or has not loaded.");
  }
  const node = nodes.find((candidate) => candidate.metadata?.name === nodeName);
  if (!node) return unavailable("The assigned Node is not present in the available Node data.");
  const reported = node.status?.nodeInfo?.containerRuntimeVersion;
  if (!reported) return unavailable("The assigned Node has not reported a container runtime and version.");
  const parsed = parseNodeRuntimeVersion(reported);
  if (!parsed) return unavailable("The assigned Node reported an unsupported runtime/version format.");
  return {
    available: true, label: `${parsed.runtime} ${parsed.version}`, ...parsed,
    reason: "Reported by the Pod's assigned Node. This is the Node runtime and version, not the image version or execution handler.",
  };
}
