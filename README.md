# Lens Image Explorer

Inspect the container images running in your Kubernetes clusters, with readable hashes, full runtime image IDs, and image sizes in Lens.

## Features

- A live **Workloads → Images** view grouped by requested image reference.
- Registry provider icons and **Public**, **Private**, or **Unknown** visibility badges, with details about each image reference.
- Short, aligned hashes that expand into full, wrapped, selectable runtime image IDs with a small copy button beside each value.
- Pod, container, namespace, node, and state details for each image ID.
- Node-reported container runtime and version in expanded image usage and Pod details, with **Unavailable** when it cannot be read.
- Image sizes reported by the nodes running those containers.
- Search by image, tag, hash, namespace, pod, container, or node; narrow by tag or configured digest pin and filter pinned versus unpinned references.
- Sort by image, tag, size, or container count.
- Filters for running containers and references with multiple image IDs.
- Namespace, workload type, and workload dropdowns, including Deployments and StatefulSets.
- Visible namespace sharing, expandable per-namespace container counts, and a **Multiple namespaces only** filter.
- A **Container images** section in each Pod's details, including init and ephemeral containers.
- Compact registry logos, native Lens detail rows, wrapped image references and selectable runtime IDs, with small copy buttons in Pod details.

## Install

[Open Lens Image Explorer in Lens](https://app.k8slens.dev/lens-launcher?c=lens%3A%2F%2Fapp%2Fopen%2Fextension%3Fname%3Dlens-image-explorer).

## Usage

Connect a cluster in Lens, expand **Workloads**, and select **Images**. Expand an image row to inspect its full IDs and the containers using each one. Select a pod name to open its details.

Use **Search all fields** for partial image names, tags, hashes, namespaces, Pods, containers, or nodes. Use **Tag / pin** to search only the configured tag or digest pin, for example `v3.5.0` or part of a `sha256:` pin. Searches ignore case and surrounding spaces; both fields apply together. **Pinning** selects all references, **Digest pinned**, or **Not pinned**. A runtime image ID alone does not make the requested reference digest-pinned. **Clear search** resets these search controls while keeping namespace and workload selections. The result count shows how many image references match.

The view starts with running containers across all namespaces. Pick a **Namespace**, select **Deployments** or **StatefulSets** under **Workload type**, and optionally choose a specific **Workload**. Image counts, sizes, and pod usage follow those filters. Deployment filtering follows the Pod's ReplicaSet controller, keeping old and new rollout replicas together.

Namespace choices come from the cluster's namespaces and observed Pods. If namespace listing is unavailable, use **Enter a namespace manually** and select **Apply**. Clear **Running containers only** to include waiting, terminated, and unreported container states. Workload dropdowns include workloads with no Pods; selecting one shows an empty image list.

Deployment ownership needs access to ReplicaSets. If some workload resources cannot be read, the view explains the limitation and keeps image browsing available.

**Multiple image IDs** means the same requested image reference has more than one reported ID. Different architectures or runtimes can account for this; inspect the usage before comparing them.

**Namespaces** shows one or two names directly. When an image reference is used in three or more namespaces, activate the namespace-count disclosure to list every namespace and its container count within the row. **Multiple namespaces only** keeps references used in at least two namespaces in the current scope. Namespace, workload, and running-container filters affect these counts; namespaces outside that scope may also use the image. Different tags or digest pins remain separate rows, and configured digest pins are shortened in **Tag / pin**, with the full reference available in the tooltip and expanded image details.

**Reported size** comes from Kubernetes node image inventories, matched to the runtime image ID on the container's node. A range means the nodes report different sizes. A partial result covers only some containers. **Unavailable** means there is no exact match, the node inventory omits the image, or your account cannot read Nodes. Sizes can include shared layers and should not be added up as disk usage.

**Node runtime** shows the runtime and version reported by the node assigned to that Pod, for example `containerd 1.7.24`. Each node keeps its own value, so an image running on different runtime versions shows those differences in its usage rows. **Unavailable** means the Pod is not assigned to a node, the node or its runtime report is missing or unreadable, or Node access is unavailable. Hover over the value for its source or availability explanation. This is the node's latest reported runtime information, rather than a history of the runtime used when a container started; it is read separately from the runtime image ID.

Image tags, requested digest pins, and runtime image IDs are distinct. The explorer preserves the original full ID and shows **Not reported yet** when the runtime has not provided one.

Registry logos identify where the configured image reference points: AWS ECR, Google Artifact Registry or GCR, Docker Hub, GitHub, Azure, or Quay. Other registries use a neutral registry icon. Provider names remain in tooltips, accessible labels, and expanded details. The logos describe the image registry, independently of where your cluster runs. Hover over the badges for a tooltip, or click them (or focus them and press Enter or Space) to expand the same details within the row. Activate the badges again to collapse them. Registry details include the hostname, repository, tag, digest pin, and identifiable AWS account/region or Google project.

**Public** and **Private** are shown for recognized AWS ECR public and private registry endpoints. **Unknown** means repository visibility has not been verified, including Docker Hub, Google, GitHub, Azure, Quay, and custom registries. A provider logo or successful container start does not establish public access. The explorer does not contact registries or read registry credentials to make these classifications.

## Ask AI

From any Ask AI conversation, ask which registry hosts an image reference and whether its visibility is public, private, or unknown. The answer includes the same evidence shown by the badges; it does not check live repository access or identify what a container actually pulled.

You can also ask Ask AI to find images in the conversation's cluster by image name, tag, configured digest pin, or runtime image ID, with optional namespace and pinned/unpinned filters. Results include the configured references, runtime image IDs, and container counts. Searches include running containers and return up to 50 image references by default, with the full match count; ask to include other container states or return more results (up to 100) when needed.

Ask Ask AI which container runtimes and versions run an image in the conversation's cluster. It groups container counts by image and node, supports a namespace or exact image reference, and reports **Unavailable** if Node information cannot be read. It reads a snapshot without changing the explorer's filters.

What changed in each version is in [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE).
