import assert from "node:assert/strict";
import { test } from "node:test";
import { autorun, computed, observable, runInAction, type IComputedValue } from "mobx";
import type { Subscribable, Subscription } from "@k8slens/subscribable";
import type { ChangeEvent, FormEvent } from "react";
import { createImagesState } from "../src/images-state.injectable";
import type { PodLike } from "../src/image-model";
import type { NodeLike } from "../src/image-sizes";
import type { NamespaceLike, OwnerReferenceLike, ReplicaSetLike, WorkloadPodLike, WorkloadResourceLike } from "../src/workload-model";

interface TestSubscription<T> extends Subscription<readonly T[]> {
  claims: number;
  disposals: number;
  refreshes: number;
  disposed: boolean;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** A controllable list/watch source using the public subscribable contract. */
function resourceSource<T>() {
  const values = observable.box<readonly T[]>([], { deep: false });
  const readFailure = observable.box<Error | undefined>(undefined);
  const liveValue = computed(() => {
    const failure = readFailure.get();
    if (failure) throw failure;
    return values.get();
  });
  const subscriptions: TestSubscription<T>[] = [];
  const source: Subscribable<readonly T[]> = {
    isLive: () => subscriptions.some((subscription) => !subscription.disposed),
    subscribe: () => {
      let resolve!: (value: IComputedValue<readonly T[]>) => void;
      let reject!: (error: unknown) => void;
      const value = new Promise<IComputedValue<readonly T[]>>((accept, decline) => {
        resolve = accept;
        reject = decline;
      });
      const subscription: TestSubscription<T> = {
        value,
        claims: 0,
        disposals: 0,
        refreshes: 0,
        disposed: false,
        claim: () => { subscription.claims += 1; },
        dispose: () => {
          subscription.disposals += 1;
          subscription.disposed = true;
        },
        refresh: () => { subscription.refreshes += 1; },
        resolve: () => resolve(liveValue),
        reject,
      };
      subscriptions.push(subscription);
      return subscription;
    },
  };

  return {
    source,
    subscriptions,
    publish: (next: readonly T[]) => runInAction(() => values.set(next)),
    failRead: (error?: Error) => runInAction(() => readFailure.set(error)),
  };
}

function podSource() {
  return resourceSource<PodLike>();
}

function pod(name: string, namespace: string, image: string): PodLike {
  return {
    metadata: { uid: `${namespace}-${name}`, name, namespace },
    spec: { containers: [{ name: "app", image }] },
    status: {
      containerStatuses: [{
        name: "app", imageID: `runtime-ID-for-${image}`, ready: true, state: { running: {} },
      }],
    },
  };
}

function applyNamespace(state: ReturnType<typeof createImagesState>, namespace: string) {
  state.setNamespaceDraft({ currentTarget: { value: namespace } } as ChangeEvent<HTMLInputElement>);
  state.applyNamespace({ preventDefault() {} } as FormEvent);
}

function selectValue(value: string): ChangeEvent<HTMLSelectElement> {
  return { currentTarget: { value } } as ChangeEvent<HTMLSelectElement>;
}

function inputValue(value: string): ChangeEvent<HTMLInputElement> {
  return { currentTarget: { value } } as ChangeEvent<HTMLInputElement>;
}

function controller(kind: string, name: string, uid: string): OwnerReferenceLike {
  return { kind, name, uid, controller: true, apiVersion: "apps/v1" };
}

function controlledPod(name: string, namespace: string, image: string, owner?: OwnerReferenceLike): WorkloadPodLike {
  const resource = pod(name, namespace, image);
  return { ...resource, metadata: { ...resource.metadata, ownerReferences: owner ? [owner] : [] } };
}

test("pod watches belong to observed views and release when the last viewer leaves", async (t) => {
  const source = podSource();
  const requestedNamespaces: Array<string | undefined> = [];
  const state = createImagesState((namespace) => {
    requestedNamespaces.push(namespace);
    return source.source;
  });

  assert.equal(source.subscriptions.length, 0, "constructing a view must not start a watch");
  assert.equal(state.view.get().status, "loading");
  assert.equal(source.subscriptions.length, 0, "an unobserved snapshot must not own a watch");

  let current = state.view.get();
  const firstViewer = autorun(() => { current = state.view.get(); });
  const secondViewer = autorun(() => { state.view.get(); });
  t.after(firstViewer);
  t.after(secondViewer);

  assert.deepEqual(requestedNamespaces, [undefined]);
  assert.equal(source.subscriptions.length, 1);
  assert.equal(source.subscriptions[0].claims, 1);
  assert.equal(current.status, "loading");

  source.publish([pod("api-0", "production", "example/api:v1")]);
  source.subscriptions[0].resolve();
  await Promise.resolve();

  assert.equal(current.status, "ready");
  assert.equal(current.containerCount, 1);
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/api:v1"]);

  source.publish([
    pod("api-0", "production", "example/api:v2"),
    pod("worker-0", "production", "example/worker:v1"),
  ]);

  assert.equal(current.imageCount, 2, "the ready view follows updates from the live computed");
  assert.equal(current.containerCount, 2);
  assert.equal(source.subscriptions.length, 1, "updates reuse the watch");

  firstViewer();
  assert.equal(source.subscriptions[0].disposals, 0, "another viewer still needs the watch");
  secondViewer();
  assert.equal(source.subscriptions[0].disposals, 1);
  assert.equal(source.source.isLive(), false);
});

test("a previous namespace finishing late cannot replace the current namespace", async (t) => {
  const allNamespaces = podSource();
  const staging = podSource();
  const requestedNamespaces: Array<string | undefined> = [];
  const state = createImagesState((namespace) => {
    requestedNamespaces.push(namespace);
    return namespace === "staging" ? staging.source : allNamespaces.source;
  });
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);

  applyNamespace(state, "staging");

  assert.deepEqual(requestedNamespaces, [undefined, "staging"]);
  assert.equal(allNamespaces.subscriptions[0].disposals, 1);
  assert.equal(staging.subscriptions[0].claims, 1);
  assert.equal(current.status, "loading");

  staging.publish([pod("api-stage", "staging", "example/api:staging")]);
  staging.subscriptions[0].resolve();
  await Promise.resolve();

  assert.equal(current.status, "ready");
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/api:staging"]);

  allNamespaces.publish([pod("api-prod", "production", "example/api:production")]);
  allNamespaces.subscriptions[0].resolve();
  await Promise.resolve();

  assert.equal(current.status, "ready");
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/api:staging"]);
  assert.deepEqual(current.groups[0].namespaces, ["staging"]);
  assert.equal(state.namespace.get(), "staging");
});

test("a failed initial load reports its error and retry recovers with a new watch", async (t) => {
  const source = podSource();
  const state = createImagesState(() => source.source);
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);

  source.subscriptions[0].reject(new Error("Pod access denied"));
  await Promise.resolve();

  assert.equal(current.status, "error");
  assert.equal(current.error, "Pod access denied");
  assert.deepEqual(current.groups, []);

  state.refresh();

  assert.equal(source.subscriptions[0].disposals, 1);
  assert.equal(source.subscriptions.length, 2);
  assert.equal(source.subscriptions[1].claims, 1);
  assert.equal(current.status, "loading");
  assert.equal(current.error, "");

  source.publish([pod("api-0", "test", "example/api:fixed")]);
  source.subscriptions[1].resolve();
  await Promise.resolve();

  assert.equal(current.status, "ready");
  assert.equal(current.error, "");
  assert.equal(current.imageCount, 1);
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/api:fixed"]);

  state.refresh();
  assert.equal(source.subscriptions.length, 2, "refreshing a healthy view retains its current subscription");
  assert.equal(source.subscriptions[1].refreshes, 1);

  dispose();
  assert.equal(source.subscriptions[1].disposals, 1);
  assert.equal(source.source.isLive(), false);
});

test("node inventory failures preserve images, retry sizes, and share a watch across namespaces", async (t) => {
  const allPods = podSource();
  const stagingPods = podSource();
  const nodes = resourceSource<NodeLike>();
  const imageID = `example/api@sha256:${"a".repeat(64)}`;
  const requestedImage = "example/api:stable";
  const mib = 1024 ** 2;
  const runningPod = (namespace: string): PodLike => ({
    metadata: { uid: `${namespace}-api`, name: "api-0", namespace },
    spec: { nodeName: "worker-a", containers: [{ name: "app", image: requestedImage }] },
    status: { containerStatuses: [{ name: "app", imageID, ready: true, state: { running: {} } }] },
  });
  const nodeInventory = (sizeBytes: number): NodeLike[] => [{
    metadata: { name: "worker-a" },
    status: { images: [{ names: [imageID], sizeBytes }] },
  }];
  let nodeRequests = 0;
  const state = createImagesState(
    (namespace) => namespace === "staging" ? stagingPods.source : allPods.source,
    () => { nodeRequests += 1; return nodes.source; },
  );

  assert.equal(allPods.subscriptions.length, 0);
  assert.equal(nodes.subscriptions.length, 0, "constructing an image view must not request node inventory");

  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);

  assert.equal(nodes.subscriptions[0].claims, 1);
  allPods.publish([runningPod("production")]);
  allPods.subscriptions[0].resolve();
  nodes.subscriptions[0].reject(new Error("Node inventory access denied"));
  await Promise.resolve();

  assert.equal(current.status, "ready", "optional size data cannot prevent the image view from loading");
  assert.equal(current.error, "");
  assert.equal(current.sizeStatus, "error");
  assert.equal(current.sizeError, "Node inventory access denied");
  assert.equal(current.groups[0].id, requestedImage);
  assert.equal(current.groups[0].variants[0].imageID, imageID);
  assert.equal(current.groups[0].size.maxBytes, undefined);
  assert.equal(current.groups[0].size.label, "Unavailable");

  state.refresh();

  assert.equal(current.status, "ready", "retrying inventory keeps the loaded image data visible");
  assert.equal(current.sizeStatus, "loading");
  assert.equal(current.sizeError, "");
  assert.equal(allPods.subscriptions.length, 1);
  assert.equal(allPods.subscriptions[0].refreshes, 1);
  assert.equal(nodes.subscriptions[0].disposals, 1);
  assert.equal(nodes.subscriptions.length, 2);
  assert.equal(nodes.subscriptions[1].claims, 1);

  nodes.publish(nodeInventory(120 * mib));
  nodes.subscriptions[1].resolve();
  await Promise.resolve();

  assert.equal(current.sizeStatus, "ready");
  assert.equal(current.sizeError, "");
  assert.equal(current.groups[0].size.maxBytes, 120 * mib);
  assert.equal(current.groups[0].size.label, "120 MiB");
  assert.equal(current.groups[0].variants[0].size.maxBytes, 120 * mib);
  assert.equal(current.groups[0].variants[0].imageID, imageID);

  nodes.publish(nodeInventory(160 * mib));

  assert.equal(current.groups[0].size.maxBytes, 160 * mib, "the size follows live inventory updates");
  assert.equal(current.groups[0].variants[0].size.label, "160 MiB");
  assert.equal(nodes.subscriptions.length, 2);

  applyNamespace(state, "staging");

  assert.equal(allPods.subscriptions[0].disposals, 1);
  assert.equal(stagingPods.subscriptions[0].claims, 1);
  assert.equal(nodeRequests, 2, "namespace changes reuse the current cluster-wide inventory watch");
  assert.equal(nodes.subscriptions[1].disposals, 0);
  assert.equal(current.sizeStatus, "ready");

  stagingPods.publish([runningPod("staging")]);
  stagingPods.subscriptions[0].resolve();
  await Promise.resolve();

  assert.equal(current.status, "ready");
  assert.deepEqual(current.groups[0].namespaces, ["staging"]);
  assert.equal(current.groups[0].size.maxBytes, 160 * mib);

  dispose();

  assert.equal(stagingPods.subscriptions[0].disposals, 1);
  assert.equal(nodes.subscriptions[1].disposals, 1);
  assert.equal(stagingPods.source.isLive(), false);
  assert.equal(nodes.source.isLive(), false);
});

test("namespace and workload selections scope rollout images and restart only scoped watches", async (t) => {
  const pods = resourceSource<WorkloadPodLike>();
  const nodes = resourceSource<NodeLike>();
  const namespaces = resourceSource<NamespaceLike>();
  const replicaSets = resourceSource<ReplicaSetLike>();
  const deployments = resourceSource<WorkloadResourceLike>();
  const statefulSets = resourceSource<WorkloadResourceLike>();
  const requested: Record<string, Array<string | undefined>> = { pods: [], replicas: [], deployments: [], statefulSets: [] };
  const state = createImagesState(
    (namespace) => { requested.pods.push(namespace); return pods.source; },
    () => nodes.source,
    {
      namespaces: () => namespaces.source,
      replicaSets: (namespace) => { requested.replicas.push(namespace); return replicaSets.source; },
      deployments: (namespace) => { requested.deployments.push(namespace); return deployments.source; },
      statefulSets: (namespace) => { requested.statefulSets.push(namespace); return statefulSets.source; },
    },
  );
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);

  pods.publish([
    controlledPod("api-old-0", "production", "example/api:v1", controller("ReplicaSet", "api-old", "rs-old")),
    controlledPod("api-new-0", "production", "example/api:v2", controller("ReplicaSet", "api-new", "rs-new")),
    controlledPod("worker-0", "production", "example/worker:v1", controller("ReplicaSet", "worker", "rs-worker")),
    controlledPod("database-0", "production", "example/database:v1", controller("StatefulSet", "database", "db-uid")),
    controlledPod("manual", "production", "example/debug:v1"),
  ]);
  replicaSets.publish([
    { metadata: { name: "api-old", uid: "rs-old", namespace: "production", ownerReferences: [controller("Deployment", "api", "api-uid")] } },
    { metadata: { name: "api-new", uid: "rs-new", namespace: "production", ownerReferences: [controller("Deployment", "api", "api-uid")] } },
    { metadata: { name: "worker", uid: "rs-worker", namespace: "production", ownerReferences: [controller("Deployment", "worker", "worker-uid")] } },
  ]);
  deployments.publish([
    { metadata: { name: "api", uid: "api-uid", namespace: "production" } },
    { metadata: { name: "worker", uid: "worker-uid", namespace: "production" } },
    { metadata: { name: "idle", uid: "idle-uid", namespace: "production" } },
  ]);
  statefulSets.publish([{ metadata: { name: "database", uid: "db-uid", namespace: "production" } }]);
  namespaces.publish([{ metadata: { name: "staging" } }, { metadata: { name: "empty" } }]);
  nodes.publish([]);
  for (const source of [pods, nodes, namespaces, replicaSets, deployments, statefulSets]) {
    source.subscriptions[0].resolve();
  }
  await Promise.resolve();

  assert.equal(current.status, "ready");
  assert.equal(current.workloadStatus, "ready");
  assert.deepEqual(current.namespaces, ["empty", "production", "staging"], "empty namespaces are available alongside Pod-derived names");
  assert.equal(current.imageCount, 5);
  assert.deepEqual(current.workloads.map(({ kind, name }) => `${kind}/${name}`), [
    "Deployment/api", "Deployment/idle", "Deployment/worker", "StatefulSet/database",
  ]);
  assert.equal(current.workloadLabels.get("production-api-old-0"), "Deployment/api");
  assert.equal(current.workloadLabels.get("production-api-new-0"), "Deployment/api");

  state.selectWorkloadType(selectValue("Deployment"));

  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/api:v1", "example/api:v2", "example/worker:v1"]);
  assert.equal(current.workloads.every(({ kind }) => kind === "Deployment"), true);
  const api = current.workloads.find(({ name }) => name === "api")!;
  state.selectWorkload(selectValue(api.id));

  assert.equal(current.containerCount, 2, "the Deployment includes containers from both rollout ReplicaSets");
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/api:v1", "example/api:v2"]);

  state.selectWorkloadType(selectValue("StatefulSet"));

  assert.equal(state.workloadID.get(), "", "changing type clears the previous named workload");
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/database:v1"]);
  assert.deepEqual(current.workloads.map(({ name }) => name), ["database"]);
  state.selectWorkload(selectValue(current.workloads[0].id));
  assert.equal(current.containerCount, 1);

  state.selectWorkloadType(selectValue(""));
  assert.equal(current.imageCount, 5, "clearing the workload filter restores unowned Pods too");
  state.selectWorkload(selectValue(api.id));
  state.selectNamespace(selectValue("staging"));

  assert.equal(state.workloadID.get(), "");
  assert.equal(current.status, "loading");
  for (const values of Object.values(requested)) {
    assert.deepEqual(values, [undefined, "staging"]);
  }
  for (const source of [pods, replicaSets, deployments, statefulSets]) {
    assert.equal(source.subscriptions[0].disposals, 1);
    assert.equal(source.subscriptions[1].claims, 1);
  }
  for (const source of [namespaces, nodes]) {
    assert.equal(source.subscriptions.length, 1, "cluster-wide metadata keeps its existing watch");
    assert.equal(source.subscriptions[0].disposals, 0);
  }

  pods.publish([controlledPod("database-0", "staging", "example/database:stage", controller("StatefulSet", "database", "stage-db"))]);
  replicaSets.publish([]);
  deployments.publish([]);
  statefulSets.publish([{ metadata: { name: "database", namespace: "staging", uid: "stage-db" } }]);
  for (const source of [pods, replicaSets, deployments, statefulSets]) source.subscriptions[1].resolve();
  await Promise.resolve();

  assert.equal(current.status, "ready");
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/database:stage"]);
  assert.deepEqual(current.workloads.map(({ namespace }) => namespace), ["staging"]);

  dispose();
  for (const source of [pods, nodes, namespaces, replicaSets, deployments, statefulSets]) {
    assert.equal(source.source.isLive(), false);
  }
});

test("workload metadata access errors leave unfiltered Pod image data available", async (t) => {
  const pods = resourceSource<WorkloadPodLike>();
  const replicaSets = resourceSource<ReplicaSetLike>();
  const state = createImagesState(() => pods.source, undefined, { replicaSets: () => replicaSets.source });
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);

  pods.publish([
    controlledPod("api-0", "production", "example/api:v1", controller("ReplicaSet", "api", "rs-api")),
    controlledPod("database-0", "production", "example/database:v1", controller("StatefulSet", "database", "db-uid")),
    controlledPod("manual", "test", "example/debug:v1"),
  ]);
  pods.subscriptions[0].resolve();
  replicaSets.subscriptions[0].reject(new Error("ReplicaSet access denied"));
  await Promise.resolve();

  assert.equal(current.status, "ready");
  assert.equal(current.error, "");
  assert.equal(current.workloadStatus, "error");
  assert.equal(current.containerCount, 3);
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), ["example/api:v1", "example/database:v1", "example/debug:v1"]);
  assert.equal(current.groups.every(({ variants }) => Boolean(variants[0].imageID)), true);
  assert.deepEqual(current.namespaces, ["production", "test"], "Pod namespaces remain selectable without namespace inventory");
  assert.deepEqual(current.workloads.map(({ kind, name }) => `${kind}/${name}`), ["StatefulSet/database"]);
  assert.equal(current.workloadLabels.get("production-database-0"), "StatefulSet/database");
});

test("tag and pinning selections combine with search without changing inventory totals or Pod watches", async (t) => {
  const pods = podSource();
  const state = createImagesState(() => pods.source);
  const digestA = `sha256:${"a".repeat(64)}`;
  const digestB = `sha256:${"b".repeat(64)}`;
  const runtimeDigest = `sha256:${"c".repeat(64)}`;
  const taggedPin = `example/api:release-42@${digestA}`;
  const pinnedOnly = `example/worker@${digestB}`;
  const runningImage = (name: string, namespace: string, image: string, imageID: string): PodLike => ({
    ...pod(name, namespace, image),
    status: { containerStatuses: [{ name: "app", imageID, ready: true, state: { running: {} } }] },
  });
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);
  pods.publish([
    runningImage("api-prod", "production", "example/api:stable", runtimeDigest),
    runningImage("api-stage", "staging", "example/api:stable", "runtime-second-build"),
    runningImage("pinned-tag", "production", taggedPin, ""),
    runningImage("pinned-only", "production", pinnedOnly, ""),
    runningImage("implicit", "production", "example/debug", runtimeDigest),
  ]);
  pods.subscriptions[0].resolve();
  await Promise.resolve();

  const totals = () => [current.imageCount, current.containerCount, current.namespaceCount, current.multipleCount];
  assert.deepEqual(totals(), [4, 5, 2, 1]);
  assert.equal(state.tagOrPin.get(), "");
  assert.equal(state.pinning.get(), "all");

  state.selectPinning(selectValue("pinned"));
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), [taggedPin, pinnedOnly]);
  assert.deepEqual(totals(), [4, 5, 2, 1], "display filters retain the scoped inventory totals");

  state.setTagOrPin(inputValue(" RELEASE-42 "));
  assert.deepEqual(current.groups.map(({ requestedImage }) => requestedImage), [taggedPin]);
  state.setSearch(inputValue("pinned-tag"));
  assert.equal(current.groups.length, 1);
  state.setSearch(inputValue("api-prod"));
  assert.equal(current.groups.length, 0, "global and metadata filters must both match the same image group");

  state.clearSearchFilters();
  assert.equal(current.groups.length, 4);
  state.setTagOrPin(inputValue(runtimeDigest));
  assert.equal(current.groups.length, 0, "runtime digests are not configured pins");
  state.setTagOrPin(inputValue("implicit"));
  assert.equal(current.groups.length, 0, "implicit tag labels are not searchable metadata");
  state.setTagOrPin(inputValue(" stable "));
  state.selectPinning(selectValue("unpinned"));
  state.setSearch(inputValue("api-prod"));
  state.setMultipleOnly({ currentTarget: { checked: true } } as ChangeEvent<HTMLInputElement>);

  assert.equal(current.groups.length, 1);
  assert.equal(current.groups[0].containerCount, 2, "a matching usage retains every container in the group");
  assert.equal(current.groups[0].variants.length, 2);
  assert.deepEqual(current.groups[0].namespaces, ["production", "staging"]);
  assert.deepEqual(totals(), [4, 5, 2, 1]);
  assert.equal(pods.subscriptions.length, 1, "local search selections reuse the existing Pod watch");

  state.selectPinning(selectValue("unexpected"));
  assert.equal(state.pinning.get(), "unpinned", "an invalid selection cannot corrupt the pinning mode");
});

test("clearing search filters preserves namespace, workload, display toggles and sorting", () => {
  const pods = podSource();
  const state = createImagesState(() => pods.source);
  state.selectNamespace(selectValue("production"));
  state.selectWorkloadType(selectValue("Deployment"));
  state.selectWorkload(selectValue("production/Deployment/api"));
  state.setRunningOnly({ currentTarget: { checked: false } } as ChangeEvent<HTMLInputElement>);
  state.setMultipleOnly({ currentTarget: { checked: true } } as ChangeEvent<HTMLInputElement>);
  state.setMultipleNamespacesOnly({ currentTarget: { checked: true } } as ChangeEvent<HTMLInputElement>);
  state.sortBy("count");
  state.toggleExpanded("example/api:stable");
  state.setSearch(inputValue("api"));
  state.setTagOrPin(inputValue("stable"));
  state.selectPinning(selectValue("pinned"));

  state.clearSearchFilters();

  assert.equal(state.search.get(), "");
  assert.equal(state.tagOrPin.get(), "");
  assert.equal(state.pinning.get(), "all");
  assert.equal(state.namespace.get(), "production");
  assert.equal(state.namespaceDraft.get(), "production");
  assert.equal(state.workloadType.get(), "Deployment");
  assert.equal(state.workloadID.get(), "production/Deployment/api");
  assert.equal(state.runningOnly.get(), false);
  assert.equal(state.multipleOnly.get(), true);
  assert.equal(state.multipleNamespacesOnly.get(), true);
  assert.equal(state.sort.get(), "count");
  assert.equal(state.descending.get(), true);
  assert.equal(state.expanded.has("example/api:stable"), true);
  assert.equal(pods.subscriptions.length, 0, "resetting display filters does not start an unobserved watch");
});

test("multiple-namespace filtering combines with search and follows namespace and running scopes", async (t) => {
  const allPods = podSource();
  const productionPods = podSource();
  const state = createImagesState((namespace) => namespace === "production" ? productionPods.source : allPods.source);
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);
  const prod = pod("api-prod", "production", "example/api:stable");
  const stage = pod("api-stage", "staging", "example/api:stable");
  const pendingStage: PodLike = { ...stage,
    status: { containerStatuses: [{ name: "app", imageID: "runtime-stage", state: { waiting: {} } }] } };
  allPods.publish([prod, pendingStage, pod("worker", "production", "example/worker:stable")]);
  allPods.subscriptions[0].resolve();
  await Promise.resolve();

  assert.equal(state.multipleNamespacesOnly.get(), false);
  state.setMultipleNamespacesOnly({ currentTarget: { checked: true } } as ChangeEvent<HTMLInputElement>);
  assert.equal(current.groups.length, 0, "a non-running namespace does not satisfy the running-only scope");
  state.setRunningOnly({ currentTarget: { checked: false } } as ChangeEvent<HTMLInputElement>);
  state.setSearch(inputValue("api-prod"));
  state.setTagOrPin(inputValue(" stable "));
  state.selectPinning(selectValue("unpinned"));
  state.setMultipleOnly({ currentTarget: { checked: true } } as ChangeEvent<HTMLInputElement>);
  assert.equal(current.groups.length, 1);
  assert.equal(current.groups[0].containerCount, 2);
  assert.deepEqual(current.groups[0].namespaces, ["production", "staging"]);
  assert.equal(current.imageCount, 2, "display filtering must not change inventory totals");
  assert.equal(allPods.subscriptions.length, 1, "local filtering must not restart the Pod watch");

  state.selectNamespace(selectValue("production"));
  productionPods.publish([prod, pod("worker", "production", "example/worker:stable")]);
  productionPods.subscriptions[0].resolve();
  await Promise.resolve();
  assert.equal(current.groups.length, 0, "a single selected namespace cannot produce a multi-namespace reference");
  assert.equal(current.imageCount, 2);
  state.clearSearchFilters();
  assert.equal(state.multipleNamespacesOnly.get(), true);
  assert.equal(state.namespace.get(), "production");
});

test("live Node and workload metadata read failures preserve Pods and recover through refresh", async (t) => {
  const pods = podSource();
  const nodes = resourceSource<NodeLike>();
  const replicaSets = resourceSource<ReplicaSetLike>();
  const state = createImagesState(() => pods.source, () => nodes.source, { replicaSets: () => replicaSets.source });
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);
  pods.publish([pod("api", "production", "example/api:v1")]);
  nodes.publish([]); replicaSets.publish([]);
  for (const source of [pods, nodes, replicaSets]) source.subscriptions[0].resolve();
  await Promise.resolve();
  assert.equal(current.status, "ready");
  assert.doesNotThrow(() => nodes.failRead(new Error("Live Node read failed")));
  assert.doesNotThrow(() => replicaSets.failRead(new Error("Live ReplicaSet read failed")));
  assert.equal(current.status, "ready");
  assert.equal(current.containerCount, 1);
  assert.equal(current.groups[0].requestedImage, "example/api:v1");
  assert.equal(current.sizeStatus, "error");
  assert.equal(current.workloadStatus, "error");
  assert.equal(nodes.subscriptions[0].disposals, 1);
  assert.equal(replicaSets.subscriptions[0].disposals, 1);
  assert.equal(pods.subscriptions[0].disposals, 0);
  state.refresh();
  nodes.failRead(); replicaSets.failRead();
  nodes.subscriptions[1].resolve(); replicaSets.subscriptions[1].resolve();
  await Promise.resolve();
  assert.equal(current.sizeStatus, "ready");
  assert.equal(current.workloadStatus, "ready");
  assert.equal(pods.subscriptions.length, 1);
  dispose();
  for (const source of [pods, nodes, replicaSets]) assert.equal(source.source.isLive(), false);
});

test("live Pod read errors release the failed watch, report one error transition and retry cleanly", async (t) => {
  const pods = podSource();
  const state = createImagesState(() => pods.source);
  let current = state.view.get();
  const states: string[] = [];
  const dispose = autorun(() => { current = state.view.get(); states.push(current.status); });
  t.after(dispose);
  pods.publish([pod("api", "production", "example/api:v1")]);
  pods.subscriptions[0].resolve();
  await Promise.resolve();
  states.length = 0;
  assert.doesNotThrow(() => pods.failRead(new Error("Live Pod read failed")));
  assert.equal(current.status, "error");
  assert.equal(current.error, "Live Pod read failed");
  assert.deepEqual(current.groups, []);
  assert.equal(pods.subscriptions[0].disposals, 1);
  assert.ok(states.length <= 2, "failure handling must settle without a reaction loop");
  assert.ok(states.every((status) => status === "error"), "failure must not flush an intermediate loading state");
  state.refresh();
  pods.failRead();
  pods.subscriptions[1].resolve();
  await Promise.resolve();
  assert.equal(current.status, "ready");
  assert.equal(current.imageCount, 1);
  assert.equal(pods.subscriptions[1].claims, 1);
  dispose();
  assert.equal(pods.source.isLive(), false);
});

test("refreshing an unobserved view cannot restart failed optional metadata watches", async () => {
  const pods = podSource();
  const namespaces = resourceSource<NamespaceLike>();
  const state = createImagesState(() => pods.source, undefined, { namespaces: () => namespaces.source });
  const dispose = autorun(() => { state.view.get(); });
  pods.publish([pod("api", "production", "example/api:v1")]);
  pods.subscriptions[0].resolve();
  namespaces.subscriptions[0].reject(new Error("Namespace list unavailable"));
  await Promise.resolve();
  assert.equal(namespaces.subscriptions[0].disposals, 1, "a rejected metadata consumer is released immediately");
  dispose();
  state.refresh();
  assert.equal(namespaces.subscriptions.length, 1);
  assert.equal(pods.subscriptions.length, 1);
  assert.equal(namespaces.source.isLive(), false);
  assert.equal(pods.source.isLive(), false);
});

test("size indexing and sized image groups are reused across local filters and Pod-only updates", async (t) => {
  const pods = podSource();
  const nodes = resourceSource<NodeLike>();
  const digest = `sha256:${"a".repeat(64)}`;
  const imagePod = (name: string, image: string): PodLike => ({
    ...pod(name, "production", image), spec: { nodeName: "worker-a", containers: [{ name: "app", image }] },
    status: { containerStatuses: [{ name: "app", imageID: digest, state: { running: {} }, ready: true }] },
  });
  let inventoryReads = 0;
  const node = (sizeBytes: number): NodeLike => ({ metadata: { name: "worker-a" }, status: {
    get images() { inventoryReads += 1; return [{ names: [digest], sizeBytes }]; },
  } });
  const state = createImagesState(() => pods.source, () => nodes.source);
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);
  pods.publish([imagePod("api", "example/api:v1"), imagePod("worker", "example/worker:v1")]);
  nodes.publish([node(1024)]);
  pods.subscriptions[0].resolve(); nodes.subscriptions[0].resolve();
  await Promise.resolve();
  assert.equal(inventoryReads, 1, "all groups and variants share one Node image index");
  const original = current.groups.find((group) => group.requestedImage === "example/api:v1")!;
  state.setSearch({ currentTarget: { value: "api" } } as ChangeEvent<HTMLInputElement>);
  state.setTagOrPin({ currentTarget: { value: "v1" } } as ChangeEvent<HTMLInputElement>);
  state.sortBy("size");
  assert.equal(current.groups[0], original, "display filtering retains the precomputed sized group");
  assert.equal(inventoryReads, 1);
  pods.publish([imagePod("api", "example/api:v1"), imagePod("replica", "example/api:v1")]);
  assert.equal(current.groups[0].containerCount, 2);
  assert.equal(inventoryReads, 1, "Pod changes reuse the current Node image index");
  nodes.publish([node(2048)]);
  assert.equal(current.groups[0].size.label, "2 KiB");
  assert.equal(inventoryReads, 2, "a changed Node snapshot refreshes its image index once");
});

test("namespace and workload options are reused across display filters and follow source changes", async (t) => {
  const pods = podSource();
  const namespaces = resourceSource<NamespaceLike>();
  const deployments = resourceSource<WorkloadResourceLike>();
  const state = createImagesState(() => pods.source, undefined, {
    namespaces: () => namespaces.source, deployments: () => deployments.source,
  });
  let current = state.view.get();
  const dispose = autorun(() => { current = state.view.get(); });
  t.after(dispose);
  pods.publish([pod("api", "production", "example/api:v1")]);
  namespaces.publish([{ metadata: { name: "staging" } }]);
  deployments.publish([{ metadata: { name: "api", namespace: "production" } }]);
  for (const source of [pods, namespaces, deployments]) source.subscriptions[0].resolve();
  await Promise.resolve();
  const initialNamespaces = current.namespaces;
  const initialWorkloads = current.workloads;
  assert.deepEqual(initialNamespaces, ["production", "staging"]);
  assert.equal(initialWorkloads.length, 1);
  state.setSearch(inputValue("api"));
  state.setTagOrPin(inputValue("v1"));
  state.sortBy("count");
  assert.equal(current.namespaces, initialNamespaces);
  assert.equal(current.workloads, initialWorkloads);
  namespaces.publish([{ metadata: { name: "development" } }]);
  assert.deepEqual(current.namespaces, ["development", "production"]);
  deployments.publish([{ metadata: { name: "worker", namespace: "production" } }]);
  assert.equal(current.workloads[0].name, "worker");
  state.selectWorkloadType(selectValue("StatefulSet"));
  assert.deepEqual(current.workloads, []);
});
