# Changelog

What changed in each version of this extension, newest first.

## 0.2.1

- Reuse image-size and workload indexes and existing image groups to reduce repeated work during updates and searches.
- Release failed resource subscriptions promptly and keep resource and cluster-name failures from breaking the explorer.
- Bound cached registry and node-runtime descriptions and reuse runtime reports within Ask AI queries.
- Keep Ask AI query results and safe errors intact when subscription cleanup fails.

## 0.2.0

- Clarify namespace sharing with inline names/counts, expandable usage, and a Multiple namespaces only filter.
- Show shortened configured digest pins instead of generic Digest pinned labels.
- Add the MIT license and public source repository metadata.
- Show node-reported container runtimes and versions in expanded image usage and Pod details, with Unavailable fallback.
- Add an Ask AI query for the node runtimes and versions running each image.

## 0.1.0

- Add a dedicated tag/digest-pin search, pinned/unpinned filtering, match counts, and search reset using Lens-themed search fields.
- Let Ask AI find cluster images by tag or configured digest pin with namespace and pinning filters.
- Wrap full runtime image IDs as selectable text in the Images explorer with a compact copy button beside each value.
- Wrap full runtime image IDs as selectable text in Pod details with a compact copy button beside each value.
- Use compact logos for all registry providers and native Lens styling for Pod image details, wrapped references, runtime IDs, and copy controls.
- Replaced the Amazon ECR text and generic cube with Lens's compact AWS logo, keeping the provider name in accessible labels and tooltips.
- Fixed registry detail cards overlapping the image list; click and keyboard details now expand within their own row and stay hidden until opened.
- Added registry provider icons, public/private/unknown badges, and registry details in the Images view and Pod details.
- Added an Ask AI query to explain an image reference's registry and visibility evidence from any conversation.
- Introduced Lens Image Explorer, available under Workloads → Images.
- Group container images by reference, inspect and copy full runtime IDs, and view their pod usage.
- Show image sizes from node inventories, with ranges and explicit unavailable or partial results.
- Added search, sorting, namespace scope, running-only and multiple-ID filters.
- Added a Container images section to Pod details.
- Keep the Images view usable while the cluster name is loading.
- Added namespace and Deployment/StatefulSet workload dropdowns with controller-aware image filtering.
