import assert from "node:assert/strict";
import { test } from "node:test";
import { createContainer, getInjectable2 } from "@k8slens/injectable";
import { kubeResourcesInjectionToken, type KubeResources } from "@k8slens/kubernetes-contracts";
import { autorun, computed, observable, runInAction } from "mobx";
import { registryDetailsInjectable } from "../src/registry-details.injectable";
import { nodeRuntimeDetailsInjectable, nodeRuntimeStateInjectable } from "../src/node-runtime.injectable";
import type { RuntimeNodeLike } from "../src/node-runtime";

test("registry descriptions evict historical references while existing descriptions remain usable", () => {
  const di = createContainer("registry-cache-test");
  di.register(registryDetailsInjectable);
  const describe = di.inject2(registryDetailsInjectable);
  const first = describe("example/api:v1");
  assert.equal(describe("example/api:v1"), first);
  for (let i = 0; i < 1024; i += 1) describe(`example/api:build-${i}`);
  const recreated = describe("example/api:v1");
  assert.notEqual(recreated, first);
  assert.deepEqual(recreated, first);
  assert.equal(describe("example/api:v1"), recreated);
});

test("runtime detail eviction preserves active views and their shared cluster subscription", async (t) => {
  const nodes = observable.box<readonly RuntimeNodeLike[]>([], { deep: false });
  const live = computed(() => nodes.get());
  let claims = 0;
  let disposals = 0;
  const resources = (() => ({
    isLive: () => claims > disposals,
    subscribe: () => ({ value: Promise.resolve(live), claim: () => { claims += 1; },
      dispose: () => { disposals += 1; }, refresh: () => {} }),
  })) as KubeResources;
  const stub = getInjectable2({ id: "cache-test-resources", injectionToken: kubeResourcesInjectionToken,
    instantiate: () => () => resources });
  const di = createContainer("runtime-cache-test");
  di.register(stub, nodeRuntimeStateInjectable, nodeRuntimeDetailsInjectable);
  const state = di.inject2(nodeRuntimeStateInjectable);
  const details = di.inject2(nodeRuntimeDetailsInjectable);
  const cluster = state("cluster-a");
  const first = details("cluster-a", "worker-a");
  let label = "";
  const stopFirst = autorun(() => { label = first.get().label; });
  t.after(stopFirst);
  await Promise.resolve();
  for (let i = 0; i < 1024; i += 1) details("cluster-a", `historical-worker-${i}`);
  const recreated = details("cluster-a", "worker-a");
  assert.notEqual(recreated, first);
  assert.equal(state("cluster-a"), cluster);
  const stopSecond = autorun(() => recreated.get());
  t.after(stopSecond);
  assert.equal(claims, 1);
  runInAction(() => nodes.set([{ metadata: { name: "worker-a" },
    status: { nodeInfo: { containerRuntimeVersion: "containerd://1.7.24" } } }]));
  assert.equal(label, "containerd 1.7.24");
  assert.equal(recreated.get().label, label);
  stopFirst();
  assert.equal(disposals, 0);
  stopSecond();
  assert.equal(disposals, 1);
});
