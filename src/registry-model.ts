export type RegistryProvider =
  | "docker-hub"
  | "aws-ecr"
  | "aws-ecr-public"
  | "google-artifact-registry"
  | "google-container-registry"
  | "github-container-registry"
  | "azure-container-registry"
  | "quay"
  | "unknown";

export interface RegistryDetails {
  readonly provider: RegistryProvider;
  readonly providerLabel: string;
  /** Normalized registry authority, retaining an explicitly supplied port. */
  readonly registry: string;
  /** Image path inside the registry, without a tag or digest. */
  readonly repository: string;
  readonly tag: string;
  readonly pinnedDigest: string;
  readonly visibility: "public" | "private" | "unknown";
  readonly visibilityReason: string;
  readonly account?: string;
  readonly region?: string;
  readonly project?: string;
  readonly tooltip: string;
}

interface ParsedReference {
  readonly registry: string;
  readonly repository: string;
  readonly tag: string;
  readonly pinnedDigest: string;
  readonly explicitPort: boolean;
}

const unknownVisibility = "Repository visibility cannot be determined from the image reference; no registry access check was performed.";
const invalidReference = "The image reference is invalid or unsupported; registry and visibility could not be verified.";
const dockerAliases = new Set(["docker.io", "index.docker.io", "registry-1.docker.io"]);
const pathComponent = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const tagPattern = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Documented ECR regions/endpoints, not a guess based on an arbitrary AWS hostname.
// https://docs.aws.amazon.com/general/latest/gr/ecr.html
// https://docs.aws.amazon.com/AmazonECR/latest/userguide/ecr-requests.html
// https://docs.amazonaws.cn/AmazonECR/latest/userguide/docker-push-ecr-image.html
const ecrRegions = new Set([
  "af-south-1", "ap-east-1", "ap-east-2", "ap-south-1", "ap-south-2",
  "ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
  "ap-southeast-1", "ap-southeast-2", "ap-southeast-3", "ap-southeast-4",
  "ap-southeast-5", "ap-southeast-6", "ap-southeast-7",
  "ca-central-1", "ca-west-1", "eu-central-1", "eu-central-2",
  "eu-north-1", "eu-south-1", "eu-south-2", "eu-west-1", "eu-west-2", "eu-west-3",
  "il-central-1", "me-central-1", "me-south-1", "mx-central-1", "sa-east-1",
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "us-gov-east-1", "us-gov-west-1",
]);
const ecrFipsRegions = new Set([
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "us-gov-east-1", "us-gov-west-1",
]);

export function isValidImageDigest(digest: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9]*(?:[+._-][A-Za-z][A-Za-z0-9]*)*:[a-fA-F0-9]{32,}$/.test(digest)) {
    return false;
  }

  const [algorithm, encoded] = digest.split(":");
  const knownLengths: Readonly<Record<string, number>> = { sha256: 64, sha384: 96, sha512: 128 };
  const expectedLength = knownLengths[algorithm];
  return expectedLength === undefined || encoded.length === expectedLength;
}

function parseAuthority(authority: string): { registry: string; explicitPort: boolean } | undefined {
  let host: string;
  let port: string | undefined;

  if (authority.startsWith("[")) {
    const match = /^(\[[0-9A-Fa-f:.]+\])(?::([0-9]+))?$/.exec(authority);
    if (!match) return undefined;

    try {
      // URL validates and normalizes an IPv6 literal without making any request.
      host = new URL(`http://${match[1]}`).hostname;
    } catch {
      return undefined;
    }
    port = match[2];
  } else {
    const match = /^([^:]+)(?::([0-9]+))?$/.exec(authority);
    if (!match) return undefined;

    host = match[1].toLowerCase();
    port = match[2];
    if (host.length > 253 || !host.split(".").every((label) => dnsLabel.test(label))) return undefined;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && host.split(".").some((part) => Number(part) > 255)) return undefined;
  }

  if (port !== undefined && (port.length > 5 || Number(port) < 1 || Number(port) > 65535)) return undefined;
  return { registry: `${host}${port === undefined ? "" : `:${port}`}`, explicitPort: port !== undefined };
}

function parseReference(image: string): ParsedReference | undefined {
  // Never try to salvage URLs, userinfo, query strings, or whitespace into a hostname.
  if (!image || /[\s\\?#%]/.test(image) || image.includes("://")) return undefined;
  const parts = image.split("@");
  if (parts.length > 2 || (parts.length === 2 && !isValidImageDigest(parts[1]))) return undefined;

  let name = parts[0];
  const pinnedDigest = parts[1] ?? "";
  let tag = "(implicit)";
  const tagSeparator = name.lastIndexOf(":");
  if (tagSeparator > name.lastIndexOf("/")) {
    tag = name.slice(tagSeparator + 1);
    name = name.slice(0, tagSeparator);
    if (!tagPattern.test(tag)) return undefined;
  }
  if (!name || name.length > 255) return undefined;

  const slash = name.indexOf("/");
  const first = slash < 0 ? name : name.slice(0, slash);
  const explicitRegistry = slash >= 0 && (first.includes(".") || first.includes(":") || first.toLowerCase() === "localhost" || first.startsWith("["));
  const authority = explicitRegistry ? parseAuthority(first) : { registry: "docker.io", explicitPort: false };
  if (!authority) return undefined;

  let { registry } = authority;
  let repository = explicitRegistry ? name.slice(slash + 1) : name;
  if (!repository.split("/").every((component) => pathComponent.test(component))) return undefined;

  if (dockerAliases.has(registry)) {
    registry = "docker.io";
    if (!repository.includes("/")) repository = `library/${repository}`;
  }
  if (`${registry}/${repository}`.length > 255) return undefined;

  return { registry, repository, tag, pinnedDigest, explicitPort: authority.explicitPort };
}

function googleProject(repository: string): string {
  const parts = repository.split("/");
  // Legacy domain-scoped projects use DOMAIN/PROJECT in Docker image paths.
  return parts[0].includes(".") && parts.length >= 3 ? `${parts[0]}:${parts[1]}` : parts[0];
}

function privateEcr(registry: string): { account: string; region: string } | undefined {
  const standard = /^(\d{12})\.dkr\.ecr(-fips)?\.([a-z0-9-]+)\.amazonaws\.com$/.exec(registry);
  const dualStack = /^(\d{12})\.dkr-ecr(-fips)?\.([a-z0-9-]+)\.on\.aws$/.exec(registry);
  const match = standard ?? dualStack;
  if (match && (match[2] ? ecrFipsRegions : ecrRegions).has(match[3])) {
    return { account: match[1], region: match[3] };
  }

  const china = /^(\d{12})\.dkr\.ecr\.(cn-(?:north|northwest)-1)\.amazonaws\.com\.cn$/.exec(registry);
  return china ? { account: china[1], region: china[2] } : undefined;
}

type Description = Omit<RegistryDetails, keyof ParsedReference | "tooltip">;

function identify(reference: ParsedReference): Description {
  const unknown: Description = {
    provider: "unknown", providerLabel: "Unknown registry", visibility: "unknown", visibilityReason: unknownVisibility,
  };
  if (reference.explicitPort) return unknown;
  const { registry, repository } = reference;

  const ecr = privateEcr(registry);
  if (ecr) {
    return {
      provider: "aws-ecr", providerLabel: "Amazon ECR", ...ecr, visibility: "private",
      visibilityReason: "The hostname matches a documented Amazon ECR private registry endpoint. Image existence and current pull permissions were not checked.",
    };
  }
  if (registry === "public.ecr.aws") {
    return {
      provider: "aws-ecr-public", providerLabel: "Amazon ECR Public", account: repository.split("/")[0], visibility: "public",
      visibilityReason: "The hostname is the documented Amazon ECR Public endpoint. Image existence and current availability were not checked.",
    };
  }

  const shared = { visibility: "unknown" as const, visibilityReason: unknownVisibility };
  if (registry === "docker.io") {
    return { provider: "docker-hub", providerLabel: "Docker Hub", account: repository.split("/")[0], ...shared };
  }
  if (registry === "ghcr.io") {
    return { provider: "github-container-registry", providerLabel: "GitHub Container Registry", account: repository.split("/")[0], ...shared };
  }
  if (registry === "quay.io") {
    return { provider: "quay", providerLabel: "Quay", account: repository.split("/")[0], ...shared };
  }
  const artifactRegistry = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)-docker\.pkg\.dev$/.exec(registry);
  if (artifactRegistry) {
    return { provider: "google-artifact-registry", providerLabel: "Google Artifact Registry", region: artifactRegistry[1], project: googleProject(repository), ...shared };
  }
  if (/^(?:(?:us|eu|asia)\.)?gcr\.io$/.test(registry)) {
    return { provider: "google-container-registry", providerLabel: "Google Container Registry (gcr.io)", project: googleProject(repository), ...shared };
  }
  if (/^[a-z0-9][a-z0-9-]*\.azurecr\.io$/.test(registry)) {
    return { provider: "azure-container-registry", providerLabel: "Azure Container Registry", ...shared };
  }
  return unknown;
}

/** Describe the reference itself; do not fetch registries, inspect credentials, or infer repository permissions. */
export function describeRegistry(image: string): RegistryDetails {
  const reference = parseReference(image);
  if (!reference) {
    return {
      provider: "unknown", providerLabel: "Unknown registry", registry: "", repository: "", tag: "", pinnedDigest: "",
      visibility: "unknown", visibilityReason: invalidReference,
      tooltip: `Provider: Unknown registry\nVisibility: Unknown\nEvidence: ${invalidReference}`,
    };
  }

  const { explicitPort: _, ...parsed } = reference;
  const description = identify(reference);
  const tooltip = [
    `Provider: ${description.providerLabel}`,
    `Registry: ${parsed.registry}`,
    `Repository: ${parsed.repository}`,
    `Tag: ${parsed.tag}`,
    ...(parsed.pinnedDigest ? [`Pinned digest: ${parsed.pinnedDigest}`] : []),
    ...(description.account ? [`Account / namespace: ${description.account}`] : []),
    ...(description.region ? [`Region / location: ${description.region}`] : []),
    ...(description.project ? [`Project: ${description.project}`] : []),
    `Visibility: ${description.visibility[0].toUpperCase()}${description.visibility.slice(1)}`,
    `Evidence: ${description.visibilityReason}`,
  ].join("\n");
  return { ...parsed, ...description, tooltip };
}
