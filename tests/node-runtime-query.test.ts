import assert from "node:assert/strict";
import { test } from "node:test";
import { computed, type IComputedValue } from "mobx";
import { createContainer, getInjectable2 } from "@k8slens/injectable";
import { askAiFunctionInjectionToken } from "@k8slens/ask-ai-contracts";
import { coreV1, kubeResourcesInjectionToken, nodeKind, podKind, type KubeResources } from "@k8slens/kubernetes-contracts";
import type { Subscribable } from "@k8slens/subscribable";
import { createImageRuntimesQuery, imageRuntimesFunctionKind, imageRuntimesQueryBunch,
  type ImageRuntimesInput } from "../src/node-runtime-query.injectable";
import type { PodLike } from "../src/image-model";
import type { RuntimeNodeLike } from "../src/node-runtime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function source<T>(value: Promise<IComputedValue<readonly T[]>>, claimError?: Error, disposeError?: Error) {
  let subscriptions = 0;
  let claims = 0;
  let disposals = 0;
  const subscribable: Subscribable<readonly T[]> = {
    isLive: () => subscriptions > disposals,
    subscribe: () => {
      subscriptions += 1;
      return { value, claim: () => { claims += 1; if (claimError) throw claimError; },
        dispose: () => { disposals += 1; if (disposeError) throw disposeError; }, refresh: () => {} };
    },
  };
  return { source: subscribable, counts: () => ({ subscriptions, claims, disposals }) };
}

function ready<T>(values: readonly T[]) {
  return source(Promise.resolve(computed(() => values)));
}

function pod(name: string, image: string, nodeName = "worker-a", namespace = "production", running = true): PodLike {
  return { metadata: { uid: `${namespace}/${name}`, name, namespace },
    spec: { nodeName, containers: [{ name: "app", image,
      env: [{ name: "PRIVATE_VALUE", value: "example-value-that-must-not-be-returned" }] } as { name: string; image: string }] },
    status: { containerStatuses: [{ name: "app", imageID: "docker-pullable://unrelated-runtime-image-id",
      state: running ? { running: {} } : { waiting: {} }, ready: running }] } };
}

function node(name: string, report?: string): RuntimeNodeLike {
  return { metadata: { name }, status: { nodeInfo: { containerRuntimeVersion: report } } };
}

test("registered runtime query uses scoped Pods and cluster Nodes and joins actual mixed runtimes", async () => {
  const pin = `sha256:${"a".repeat(64)}`;
  const image = `example/api:stable@${pin}`;
  const pods = ready([
    pod("private-pod-one", image), pod("private-pod-two", image),
    pod("private-pod-three", image, "worker-b"), pod("private-pod-four", image, "worker-missing"),
    pod("private-pod-five", image, "worker-a", "staging"),
    pod("private-pod-waiting", image, "worker-a", "production", false),
  ]);
  const nodes = ready([node("worker-a", "containerd://1.7.24"), node("worker-b", "cri-o://1.31.2")]);
  const requested: unknown[][] = [];
  const resources = ((...args: unknown[]) => {
    requested.push(args);
    return args[0] === podKind ? pods.source : nodes.source;
  }) as KubeResources;
  const stub = getInjectable2({ id: "test-runtime-query-resources", injectionToken: kubeResourcesInjectionToken,
    instantiate: () => () => resources });
  const di = createContainer("image-runtime-query-test");
  di.register(stub, imageRuntimesQueryBunch);
  const query = di.inject2(askAiFunctionInjectionToken.for(imageRuntimesFunctionKind).for([]))();
  const result = await query({ clusterId: " cluster-a ", namespace: " production ", imageReference: image });

  assert.deepEqual(requested, [[podKind, coreV1, "cluster-a", "production"], [nodeKind, coreV1, "cluster-a"]]);
  assert.equal(result.namespace, "production");
  assert.equal(result.nodeStatus, "ready");
  assert.equal(result.totalMatched, 1);
  assert.equal(result.images[0].containerCount, 4);
  assert.deepEqual(result.images[0].usages.map(({ nodeName, containerCount, runtime }) =>
    [nodeName, containerCount, runtime.runtime, runtime.version, runtime.available]), [
    ["worker-a", 2, "containerd", "1.7.24", true],
    ["worker-b", 1, "cri-o", "1.31.2", true],
    ["worker-missing", 1, "", "", false],
  ]);
  assert.equal(result.images[0].requestedImage, image, "the configured pin is retained as an image reference, not runtime evidence");
  assert.match(result.evidence, /image-ID prefixes are not used/);
  assert.doesNotMatch(JSON.stringify(result), /private-pod|example-value-that-must-not-be-returned|unrelated-runtime-image-id|"spec"|"env"/);
  assert.deepEqual(pods.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.deepEqual(nodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
});

test("Node RBAC failure is prompt, sanitized, and cannot hide readable Pod images", { timeout: 500 }, async () => {
  const pods = ready([pod("api", "example/api:v1")]);
  const nodeValue = deferred<IComputedValue<readonly RuntimeNodeLike[]>>();
  const nodes = source(nodeValue.promise);
  const pending = createImageRuntimesQuery(() => pods.source, () => nodes.source)({ clusterId: "cluster-a" });
  nodeValue.reject(new Error("example-private-node-error https://private.example.invalid/secret"));
  const result = await pending;
  assert.equal(result.returned, 1);
  assert.equal(result.nodeStatus, "unavailable");
  assert.equal(result.images[0].usages[0].runtime.label, "Unavailable");
  assert.equal(result.images[0].usages[0].runtime.reported, "");
  assert.doesNotMatch(JSON.stringify(result), /example-private-node-error|private\.example/);
  assert.deepEqual(pods.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.deepEqual(nodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
});

test("missing, unscheduled and safely reported custom runtimes retain their distinct evidence", async () => {
  const pods = ready([
    pod("custom", "example/api:v1", "custom-worker"), pod("missing-report", "example/api:v1", "worker-a"),
    pod("unscheduled", "example/api:v1", ""),
  ]);
  const nodes = ready([node("custom-worker", "custom-cri://v2.5.0+vendor.1"), node("worker-a")]);
  const result = await createImageRuntimesQuery(() => pods.source, () => nodes.source)({ clusterId: "cluster-a" });
  const usages = result.images[0].usages;
  assert.equal(usages.find(({ nodeName }) => !nodeName)?.runtime.available, false);
  assert.match(usages.find(({ nodeName }) => !nodeName)!.runtime.reason, /not been assigned/);
  assert.equal(usages.find(({ nodeName }) => nodeName === "worker-a")?.runtime.available, false);
  const custom = usages.find(({ nodeName }) => nodeName === "custom-worker")!.runtime;
  assert.equal(custom.runtime, "custom-cri");
  assert.equal(custom.version, "v2.5.0+vendor.1");
  assert.equal(custom.reported, "custom-cri://v2.5.0+vendor.1");
});

test("Node timeout preserves images and cleans both snapshot consumers", async () => {
  const pods = ready([pod("api", "example/api:v1")]);
  const nodes = source<RuntimeNodeLike>(new Promise(() => {}));
  const result = await createImageRuntimesQuery(() => pods.source, () => nodes.source, 5)({ clusterId: "cluster-a" });
  assert.equal(result.nodeStatus, "unavailable");
  assert.match(result.nodeReason, /timed out/);
  assert.equal(result.images[0].usages[0].runtime.available, false);
  assert.deepEqual(pods.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.deepEqual(nodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
});

test("computed snapshot failures keep optional Nodes distinct from required Pods and release both", async () => {
  const pods = ready([pod("api", "example/api:v1")]);
  const nodes = source(Promise.resolve(computed<readonly RuntimeNodeLike[]>(() => { throw new Error("private Node computed failure"); })));
  const result = await createImageRuntimesQuery(() => pods.source, () => nodes.source)({ clusterId: "cluster-a" });
  assert.equal(result.nodeStatus, "unavailable");
  assert.equal(result.returned, 1);
  assert.doesNotMatch(JSON.stringify(result), /private Node computed/);
  assert.deepEqual(nodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });

  const failedPods = source(Promise.resolve(computed<readonly PodLike[]>(() => { throw new Error("private Pod computed failure"); })));
  const pendingNodes = source<RuntimeNodeLike>(new Promise(() => {}));
  await assert.rejects(createImageRuntimesQuery(() => failedPods.source, () => pendingNodes.source)({ clusterId: "cluster-a" }), (error: Error) => {
    assert.match(error.message, /Pod read access/);
    assert.doesNotMatch(error.message, /private Pod computed/);
    return true;
  });
  assert.deepEqual(failedPods.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.deepEqual(pendingNodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
});

test("Pod failure immediately cancels pending Node reads, sanitizes errors, and handles late rejection", { timeout: 500 }, async () => {
  const podValue = deferred<IComputedValue<readonly PodLike[]>>();
  const nodeValue = deferred<IComputedValue<readonly RuntimeNodeLike[]>>();
  const pods = source(podValue.promise);
  const nodes = source(nodeValue.promise);
  const pending = createImageRuntimesQuery(() => pods.source, () => nodes.source)({ clusterId: "cluster-a" });
  podValue.reject(new Error("example-private-pod-error"));
  await assert.rejects(pending, (error: Error) => {
    assert.match(error.message, /Pod read access/);
    assert.doesNotMatch(error.message, /example-private-pod-error/);
    return true;
  });
  assert.deepEqual(pods.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.deepEqual(nodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  nodeValue.reject(new Error("late-private-node-error"));
  await Promise.resolve();
});

test("Pod timeout and synchronous acquisition errors release any acquired subscriptions", async () => {
  const stalled = source<PodLike>(new Promise(() => {}));
  const nodes = ready([node("worker-a", "containerd://1.7.24")]);
  await assert.rejects(createImageRuntimesQuery(() => stalled.source, () => nodes.source, 5)({ clusterId: "cluster-a" }), /timed out/);
  assert.deepEqual(stalled.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.deepEqual(nodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });

  const pods = ready([pod("api", "example/api:v1")]);
  const failedClaim = source(Promise.resolve(computed(() => [] as readonly RuntimeNodeLike[])), new Error("private claim error"));
  const result = await createImageRuntimesQuery(() => pods.source, () => failedClaim.source)({ clusterId: "cluster-a" });
  assert.equal(result.nodeStatus, "unavailable");
  assert.deepEqual(failedClaim.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  const synchronous = await createImageRuntimesQuery(() => pods.source, () => { throw new Error("private acquisition error"); })({ clusterId: "cluster-a" });
  assert.equal(synchronous.images[0].usages[0].runtime.available, false);
  assert.doesNotMatch(JSON.stringify(synchronous), /private acquisition/);
});

test("exact image filtering, running selection and reference limits preserve accurate totals", async () => {
  const values = Array.from({ length: 101 }, (_, index) => pod(`api-${index}`, `example/api-${String(index).padStart(3, "0")}:v1`));
  values.push(pod("waiting", "example/waiting:v1", "worker-a", "production", false));
  const pods = ready(values);
  const nodes = ready([node("worker-a", "docker://27.5.1")]);
  const query = createImageRuntimesQuery(() => pods.source, () => nodes.source);
  const defaults = await query({ clusterId: "cluster-a" });
  assert.equal(defaults.totalMatched, 101);
  assert.equal(defaults.returned, 50);
  assert.equal(defaults.truncated, true);
  assert.equal(defaults.images[0].requestedImage, "example/api-000:v1");
  const maximum = await query({ clusterId: "cluster-a", limit: 100, runningOnly: false });
  assert.equal(maximum.totalMatched, 102);
  assert.equal(maximum.returned, 100);
  const exact = await query({ clusterId: "cluster-a", imageReference: "example/api-005:v1", limit: 1 });
  assert.equal(exact.totalMatched, 1);
  assert.equal(exact.images[0].requestedImage, "example/api-005:v1");
  assert.equal(exact.truncated, false);
  assert.equal((await query({ clusterId: "cluster-a", imageReference: "example/api:v1" })).returned, 0, "imageReference is exact, not a substring");
});

test("per-image Node groups are bounded without losing total container counts", async () => {
  const values = Array.from({ length: 101 }, (_, index) => pod(`api-${index}`, "example/api:v1", `worker-${String(index).padStart(3, "0")}`));
  const pods = ready(values);
  const nodes = ready(values.map((value) => node(value.spec!.nodeName!, "containerd://1.7.24")));
  const result = await createImageRuntimesQuery(() => pods.source, () => nodes.source)({ clusterId: "cluster-a" });
  assert.equal(result.images[0].containerCount, 101);
  assert.equal(result.images[0].totalNodeUsages, 101);
  assert.equal(result.images[0].usages.length, 100);
  assert.equal(result.images[0].usagesTruncated, true);
});

test("runtime metadata is indexed once and reused across images on the same exact Node", async () => {
  const nodeCount = 200;
  let nameReads = 0;
  let reportReads = 0;
  const workerName = `worker-${nodeCount - 1}`;
  const values: RuntimeNodeLike[] = Array.from({ length: nodeCount }, (_, index) => ({
    metadata: { get name() { nameReads += 1; return `worker-${index}`; } },
    status: { nodeInfo: { get containerRuntimeVersion() { reportReads += 1; return "containerd://1.7.24"; } } },
  }));
  // Duplicate names cannot replace the first exact match, even in a malformed host snapshot.
  values.push(node(workerName, "cri-o://1.31.2"));
  const pods = ready(Array.from({ length: 30 }, (_, index) => pod(`api-${index}`, `example/api-${index}:v1`, workerName)));
  const nodes = ready(values);
  const query = createImageRuntimesQuery(() => pods.source, () => nodes.source);
  const result = await query({ clusterId: "cluster-a" });
  assert.equal(result.returned, 30);
  assert.equal(result.images.every(({ usages }) => usages[0].runtime.label === "containerd 1.7.24"), true);
  assert.ok(nameReads <= nodeCount + 1, `one index plus one exact lookup should read about ${nodeCount} names, saw ${nameReads}`);
  assert.equal(reportReads, 1, "one Node report serves every returned image on that Node");
  nameReads = 0;
  reportReads = 0;
  const absent = await query({ clusterId: "cluster-a", imageReference: "example/not-found:v1" });
  assert.equal(absent.returned, 0);
  assert.equal(nameReads, 0, "empty image results do not require indexing unrelated Nodes");
  assert.equal(reportReads, 0);
});

test("throwing cleanup cannot replace partial results or prevent sibling disposal", async () => {
  const cleanupError = new Error("example-private-cleanup-detail");
  const pods = source(Promise.resolve(computed(() => [pod("api", "example/api:v1")])), undefined, cleanupError);
  const nodes = source<RuntimeNodeLike>(Promise.reject(new Error("example-private-node-detail")), undefined, cleanupError);
  const result = await createImageRuntimesQuery(() => pods.source, () => nodes.source)({ clusterId: "cluster-a" });
  assert.equal(result.returned, 1);
  assert.equal(result.nodeStatus, "unavailable");
  assert.doesNotMatch(JSON.stringify(result), /example-private-/);
  assert.deepEqual(pods.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.deepEqual(nodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });

  const failedPods = source<PodLike>(Promise.resolve(computed(() => { throw new Error("example-private-pod-detail"); })), undefined, cleanupError);
  const stalledNodes = source<RuntimeNodeLike>(new Promise(() => {}), undefined, cleanupError);
  await assert.rejects(createImageRuntimesQuery(() => failedPods.source, () => stalledNodes.source)({ clusterId: "cluster-a" }), (error: Error) => {
    assert.match(error.message, /Pod read access/);
    assert.doesNotMatch(error.message, /example-private-/);
    return true;
  });
  assert.deepEqual(failedPods.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.deepEqual(stalledNodes.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
});

test("unsafe configured references, runtime IDs and Node labels never leak through runtime results", async () => {
  const marker = "example-private-marker";
  const pods = ready([
    pod("unsafe-reference", `https://user:${marker}@registry.example/app`),
    pod("unsafe-node", "example/api:v1", `https://user:${marker}@node.example`),
  ]);
  const nodes = ready([node("worker-a", `runtime://user:${marker}@node.example`)]);
  const result = await createImageRuntimesQuery(() => pods.source, () => nodes.source)({ clusterId: "cluster-a", limit: 1 });
  assert.equal(result.totalMatched, 2);
  assert.equal(result.omittedInvalidReferences, 1);
  assert.equal(result.truncated, false);
  assert.equal(result.images[0].usages[0].nodeName, "");
  assert.equal(result.images[0].usages[0].runtime.available, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(marker));
  assert.doesNotMatch(JSON.stringify(result), /unrelated-runtime-image-id/);
});

test("invalid runtime query inputs fail before either resource subscription starts", async () => {
  let requests = 0;
  const unexpected = () => { requests += 1; throw new Error("unexpected resource request"); };
  const query = createImageRuntimesQuery(unexpected, unexpected);
  for (const input of [undefined, null, [], {}, { clusterId: "" }, { clusterId: 7 }, { clusterId: "cluster-a\n" },
    { clusterId: "cluster-a", namespace: "../invalid" }, { clusterId: "cluster-a", runningOnly: "yes" },
    { clusterId: "cluster-a", imageReference: "" }, { clusterId: "cluster-a", imageReference: 7 },
    { clusterId: "cluster-a", imageReference: "https://user:example-private-marker@registry.example/app" },
    { clusterId: "cluster-a", limit: 0 }, { clusterId: "cluster-a", limit: 101 }, { clusterId: "cluster-a", limit: 1.5 }]) {
    await assert.rejects(query(input as ImageRuntimesInput), (error: Error) => {
      assert.doesNotMatch(error.message, /example-private-marker/); return true;
    });
  }
  assert.equal(requests, 0);
});
