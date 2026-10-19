import assert from "node:assert/strict";
import { test } from "node:test";
import { computed, type IComputedValue } from "mobx";
import { createContainer, getInjectable2 } from "@k8slens/injectable";
import { askAiFunctionInjectionToken } from "@k8slens/ask-ai-contracts";
import { coreV1, kubeResourcesInjectionToken, podKind, type KubeResources } from "@k8slens/kubernetes-contracts";
import type { Subscribable } from "@k8slens/subscribable";
import {
  createImageSearchQuery,
  imageSearchFunctionInjectableBunch,
  imageSearchFunctionKind,
  type ImageSearchInput,
} from "../src/image-search-query.injectable";
import type { PodLike } from "../src/image-model";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function podSource(value: Promise<IComputedValue<readonly PodLike[]>>) {
  let subscriptions = 0;
  let claims = 0;
  let disposals = 0;
  const source: Subscribable<readonly PodLike[]> = {
    isLive: () => claims > disposals,
    subscribe: () => {
      subscriptions += 1;
      return { value, claim: () => { claims += 1; }, dispose: () => { disposals += 1; }, refresh: () => {} };
    },
  };
  return { source, counts: () => ({ subscriptions, claims, disposals }) };
}

function imagePod(name: string, namespace: string, image: string, imageID: string, running = true): PodLike {
  return {
    metadata: { name, namespace, uid: `${namespace}/${name}` },
    spec: { nodeName: "worker-a", containers: [{ name: "app", image,
      env: [{ name: "SENSITIVE", value: "should-never-be-returned" }] } as { name: string; image: string }] },
    status: { containerStatuses: [{ name: "app", imageID, ready: running,
      state: running ? { running: {} } : { waiting: {} } }] },
  };
}

test("the registered Ask AI search uses the requested Pod scope and releases its snapshot", async () => {
  const pin = `sha256:${"a".repeat(64)}`;
  const image = `example/api:Release-42@${pin}`;
  const fixtures = podSource(Promise.resolve(computed(() => [
    imagePod("api-prod", "production", image, "runtime-image-a"),
    imagePod("api-stage", "staging", image, "runtime-image-b"),
    imagePod("debug", "production", "example/debug:release-42", "runtime-debug"),
  ])));
  const requested: unknown[][] = [];
  const resources = ((...args: unknown[]) => { requested.push(args); return fixtures.source; }) as KubeResources;
  const resourcesStub = getInjectable2({
    id: "test-image-search-resources", injectionToken: kubeResourcesInjectionToken, instantiate: () => () => resources,
  });
  const di = createContainer("image-search-query-test");
  di.register(resourcesStub, imageSearchFunctionInjectableBunch);
  const search = di.inject2(askAiFunctionInjectionToken.for(imageSearchFunctionKind).for([]))();

  const result = await search({ clusterId: "cluster-a", namespace: " production ", query: "API-PROD",
    tagOrPin: " release-42 ", pinning: "pinned", multipleOnly: true });

  assert.deepEqual(requested, [[podKind, coreV1, "cluster-a", "production"]]);
  assert.deepEqual(fixtures.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
  assert.equal(result.totalMatched, 1);
  assert.equal(result.returned, 1);
  assert.equal(result.truncated, false);
  assert.equal(result.namespace, "production");
  assert.deepEqual(result.images[0], {
    requestedImage: image, repository: "example/api", tag: "Release-42", pinnedDigest: pin,
    runtimeImageIDs: ["runtime-image-a", "runtime-image-b"], omittedRuntimeImageIDCount: 0, unreportedContainerCount: 0,
    containerCount: 2, runningCount: 2, namespaces: ["production", "staging"], multipleIDs: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /should-never-be-returned|"env"|"spec"/);
  assert.match(result.evidence, /runtime image IDs/);
});

test("Ask AI search defaults to running usages, retains missing IDs, and bounds groups", async () => {
  const fixtures = podSource(Promise.resolve(computed(() => [
    imagePod("alpha", "production", "example/alpha:stable", "runtime-alpha"),
    imagePod("beta", "staging", "example/beta:stable", ""),
    imagePod("waiting", "staging", "example/waiting:stable", "", false),
  ])));
  const search = createImageSearchQuery(() => fixtures.source);

  const limited = await search({ clusterId: "cluster-a", limit: 1 });
  assert.equal(limited.namespace, null);
  assert.equal(limited.totalMatched, 2);
  assert.equal(limited.returned, 1);
  assert.equal(limited.truncated, true);
  assert.equal(limited.images[0].requestedImage, "example/alpha:stable");

  const all = await search({ clusterId: "cluster-a", runningOnly: false });
  assert.equal(all.totalMatched, 3);
  assert.equal(all.images.find(({ requestedImage }) => requestedImage === "example/beta:stable")?.unreportedContainerCount, 1);
  assert.deepEqual(all.images.find(({ requestedImage }) => requestedImage === "example/beta:stable")?.runtimeImageIDs, []);
  assert.equal(all.images.find(({ requestedImage }) => requestedImage === "example/waiting:stable")?.runningCount, 0);
  assert.deepEqual(fixtures.counts(), { subscriptions: 2, claims: 2, disposals: 2 });
});

test("Ask AI metadata filters do not mistake runtime digests or malformed suffixes for pins", async () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const fixtures = podSource(Promise.resolve(computed(() => [
    imagePod("unpinned", "production", "example/api:stable", digest),
    imagePod("malformed", "production", "example/api@sha256:abcd", "runtime-image"),
    imagePod("pinned", "production", `example/worker@${digest}`, ""),
  ])));
  const search = createImageSearchQuery(() => fixtures.source);

  assert.equal((await search({ clusterId: "cluster-a", query: digest })).totalMatched, 2);
  const pinned = await search({ clusterId: "cluster-a", tagOrPin: digest, pinning: "pinned" });
  assert.deepEqual(pinned.images.map(({ requestedImage }) => requestedImage), [`example/worker@${digest}`]);
  assert.equal((await search({ clusterId: "cluster-a", tagOrPin: "abcd" })).totalMatched, 0);
  assert.equal((await search({ clusterId: "cluster-a", pinning: "unpinned" })).totalMatched, 2);
});

test("Ask AI omits credential-like references and runtime IDs with accurate safety and limit counts", async () => {
  const credential = "example-password";
  const digest = `sha256:${"a".repeat(64)}`;
  const safeRuntimeID = `docker-pullable://registry.example.com/team/api@${digest}`;
  const fixtures = podSource(Promise.resolve(computed(() => [
    imagePod("bad-userinfo", "production", `user:${credential}@registry.example.com/app`, ""),
    imagePod("bad-url", "production", `https://user:${credential}@registry.example.com/app`, ""),
    imagePod("bad-runtime-userinfo", "production", "example/safe:stable", `user:${credential}@registry.example.com/app`),
    imagePod("bad-runtime-url", "production", "example/safe:stable", `https://user:${credential}@registry.example.com/app`),
    imagePod("safe-runtime", "production", "example/safe:stable", safeRuntimeID),
    imagePod("second", "production", "example/second:stable", `containerd://${digest}`),
  ])));
  const search = createImageSearchQuery(() => fixtures.source);
  const limited = await search({ clusterId: "cluster-a", runningOnly: false, limit: 1 });

  assert.equal(limited.totalMatched, 4);
  assert.equal(limited.returned, 1);
  assert.equal(limited.omittedInvalidReferences, 2);
  assert.equal(limited.truncated, true, "one additional valid reference was excluded by the limit");
  assert.deepEqual(limited.images[0].runtimeImageIDs, [safeRuntimeID]);
  assert.equal(limited.images[0].omittedRuntimeImageIDCount, 2);
  assert.equal(limited.images[0].containerCount, 3);
  assert.equal(limited.images[0].unreportedContainerCount, 0, "suppressed IDs are distinct from missing status IDs");
  assert.doesNotMatch(JSON.stringify(limited), new RegExp(credential));

  const all = await search({ clusterId: "cluster-a", runningOnly: false });
  assert.equal(all.totalMatched, 4);
  assert.equal(all.returned, 2);
  assert.equal(all.omittedInvalidReferences, 2);
  assert.equal(all.truncated, false, "safety omissions alone do not mean the limit truncated the result");
  assert.deepEqual(all.images[1].runtimeImageIDs, [`containerd://${digest}`]);
  assert.doesNotMatch(JSON.stringify(all), new RegExp(credential));
});

test("Ask AI search releases failed and timed-out subscriptions without echoing source errors", async () => {
  const failedValue = deferred<IComputedValue<readonly PodLike[]>>();
  const failed = podSource(failedValue.promise);
  const failedSearch = createImageSearchQuery(() => failed.source)({ clusterId: "cluster-a" });
  failedValue.reject(new Error("example-private-error-detail"));
  await assert.rejects(failedSearch, (error: Error) => {
    assert.doesNotMatch(error.message, /example-private-error-detail/);
    assert.match(error.message, /Pod read access/);
    return true;
  });
  assert.deepEqual(failed.counts(), { subscriptions: 1, claims: 1, disposals: 1 });

  const stalled = podSource(new Promise(() => {}));
  await assert.rejects(createImageSearchQuery(() => stalled.source, 5)({ clusterId: "cluster-a" }), /timed out/);
  assert.deepEqual(stalled.counts(), { subscriptions: 1, claims: 1, disposals: 1 });
});

test("invalid Ask AI search inputs fail before any Pod subscription starts", async () => {
  let requests = 0;
  const search = createImageSearchQuery(() => { requests += 1; throw new Error("unexpected request"); });
  for (const input of [
    undefined, null, [], {}, { clusterId: "" }, { clusterId: 123 },
    { clusterId: "cluster-a", namespace: "../invalid" },
    { clusterId: "cluster-a", query: false }, { clusterId: "cluster-a", tagOrPin: 42 },
    { clusterId: "cluster-a", pinning: "yes" }, { clusterId: "cluster-a", runningOnly: "yes" },
    { clusterId: "cluster-a", multipleOnly: "false" }, { clusterId: "cluster-a", limit: 0 },
    { clusterId: "cluster-a", limit: 101 }, { clusterId: "cluster-a", limit: 1.5 },
  ]) await assert.rejects(search(input as ImageSearchInput));
  assert.equal(requests, 0);
});
