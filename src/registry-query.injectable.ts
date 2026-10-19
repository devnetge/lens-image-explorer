import { getAskAiFunctionInjectableBunch, getAskAiFunctionKind } from "@k8slens/ask-ai-contracts";
import { describeRegistry, type RegistryDetails } from "./registry-model";

interface RegistryImageDetailsInput {
  imageReference: string;
}

export const registryImageDetailsFunctionKind = getAskAiFunctionKind<
  RegistryImageDetailsInput,
  RegistryDetails
>()("describe-image-registry");

export const registryImageDetailsFunctionInjectableBunch = getAskAiFunctionInjectableBunch({
  kind: registryImageDetailsFunctionKind,
  offeredIn: "every-conversation",
  description:
    "Describes the registry provider and visibility evidence for one configured container image reference " +
    "using the Image Explorer extension. Use it to explain a provider icon or public/private/Unknown badge. " +
    "It classifies the reference locally: only recognized AWS ECR public and private registry hostnames " +
    "establish visibility; all other repositories have Unknown visibility. It makes no registry request, " +
    "does not read credentials, and does not scan an image or establish trust, availability, or the digest " +
    "actually pulled by a container.",
  inputDescription:
    "`imageReference` (string): the configured container image reference, such as nginx:1.27, " +
    "public.ecr.aws/example/app:latest, or a registry/repository@sha256:digest reference. " +
    "Supply the reference without a URL scheme, credentials, or whitespace; no Lens cluster id is needed.",
  outputDescription:
    "`provider` (string): the recognized registry provider code. `providerLabel` (string): its display name. " +
    "`registry` (string): the registry hostname, including a port when specified, or empty for invalid input. " +
    "`repository` (string): the repository path, including Docker Hub's inferred library namespace where applicable, " +
    "or empty for invalid input. `tag` (string): the explicitly configured tag, '(implicit)' when unspecified, " +
    "or empty for invalid input. `pinnedDigest` (string): the digest configured in the reference, empty when " +
    "unspecified or invalid, never a claim about the digest actually pulled. " +
    "`visibility` (string, public/private/unknown): public or private for a recognized ECR endpoint, unknown otherwise; " +
    "repository existence and pull permissions are never checked. `visibilityReason` (string): the evidence or uncertainty. " +
    "`account` (optional string): an AWS account id, repository owner/namespace, or ECR Public alias parsed from " +
    "the reference. `region` (optional string): an AWS region or Google Artifact Registry location parsed from " +
    "the hostname. `project` (optional string): a Google project parsed from " +
    "the repository path. `tooltip` (string): the same explanatory text used in Image Explorer. " +
    "Optional fields are omitted when absent. No registry access check or image scan is performed.",
  invoke: {
    instantiate: () => () => async (input) => {
      const reference = input?.imageReference;

      if (typeof reference !== "string" || !reference || reference.length > 4096 ||
        /\s|:\/\//.test(reference) ||
        (reference.includes("@") && !/^[^@]+@[A-Za-z][A-Za-z0-9_+.-]*:[A-Fa-f0-9]+$/.test(reference))) {
        throw new Error("Provide a container image reference without a URL scheme, credentials, or whitespace.");
      }

      return describeRegistry(reference);
    },
  },
});
