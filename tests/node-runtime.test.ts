import assert from "node:assert/strict";
import { test } from "node:test";
import { autorun, computed, observable, runInAction, type IComputedValue } from "mobx";
import { createContainer, getInjectable2 } from "@k8slens/injectable";
import { coreV1, kubeResourcesInjectionToken, nodeKind, type KubeResources } from "@k8slens/kubernetes-contracts";
import type { Subscribable, Subscription } from "@k8slens/subscribable";
import { describeNodeRuntime, parseNodeRuntimeVersion, type RuntimeNodeLike } from "../src/node-runtime";
import {
  createNodeRuntimeState,
  nodeRuntimeDetailsInjectable,
  nodeRuntimeStateInjectable,
} from "../src/node-runtime.injectable";

const node = (name: string, reported?: string): RuntimeNodeLike => ({
  metadata: { name }, status: { nodeInfo: { containerRuntimeVersion: reported } },
});

test("Node runtime parsing preserves reported vendor names, versions and build suffixes", () => {
  for (const [runtime, version] of [
    ["containerd", "1.7.24"], ["cri-o", "1.31.2-1.el9"], ["docker", "27.1.1"],
    ["vendor.runtime", "v2.4.0~build_2+vendor.1"],
  ]) {
    const reported = `${runtime}://${version}`;
    assert.deepEqual(parseNodeRuntimeVersion(reported), { runtime, version, reported });
    const details = describeNodeRuntime("worker-a", [node("worker-a", reported)]);
    assert.equal(details.available, true);
    assert.equal(details.label, `${runtime} ${version}`);
    assert.equal(details.reported, reported);
    assert.match(details.reason, /assigned Node/);
  }
});

test("malformed and credential-like runtime reports are Unavailable without reflecting the report", () => {
  const credential = "example-password";
  for (const reported of [
    "", "containerd", "containerd 1.7.24", "containerd://", "containerd://unknown",
    "containerd://1.7.24\n", "containerd://1.7.24\u0000", "containerd://1.7.24 extra",
    `https://user:${credential}@runtime.example/1.0`, `containerd://1.7.24@${credential}`,
    "containerd://1.7.24?token=example", "containerd://1.7.24/path", `runtime://${"1".repeat(513)}`,
  ]) {
    assert.equal(parseNodeRuntimeVersion(reported), undefined);
    const details = describeNodeRuntime("worker-a", [node("worker-a", reported)]);
    assert.equal(details.available, false);
    assert.equal(details.label, "Unavailable");
    assert.equal(details.runtime, "");
    assert.equal(details.version, "");
    assert.equal(details.reported, "");
    assert.doesNotMatch(JSON.stringify(details), new RegExp(credential));
  }
});

test("runtime lookup matches only the Pod's exact assigned Node and distinguishes unavailable evidence", () => {
  const nodes = [node("worker-a", "containerd://1.7.24"), node("worker-b", "cri-o://1.31.2")];
  assert.equal(describeNodeRuntime("worker-a", nodes).label, "containerd 1.7.24");
  assert.equal(describeNodeRuntime("worker-b", nodes).label, "cri-o 1.31.2");
  for (const name of ["worker", "Worker-a", "missing-worker"]) {
    const missing = describeNodeRuntime(name, nodes);
    assert.equal(missing.available, false);
    assert.equal(missing.label, "Unavailable");
    assert.match(missing.reason, /not present/);
  }
  assert.match(describeNodeRuntime("", nodes).reason, /not been assigned/);
  assert.match(describeNodeRuntime("worker-a", [node("worker-a")]).reason, /not reported/);
  assert.equal(describeNodeRuntime("worker-a", [{ metadata: { name: "worker-a" } }]).available, false);
  const denied = describeNodeRuntime("worker-a", nodes, "example-private-error-detail");
  assert.equal(denied.available, false, "an unavailable source cannot claim a readable Node report");
  assert.equal(denied.label, "Unavailable");
  assert.doesNotMatch(denied.reason, /example-private-error-detail/);
});

interface TestNodeSubscription extends Subscription<readonly RuntimeNodeLike[]> {
  claims: number;
  disposals: number;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

function nodeSource() {
  const values = observable.box<readonly RuntimeNodeLike[]>([], { deep: false });
  const liveValue = computed(() => values.get());
  const subscriptions: TestNodeSubscription[] = [];
  const source: Subscribable<readonly RuntimeNodeLike[]> = {
    isLive: () => subscriptions.some((subscription) => subscription.claims > subscription.disposals),
    subscribe: () => {
      let resolve!: (value: IComputedValue<readonly RuntimeNodeLike[]>) => void;
      let reject!: (reason: unknown) => void;
      const value = new Promise<IComputedValue<readonly RuntimeNodeLike[]>>((accept, decline) => {
        resolve = accept; reject = decline;
      });
      const subscription: TestNodeSubscription = {
        value, claims: 0, disposals: 0,
        claim: () => { subscription.claims += 1; },
        dispose: () => { subscription.disposals += 1; },
        refresh: () => {}, resolve: () => resolve(liveValue), reject,
      };
      subscriptions.push(subscription);
      return subscription;
    },
  };
  return { source, subscriptions, publish: (next: readonly RuntimeNodeLike[]) => runInAction(() => values.set(next)) };
}

test("the runtime snapshot starts one observed Node subscription, follows updates and disposes after the last viewer", async (t) => {
  const source = nodeSource();
  const state = createNodeRuntimeState(() => source.source);
  assert.equal(source.subscriptions.length, 0);
  assert.deepEqual(state.get().nodes, []);
  assert.ok(state.get().reason);
  assert.equal(source.subscriptions.length, 0, "reading an unobserved snapshot must not start a watch");

  let current = state.get();
  const first = autorun(() => { current = state.get(); });
  const second = autorun(() => { state.get(); });
  t.after(first); t.after(second);
  assert.equal(source.subscriptions.length, 1);
  assert.equal(source.subscriptions[0].claims, 1);
  source.publish([node("worker-a", "containerd://1.7.24")]);
  source.subscriptions[0].resolve();
  await Promise.resolve();
  assert.equal(current.reason, "");
  assert.equal(describeNodeRuntime("worker-a", current.nodes).version, "1.7.24");

  source.publish([node("worker-a", "containerd://2.0.1+vendor.2")]);
  assert.equal(describeNodeRuntime("worker-a", current.nodes).version, "2.0.1+vendor.2");
  first();
  assert.equal(source.subscriptions[0].disposals, 0);
  second();
  assert.equal(source.subscriptions[0].disposals, 1);
  assert.equal(source.source.isLive(), false);
});

test("Node access failures stay generic and a later observation can load runtime data", async (t) => {
  const source = nodeSource();
  const state = createNodeRuntimeState(() => source.source);
  let current = state.get();
  const first = autorun(() => { current = state.get(); });
  t.after(first);
  source.subscriptions[0].reject(new Error("example-private-error-detail"));
  await Promise.resolve();
  assert.deepEqual(current.nodes, []);
  assert.match(current.reason, /could not be read/);
  assert.doesNotMatch(current.reason, /example-private-error-detail/);
  assert.equal(describeNodeRuntime("worker-a", current.nodes, current.reason).label, "Unavailable");
  first();

  const second = autorun(() => { current = state.get(); });
  t.after(second);
  assert.equal(source.subscriptions.length, 2);
  source.publish([node("worker-a", "cri-o://1.31.2")]);
  source.subscriptions[1].resolve();
  await Promise.resolve();
  assert.equal(current.reason, "");
  assert.equal(describeNodeRuntime("worker-a", current.nodes).label, "cri-o 1.31.2");
});

test("a live Node computed that later throws becomes Unavailable and can recover without crashing the view", async (t) => {
  const fails = observable.box(false);
  const live = computed<readonly RuntimeNodeLike[]>(() => {
    if (fails.get()) throw new Error("example-private-live-error");
    return [node("worker-a", "containerd://1.7.24")];
  });
  let claims = 0;
  let disposals = 0;
  const source: Subscribable<readonly RuntimeNodeLike[]> = {
    isLive: () => claims > disposals,
    subscribe: () => ({ value: Promise.resolve(live), claim: () => { claims += 1; },
      dispose: () => { disposals += 1; }, refresh: () => {} }),
  };
  const state = createNodeRuntimeState(() => source);
  let current = state.get();
  const dispose = autorun(() => { current = state.get(); });
  t.after(dispose);
  await Promise.resolve();
  assert.equal(describeNodeRuntime("worker-a", current.nodes, current.reason).available, true);

  runInAction(() => fails.set(true));
  assert.deepEqual(current.nodes, []);
  assert.match(current.reason, /could not be read/);
  assert.doesNotMatch(current.reason, /example-private-live-error/);
  assert.equal(describeNodeRuntime("worker-a", current.nodes, current.reason).label, "Unavailable");

  runInAction(() => fails.set(false));
  assert.equal(describeNodeRuntime("worker-a", current.nodes, current.reason).label, "containerd 1.7.24");
  assert.equal(claims, 1, "a transient read failure retains the existing watch");
  dispose();
  assert.equal(disposals, 1);
});

test("the registered runtime details factory shares its cluster snapshot across exact Node names", async (t) => {
  const source = nodeSource();
  const requested: unknown[][] = [];
  const resources = ((...args: unknown[]) => { requested.push(args); return source.source; }) as KubeResources;
  const resourcesStub = getInjectable2({
    id: "test-runtime-resources", injectionToken: kubeResourcesInjectionToken, instantiate: () => () => resources,
  });
  const di = createContainer("node-runtime-details-test");
  di.register(resourcesStub, nodeRuntimeStateInjectable, nodeRuntimeDetailsInjectable);
  const details = di.inject2(nodeRuntimeDetailsInjectable);
  assert.equal(details("cluster-a", "").get().label, "Unavailable");
  assert.deepEqual(requested, [], "an unscheduled Pod does not need a Node watch");

  const workerA = details("cluster-a", "worker-a");
  const workerB = details("cluster-a", "worker-b");
  let currentA = workerA.get();
  let currentB = workerB.get();
  const first = autorun(() => { currentA = workerA.get(); });
  const second = autorun(() => { currentB = workerB.get(); });
  t.after(first); t.after(second);
  assert.deepEqual(requested, [[nodeKind, coreV1, "cluster-a"]]);
  assert.equal(source.subscriptions.length, 1);
  source.publish([node("worker-a", "containerd://1.7.24"), node("worker-b", "cri-o://1.31.2")]);
  source.subscriptions[0].resolve();
  await Promise.resolve();
  assert.equal(currentA.label, "containerd 1.7.24");
  assert.equal(currentB.label, "cri-o 1.31.2");
  first(); second();
  assert.equal(source.subscriptions[0].disposals, 1);
});
