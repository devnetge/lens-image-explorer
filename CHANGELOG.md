# Changelog

What changed in each version of this extension, newest first.

## 0.4.2

- Show completed-source logs during collection, display container progress and retain received logs when stopping.
- Use the current development compiler for reproducible Lens tooling checks.

## 0.4.1

- Align Lens dependencies with the host and add type, compatibility and prepublication checks.

- Restore the original lens-image-explorer package identity while retaining Image & Logs Explorer branding and all log features.

- Allow up to 60 seconds per source for hour/day log reads and keep refreshes serialized through cancellation.

- Merge refreshed logs without resetting the reading position or replacing unchanged rows; retain logs from temporarily failed sources within memory limits.

## 0.4.0

- Use the updated Image & Logs Explorer artwork as the extension banner.

- Brand the extension as Image & Logs Explorer with a new cube-and-log icon and informative banner.

- Highlight log loading with green primary buttons and a larger initial load action.

- Add Workloads → Logs with image/workload scope, search, facets, loaded-log timeline, source coverage and entry details.
- Bound collection concurrency, source count, line/byte limits, retained log memory and rendered rows; cancel requests when scope or view changes.
- Offer explicit snapshot auto-refresh with pause-on-inspect and two read-only Ask AI queries for loaded logs and source coverage.
- Use bounded snapshots rather than streaming; collection gaps and partial history are shown explicitly.

## 0.3.0

- Match the approved Image Explorer design with a compact header, search toolbar, collapsible Scope panel, and dense image table.
- Show removable filter chips, a full reset, scoped keyboard search controls, and useful empty-state filter suggestions.
- Restyle expanded image usages while preserving wrapped runtime IDs, copying, Pod navigation, runtime versions, and visibility evidence.
- Add loading skeletons and keep wide tables scrollable within smaller Lens panes.

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
