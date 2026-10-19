import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectContainerImages,
  groupImages,
  parseImageReference,
  shortImageID,
  summarizeNamespaceUsage,
  type PodLike,
} from "../src/image-model.ts";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

test("image references keep registry ports, explicit tags and pins separate", () => {
  assert.deepEqual(parseImageReference("registry.example:5000/team/api:release"), {
    repository: "registry.example:5000/team/api",
    tag: "release",
    pinnedDigest: "",
  });
  assert.deepEqual(parseImageReference(`[fd00::1]:5000/team/api:release@sha256:${hashA}`), {
    repository: "[fd00::1]:5000/team/api",
    tag: "release",
    pinnedDigest: `sha256:${hashA}`,
  });
  assert.deepEqual(parseImageReference(`registry.example:5000/team/api@sha256:${hashA}`), {
    repository: "registry.example:5000/team/api",
    tag: "(implicit)",
    pinnedDigest: `sha256:${hashA}`,
  });
  assert.deepEqual(parseImageReference("nginx"), {
    repository: "nginx",
    tag: "(implicit)",
    pinnedDigest: "",
  });
});

test("hash display abbreviates known digests without inventing IDs", () => {
  assert.equal(shortImageID(`docker-pullable://example/api@sha256:${hashA}`), "sha256:aaaaaaaaaaaa…");
  assert.equal(shortImageID(`containerd://sha256:${hashB}`), "sha256:bbbbbbbbbbbb…");
  assert.equal(shortImageID("sha256:123456789abc"), "sha256:123456789abc");
  assert.equal(shortImageID("runtime-specific-opaque-ID"), "runtime-specific-opaque-ID");
  assert.equal(shortImageID(""), "Not reported yet");
});

const mixedPod: PodLike = {
  metadata: { uid: "pod-a", name: "api-0", namespace: "production" },
  spec: {
    nodeName: "arm-node",
    containers: [
      { name: "api", image: "example/api:v1" },
      { name: "metrics", image: "example/metrics:v2" },
      { name: "unstarted", image: "example/future:v1" },
    ],
    initContainers: [
      { name: "migration", image: "example/migrate:v1" },
      { name: "metrics", image: "example/sidecar:v1" },
    ],
    ephemeralContainers: [{ name: "debugger", image: "example/debug:v1" }],
  },
  status: {
    phase: "Running",
    // Deliberately reversed: status entries are associated by name, not position.
    containerStatuses: [
      { name: "metrics", image: "example/metrics:v2", imageID: `sha256:${hashB}`, state: { waiting: {} }, ready: false },
      { name: "api", image: "example/api:resolved", imageID: `sha256:${hashA}`, state: { running: {} }, ready: true },
    ],
    initContainerStatuses: [
      { name: "metrics", imageID: "runtime-sidecar-ID", state: { running: {} }, ready: true },
      { name: "migration", imageID: "runtime-migration-ID", state: { terminated: {} } },
    ],
    ephemeralContainerStatuses: [
      { name: "debugger", imageID: "runtime-debug-ID", state: { running: {} }, ready: false },
    ],
  },
};

test("running containers include live init sidecars and ephemeral containers", () => {
  const running = collectContainerImages([mixedPod]);

  assert.deepEqual(running.map(({ containerName, kind }) => [containerName, kind]), [
    ["api", "container"],
    ["metrics", "init"],
    ["debugger", "ephemeral"],
  ]);
  assert.equal(running[0].imageID, `sha256:${hashA}`);
  assert.equal(running[0].requestedImage, "example/api:v1");
  assert.equal(running[0].reportedImage, "example/api:resolved");
  assert.equal(running[0].ready, true);
  assert.equal(running[1].imageID, "runtime-sidecar-ID");
  assert.equal(new Set(running.map(({ id }) => id)).size, running.length);

  const all = collectContainerImages([mixedPod], false);
  assert.equal(all.length, 6);
  assert.equal(all.find(({ containerName }) => containerName === "unstarted")?.state, "unknown");
  assert.equal(all.find(({ containerName }) => containerName === "migration")?.state, "terminated");
  assert.equal(all.find(({ kind, containerName }) => kind === "container" && containerName === "metrics")?.state, "waiting");
});

test("a Pending pod's running container counts, while missing status remains unknown", () => {
  const pendingPod: PodLike = {
    metadata: { uid: "pending", name: "pending-api", namespace: "test" },
    spec: { containers: [{ name: "app", image: "example/api:v1" }] },
    status: { phase: "Pending", containerStatuses: [{ name: "app", state: { running: {} } }] },
  };
  const unknownPod: PodLike = {
    metadata: { uid: "unknown", name: "new-api", namespace: "test" },
    spec: { containers: [{ name: "app", image: "example/api:v1" }] },
  };

  assert.equal(collectContainerImages([pendingPod, unknownPod]).length, 1);
  const all = collectContainerImages([pendingPod, unknownPod], false);
  assert.deepEqual(all.map(({ state, imageID, ready }) => ({ state, imageID, ready })), [
    { state: "running", imageID: "", ready: false },
    { state: "unknown", imageID: "", ready: false },
  ]);
});

function replica(uid: string, namespace: string, node: string, imageID?: string): PodLike {
  return {
    metadata: { uid, name: `api-${uid}`, namespace },
    spec: { nodeName: node, containers: [{ name: "app", image: "registry:5000/api:stable" }] },
    status: {
      containerStatuses: [{ name: "app", imageID, state: { running: {} }, ready: true }],
    },
  };
}

test("groups expose multiple raw runtime IDs without claiming mismatched digest types", () => {
  const containers = collectContainerImages([
    replica("arm", "production", "arm-node", `sha256:${hashA}`),
    replica("amd", "staging", "amd-node", `sha256:${hashB}`),
    replica("other-runtime", "production", "worker", `docker-pullable://api@sha256:${hashA}`),
    replica("unreported", "staging", "worker"),
  ]);
  const [group] = groupImages(containers);

  assert.equal(group.id, "registry:5000/api:stable");
  assert.equal(group.repository, "registry:5000/api");
  assert.equal(group.tag, "stable");
  assert.equal(group.containerCount, 4);
  assert.equal(group.runningCount, 4);
  assert.deepEqual(group.namespaces, ["production", "staging"]);
  assert.equal(group.multipleIDs, true);
  assert.equal(group.variants.length, 4);
  assert.equal(group.variants.find(({ id }) => id === "")?.shortID, "Not reported yet");
  assert.deepEqual(new Set(group.variants.map(({ id }) => id)), new Set([
    "", `sha256:${hashA}`, `sha256:${hashB}`, `docker-pullable://api@sha256:${hashA}`,
  ]));
});

test("unknown IDs do not create a multiple-ID warning", () => {
  const containers = collectContainerImages([
    replica("known", "production", "worker", `sha256:${hashA}`),
    replica("unknown", "production", "worker"),
    replica("also-unknown", "production", "worker"),
  ]);

  assert.equal(groupImages(containers)[0].multipleIDs, false);
  assert.equal(groupImages(containers)[0].variants.length, 2);
  assert.deepEqual(groupImages(containers, "", true), []);
});

test("search finds usage and retains the complete image group and its ID variants", () => {
  const containers = collectContainerImages([
    replica("arm", "production", "arm-node", `sha256:${hashA}`),
    replica("amd", "staging", "amd-node", `sha256:${hashB}`),
  ]);

  for (const query of ["PRODUCTION", "api-arm", "arm-node", "app", "stable", hashA, "registry:5000"]) {
    const [group] = groupImages(containers, query);
    assert.equal(group.containerCount, 2, query);
    assert.equal(group.variants.length, 2, query);
    assert.deepEqual(group.namespaces, ["production", "staging"], query);
  }

  assert.deepEqual(groupImages(containers, "absent"), []);
  assert.equal(groupImages(containers, " production ", true).length, 1);
});

test("image groups sort lexically and count non-running usage when included", () => {
  const containers = collectContainerImages([mixedPod], false);
  const groups = groupImages(containers);

  assert.deepEqual(groups.map(({ requestedImage }) => requestedImage), [
    "example/api:v1", "example/debug:v1", "example/future:v1", "example/metrics:v2", "example/migrate:v1", "example/sidecar:v1",
  ]);
  assert.equal(groups.find(({ requestedImage }) => requestedImage === "example/metrics:v2")?.runningCount, 0);
  assert.equal(groups.find(({ requestedImage }) => requestedImage === "example/future:v1")?.containerCount, 1);
  assert.deepEqual(groupImages([]), []);
});

function referencePod(uid: string, image: string, imageID: string): PodLike {
  return {
    metadata: { uid, name: uid, namespace: "production" },
    spec: { containers: [{ name: "app", image }] },
    status: { containerStatuses: [{ name: "app", imageID, state: { running: {} } }] },
  };
}

test("tag or pin search matches configured metadata without matching implicit tags or runtime hashes", () => {
  const tagged = "example/api:Release-42";
  const taggedPin = `example/api:release-42@sha256:${hashA}`;
  const pinOnly = `example/api@sha256:${hashB}`;
  const containers = collectContainerImages([
    referencePod("implicit", "example/api", `sha256:${hashA}`),
    referencePod("tagged", tagged, `sha256:${hashB}`),
    referencePod("tagged-pin", taggedPin, "runtime-other"),
    referencePod("pin-only", pinOnly, ""),
    referencePod("latest", "example/api:latest", "runtime-latest"),
  ]);
  const matching = (tagOrPin: string) => groupImages(containers, "", false, { tagOrPin }).map(({ requestedImage }) => requestedImage);

  assert.deepEqual(matching(" RELease-42 "), [tagged, taggedPin]);
  assert.deepEqual(matching(hashA.toUpperCase()), [taggedPin]);
  assert.deepEqual(matching(hashB), [pinOnly]);
  assert.deepEqual(matching("sha256"), [taggedPin, pinOnly]);
  assert.deepEqual(matching("latest"), ["example/api:latest"], "an implicit tag must not be assumed to be latest");
  assert.deepEqual(matching("implicit"), [], "the display placeholder is not a configured tag");
  assert.deepEqual(matching("api"), [], "repository names do not match the dedicated metadata query");
  assert.equal(matching("  ").length, 5);
});

test("pinning filters use configured digests even before a runtime image ID exists", () => {
  const taggedPin = `example/api:release@sha256:${hashA}`;
  const pinOnly = `example/api@sha256:${hashB}`;
  const containers = collectContainerImages([
    referencePod("tagged", "example/api:release", `sha256:${hashA}`),
    referencePod("implicit", "example/api", `sha256:${hashB}`),
    referencePod("tagged-pin", taggedPin, ""),
    referencePod("pin-only", pinOnly, ""),
  ]);

  assert.deepEqual(groupImages(containers, "", false, { pinning: "pinned" }).map(({ requestedImage }) => requestedImage), [taggedPin, pinOnly]);
  assert.deepEqual(groupImages(containers, "", false, { pinning: "unpinned" }).map(({ requestedImage }) => requestedImage), ["example/api", "example/api:release"]);
  assert.deepEqual(groupImages(containers, "", false, { tagOrPin: "release", pinning: "pinned" }).map(({ requestedImage }) => requestedImage), [taggedPin]);
  assert.equal(groupImages(containers, "", false, { pinning: "all" }).length, 4);
});

test("malformed digest suffixes remain searchable references without being treated as pins", () => {
  const malformed = ["example/api:release@not-a-digest", "example/api@sha256:abcd", `example/api@sha256:${"a".repeat(63)}`];
  const valid = `example/api@sha256:${hashA}`;
  const containers = collectContainerImages([
    ...malformed.map((image, index) => referencePod(`malformed-${index}`, image, "runtime-id")),
    referencePod("valid", valid, "runtime-id"),
  ]);

  for (const image of malformed) assert.equal(parseImageReference(image).pinnedDigest, "", image);
  assert.deepEqual(groupImages(containers, "", false, { pinning: "pinned" }).map(({ requestedImage }) => requestedImage), [valid]);
  assert.equal(groupImages(containers, "", false, { pinning: "unpinned" }).length, 3);
  assert.deepEqual(groupImages(containers, "", false, { tagOrPin: "not-a-digest" }), []);
  assert.deepEqual(groupImages(containers, "", false, { tagOrPin: "abcd" }), []);
  assert.equal(groupImages(containers, "not-a-digest")[0].requestedImage, malformed[0]);
});

test("metadata, global search and multiple-ID filters combine while retaining complete group usage", () => {
  const containers = collectContainerImages([
    replica("arm", "production", "arm-node", `sha256:${hashA}`),
    replica("amd", "staging", "amd-node", `sha256:${hashB}`),
    referencePod("worker", "example/worker:release", "runtime-worker"),
  ]);
  const [group] = groupImages(containers, " STAGING ", true, { tagOrPin: " STABLE ", pinning: "unpinned" });

  assert.equal(group.containerCount, 2);
  assert.equal(group.variants.length, 2);
  assert.deepEqual(group.namespaces, ["production", "staging"]);
  assert.deepEqual(groupImages(containers, "staging", true, { tagOrPin: "release" }), []);
  assert.deepEqual(groupImages(containers, "staging", true, { tagOrPin: "stable", pinning: "pinned" }), []);
  assert.deepEqual(groupImages(containers, "worker", false, { tagOrPin: "stable" }), []);
});

test("multiple-namespace filtering keeps exact references and full usages independently of runtime-ID count", () => {
  const sameRuntime = `sha256:${hashA}`;
  const containers = collectContainerImages([
    replica("prod-a", "production", "worker-a", sameRuntime),
    replica("prod-b", "production", "worker-b", sameRuntime),
    replica("stage", "staging", "worker-c", sameRuntime),
    referencePod("other-tag", "registry:5000/api:new", "runtime-new"),
  ]);
  const [group] = groupImages(containers, "prod-a", false, {
    tagOrPin: "stable", pinning: "unpinned", multipleNamespacesOnly: true,
  });

  assert.equal(group.requestedImage, "registry:5000/api:stable");
  assert.equal(group.containerCount, 3, "a matching usage must retain the reference's entire scoped group");
  assert.equal(group.variants.length, 1, "multiple namespaces do not require multiple runtime IDs");
  assert.deepEqual(group.namespaces, ["production", "staging"]);
  assert.deepEqual(group.namespaceUsages, [
    { namespace: "production", containerCount: 2 }, { namespace: "staging", containerCount: 1 },
  ]);
  assert.deepEqual(summarizeNamespaceUsage(group.variants.flatMap((variant) => variant.containers)), group.namespaceUsages);
  assert.deepEqual(groupImages(containers, "", true, { multipleNamespacesOnly: true }), []);
  assert.deepEqual(groupImages(containers, "", false, { tagOrPin: "new", multipleNamespacesOnly: true }), []);
  assert.deepEqual(groupImages(containers.filter((container) => container.namespace === "production"), "", false,
    { multipleNamespacesOnly: true }), [], "the filter counts namespaces only within the provided scope");
  assert.deepEqual(summarizeNamespaceUsage([]), []);
});
