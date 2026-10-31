# Image & Logs Explorer

Inspect container images and investigate consolidated pod logs in Lens, with runtime IDs, image sizes, source coverage, search and filtering.

## Features

- A live **Workloads → Images** view grouped by requested image reference.
- Compact registry marks and **Public**, **Private**, or **Unknown** visibility badges, with details about each image reference.
- Short, aligned hashes that expand into full, wrapped, selectable runtime image IDs with a small copy button beside each value.
- Pod, container, namespace, node, and state details for each image ID.
- Node-reported container runtime and version in expanded image usage and Pod details, with **Unavailable** when it cannot be read.
- Image sizes reported by the nodes running those containers.
- Search by image, tag, hash, namespace, pod, container, or node; narrow by tag or configured digest pin and filter pinned versus unpinned references.
- Sort by image, tag, size, or container count.
- Filters for running containers and references with multiple image IDs.
- Namespace, workload type, and workload dropdowns, including Deployments and StatefulSets.
- Visible namespace sharing, expandable namespace names, and a **Multiple namespaces only** filter.
- A **Container images** section in each Pod's details, including init and ephemeral containers.
- Compact registry logos, native Lens detail rows, wrapped image references and selectable runtime IDs, with small copy buttons in Pod details.

## Install

[Open Image & Logs Explorer in Lens](https://app.k8slens.dev/lens-launcher?c=lens%3A%2F%2Fapp%2Fopen%2Fextension%3Fname%3Dlens-image-explorer).

## Usage

Connect a cluster in Lens, expand **Workloads**, and select **Images**. Expand an image row to inspect its full IDs and the containers using each one. Select a pod name to open its details.

Use **Search** for partial image names, tags, hashes, namespaces, Pods, containers, or nodes. Use **Tag / pin** to search only the configured tag or digest pin, for example `v3.5.0` or part of a `sha256:` pin. Searches ignore case and surrounding spaces; both fields apply together. **Pinning** selects all references, **Digest pinned**, or **Not pinned**. A runtime image ID alone does not make the requested reference digest-pinned. **Clear search** resets these search controls while keeping scope and display toggles. Press Escape in Search to clear its text, or `/` while focused elsewhere in the explorer to focus Search.

The compact header summarizes the current scope. Active filters appear beside the result count; use a chip's × button to remove that filter. **Reset all filters** restores the initial running-container view. When no references match, suggested filter removals show how many results they would restore within the data already available.

The view starts with running containers across all namespaces. Open **Scope**, pick a **Namespace**, select **Deployment** or **StatefulSet** under **Workload type**, and optionally choose a specific **Workload**. Image counts, sizes, and pod usage follow those filters. Deployment filtering follows the Pod's ReplicaSet controller, keeping old and new rollout replicas together.

Namespace choices come from the cluster's namespaces and observed Pods. If namespace listing is unavailable, choose **Enter a namespace manually…** in the Namespace menu and select **Apply**. Clear **Running containers** under **Show only** to include waiting, terminated, and unreported container states. Workload dropdowns include workloads with no Pods; selecting one shows an empty image list.

Deployment ownership needs access to ReplicaSets. If some workload resources cannot be read, the view explains the limitation and keeps image browsing available.

**Multiple image IDs** means the same requested image reference has more than one reported ID. Different architectures or runtimes can account for this; inspect the usage before comparing them.

**Namespaces** shows one or two names directly. When an image reference is used in three or more namespaces, select **+N** to list every namespace within the row; select **fewer** to collapse it. Expanded usages show the individual containers in each namespace. **Multiple namespaces** keeps references used in at least two namespaces in the current scope. Namespace, workload, and running-container filters affect these counts; namespaces outside that scope may also use the image. Different tags or digest pins remain separate rows, and configured digest pins are shortened in **Tag / pin**, with the full reference available in the tooltip and expanded image details.

**Reported size** comes from Kubernetes node image inventories, matched to the runtime image ID on the container's node. A range means the nodes report different sizes. A partial result covers only some containers. **Unavailable** means there is no exact match, the node inventory omits the image, or your account cannot read Nodes. Sizes can include shared layers and should not be added up as disk usage.

**Node runtime** shows the runtime and version reported by the node assigned to that Pod, for example `containerd 1.7.24`. Each node keeps its own value, so an image running on different runtime versions shows those differences in its usage rows. **Unavailable** means the Pod is not assigned to a node, the node or its runtime report is missing or unreadable, or Node access is unavailable. Hover over the value for its source or availability explanation. This is the node's latest reported runtime information, rather than a history of the runtime used when a container started; it is read separately from the runtime image ID.

Image tags, requested digest pins, and runtime image IDs are distinct. The explorer preserves the original full ID and shows **Not reported yet** when the runtime has not provided one.

Registry marks identify where the configured image reference points: AWS ECR, Google Artifact Registry or GCR, Docker Hub, GitHub, Azure, or Quay. Other registries use **?**. Provider names remain in tooltips, accessible labels, and expanded details. The marks describe the image registry, independently of where your cluster runs. Hover over visibility badges for the evidence. Expand an image row, then activate its registry badges to show the hostname, repository, tag, digest pin, and identifiable AWS account/region or Google project. Pod details retain the compact provider logos.

**Public** and **Private** are shown for recognized AWS ECR public and private registry endpoints. **Unknown** means repository visibility has not been verified, including Docker Hub, Google, GitHub, Azure, Quay, and custom registries. A provider logo or successful container start does not establish public access. The explorer does not contact registries or read registry credentials to make these classifications.

## Ask AI

From any Ask AI conversation, ask which registry hosts an image reference and whether its visibility is public, private, or unknown. The answer includes the same evidence shown by the badges; it does not check live repository access or identify what a container actually pulled.

You can also ask Ask AI to find images in the conversation's cluster by image name, tag, configured digest pin, or runtime image ID, with optional namespace and pinned/unpinned filters. Results include the configured references, runtime image IDs, and container counts. Searches include running containers and return up to 50 image references by default, with the full match count; ask to include other container states or return more results (up to 100) when needed.

Ask Ask AI which container runtimes and versions run an image in the conversation's cluster. It groups container counts by image and node, supports a namespace or exact image reference, and reports **Unavailable** if Node information cannot be read. It reads a snapshot without changing the explorer's filters.

What changed in each version is in [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE).

## Logs Explorer

Open **Workloads → Logs**, or choose **Logs** beside an image in Image Explorer. Select a namespace, observed Deployment/StatefulSet, or image and click **Load / Refresh**. Filter the loaded entries by text, JSON `field:value`, namespace, pod, container, image, severity, or a timeline bucket. Open an entry for its message, source metadata and nearby loaded lines; click metadata values to filter. Use `/` to focus search and Escape to close details.

The view reads Kubernetes pod-log snapshots using your existing cluster access. It attempts up to 20 containers with three requests at a time, reads at most 400 lines / 128 KB per container, and keeps at most 3,000 entries / 4 MB of message text. Completed containers appear as they finish; the loading counter shows how many selected sources have finished. Stop keeps already received entries. Results render in pages of 100. Source coverage lists access failures and limits; narrow your scope if containers were excluded. Severity is inferred only from a recognized level field or prefix; otherwise it is **Unknown**. Each physical log line remains separate.

**Auto-refresh** loads a new bounded snapshot 10 seconds after the previous load completes. Reads never overlap, including while cancellation settles. Hour/day queries allow up to 60 seconds per container (shorter ranges: 15 seconds). It is off by default and pauses when you inspect, scroll through or page the results. It merges new entries into the retained buffer while preserving your page and selected entry, and may miss lines during bursts; it is not a continuous stream or a historical log archive. Leaving the view releases resources and clears loaded messages. Retrieval ranges are limited by the logs the node still retains.

From any Ask AI conversation, ask it to **search logs already loaded in Logs Explorer**, or **summarize the loaded log source coverage**. These read-only queries do not start collection or change view filters. Search returns at most 50 messages, capped at 2,048 characters each. Coverage returns counts and source failures without message bodies.
