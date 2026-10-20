import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContainerImage } from "../src/image-model.ts";
import { createImageSizeLookup, formatBytes, sizeForContainers, type NodeLike } from "../src/image-sizes.ts";

const digest = `sha256:${"a".repeat(64)}`;
const reference = `example/api@${digest}`;
const mib = 1024 ** 2;

function container(imageID = reference, nodeName = "worker-a"): ContainerImage {
  return {
    id: `${nodeName}:${imageID}`,
    podUID: "pod-a",
    podName: "api-0",
    namespace: "production",
    containerName: "app",
    kind: "container",
    requestedImage: "example/api:stable",
    reportedImage: "example/api:stable",
    imageID,
    nodeName,
    state: "running",
    ready: true,
  };
}

function node(names: readonly string[] = [reference], sizeBytes = 120 * mib, name = "worker-a"): NodeLike {
  return { metadata: { name }, status: { images: [{ names, sizeBytes }] } };
}

test("matches exact immutable aliases and does not sum repeated container uses", () => {
  assert.deepEqual(sizeForContainers([container(), container()], [node()]), {
    label: "120 MiB", minBytes: 120 * mib, maxBytes: 120 * mib,
    matchedContainers: 2, totalContainers: 2,
  });
});

test("normalizes known runtime prefixes and digest hex casing", () => {
  for (const prefix of ["docker-pullable://", "docker://", "containerd://", "cri-o://"]) {
    const result = sizeForContainers([container(`${prefix}${reference}`)], [node()]);
    assert.equal(result.label, "120 MiB", prefix);
  }

  assert.equal(sizeForContainers([container(`example/api@SHA256:${"A".repeat(64)}`)], [node()]).label, "120 MiB");
  assert.equal(sizeForContainers([container(`custom://${reference}`)], [node([`custom://${reference}`])]).label, "Unavailable");
});

test("mutable tags never establish a size match", () => {
  assert.equal(sizeForContainers([container()], [node(["example/api:stable"])]).label, "Unavailable");
  assert.equal(sizeForContainers([container("example/api:stable")], [node(["example/api:stable"])]).label, "Unavailable");
});

test("repository and bare runtime digests are not interchangeable", () => {
  assert.equal(sizeForContainers([container(digest)], [node([reference])]).label, "Unavailable");
  assert.equal(sizeForContainers([container(reference)], [node([digest])]).label, "Unavailable");
  assert.equal(sizeForContainers([container(digest)], [node([digest])]).label, "120 MiB");
  assert.equal(sizeForContainers([container(digest)], [node([reference, digest])]).label, "120 MiB");
  assert.equal(sizeForContainers([container(`other/api@${digest}`)], [node([reference])]).label, "Unavailable");
});

test("a cached alias on another node cannot match the container", () => {
  assert.equal(sizeForContainers([container(reference, "worker-b")], [node()]).label, "Unavailable");
  assert.equal(sizeForContainers([container(reference, "")], [node()]).label, "Unavailable");
});

test("different node-reported sizes form a range and repeated values are deduplicated", () => {
  const result = sizeForContainers(
    [container(), container(reference, "worker-b"), container(reference, "worker-c")],
    [node(), node([reference], 160 * mib, "worker-b"), node([reference], 120 * mib, "worker-c")],
  );

  assert.deepEqual(result, {
    label: "120 MiB–160 MiB", minBytes: 120 * mib, maxBytes: 160 * mib,
    matchedContainers: 3, totalContainers: 3,
  });
});

test("missing node data retains the known range with a partial label and coverage", () => {
  assert.deepEqual(sizeForContainers([container(), container(reference, "missing-node")], [node()]), {
    label: "120 MiB · partial", minBytes: 120 * mib, maxBytes: 120 * mib,
    matchedContainers: 1, totalContainers: 2,
  });
  assert.deepEqual(sizeForContainers([], []), { label: "Unavailable", matchedContainers: 0, totalContainers: 0 });
  assert.equal(sizeForContainers([container()], [{ metadata: { name: "worker-a" } }]).label, "Unavailable");
});

test("zero is a legitimate size while negative and nonfinite sizes are ignored", () => {
  assert.equal(sizeForContainers([container()], [node([reference], 0)]).label, "0 B");

  for (const size of [-1, Infinity, -Infinity, NaN]) {
    assert.equal(sizeForContainers([container()], [node([reference], size)]).label, "Unavailable");
  }

  assert.equal(formatBytes(1536), "1.5 KiB");
  assert.equal(formatBytes(1024 ** 3), "1 GiB");
});

test("only complete SHA-256, SHA-384 and SHA-512 digests qualify", () => {
  for (const [algorithm, length] of [["sha256", 64], ["sha384", 96], ["sha512", 128]] as const) {
    const full = `${algorithm}:${"f".repeat(length)}`;
    assert.equal(sizeForContainers([container(full)], [node([full])]).label, "120 MiB");
  }

  for (const invalid of ["sha256:abcdef", `sha256:${"g".repeat(64)}`, `sha256:${"a".repeat(65)}`, `md5:${"a".repeat(32)}`, ""]) {
    assert.equal(sizeForContainers([container(invalid)], [node([invalid])]).label, "Unavailable", invalid);
  }
});

test("one immutable inventory snapshot serves repeated group and variant size lookups", () => {
  let reads = 0;
  const inventory: NodeLike = {
    metadata: { name: "worker-a" },
    get status() {
      reads += 1;
      return { images: [
        { names: [reference, reference], sizeBytes: 120 * mib },
        { names: [reference], sizeBytes: 160 * mib },
        { names: [reference], sizeBytes: 140 * mib },
      ] };
    },
  };
  const lookup = createImageSizeLookup([inventory]);
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(lookup([container(), container(reference, "missing")]), {
      label: "120 MiB–160 MiB · partial", minBytes: 120 * mib, maxBytes: 160 * mib,
      matchedContainers: 1, totalContainers: 2,
    });
  }
  assert.equal(reads, 1, "queries must not re-read the Node inventory");
  assert.equal(createImageSizeLookup([node([reference], 180 * mib)])([container()]).label, "180 MiB");
  assert.equal(lookup([container()]).label, "120 MiB–160 MiB", "new snapshots cannot mutate existing lookups");
});
