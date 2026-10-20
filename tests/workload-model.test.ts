import assert from "node:assert/strict";
import { test } from "node:test";
import { collectContainerImages, groupImages } from "../src/image-model.ts";
import {
  filterPodsByWorkload,
  createWorkloadResolver,
  listWorkloads,
  resolvePodWorkload,
  type OwnerReferenceLike,
  type ReplicaSetLike,
  type WorkloadPodLike,
} from "../src/workload-model.ts";

function owner(kind: string, name: string, uid: string, controller = true): OwnerReferenceLike {
  return { kind, name, uid, controller, apiVersion: "apps/v1" };
}

function pod(name: string, ref?: OwnerReferenceLike, namespace = "production"): WorkloadPodLike {
  return {
    metadata: { name, uid: `pod-${namespace}-${name}`, namespace, ownerReferences: ref ? [ref] : [] },
    spec: { containers: [{ name: "app", image: "example/api:stable" }] },
    status: { containerStatuses: [{ name: "app", imageID: "sha256:runtime", state: { running: {} } }] },
  };
}

function replicaSet(name: string, uid: string, deployment = "api", namespace = "production"): ReplicaSetLike {
  return {
    metadata: {
      name, uid, namespace,
      ownerReferences: [owner("Deployment", deployment, `${namespace}-${deployment}-uid`)],
    },
  };
}

const oldRS = replicaSet("api-old", "rs-old");
const newRS = replicaSet("api-new", "rs-new");
const oldPod = pod("api-old-a", owner("ReplicaSet", "api-old", "rs-old"));
const newPod = pod("api-new-a", owner("ReplicaSet", "api-new", "rs-new"));

test("a shared workload resolver retains exact namespace, UID, and controller matching", () => {
  const resolve = createWorkloadResolver([oldRS, newRS]);
  for (const candidate of [oldPod, newPod,
    pod("recreated", owner("ReplicaSet", "api-old", "other-uid")),
    pod("wrong-name", owner("ReplicaSet", "other", "rs-old")),
    pod("wrong-namespace", owner("ReplicaSet", "api-old", "rs-old"), "staging"),
    pod("database", owner("StatefulSet", "database", "database-uid")),
  ]) {
    assert.deepEqual(resolve(candidate), resolvePodWorkload(candidate, [oldRS, newRS]));
  }
});

test("old and new rollout ReplicaSets resolve to one Deployment", () => {
  const expected = { id: "production/Deployment/production-api-uid", kind: "Deployment", name: "api", namespace: "production" };
  assert.deepEqual(resolvePodWorkload(oldPod, [oldRS, newRS]), expected);
  assert.deepEqual(resolvePodWorkload(newPod, [oldRS, newRS]), expected);
  assert.deepEqual(listWorkloads([oldPod, newPod], [oldRS, newRS], [], []), [expected]);
});

test("ReplicaSet matching requires owner UID, name, and namespace", () => {
  assert.equal(resolvePodWorkload(oldPod, [replicaSet("api-old", "recreated-rs")]), undefined);
  assert.equal(resolvePodWorkload(oldPod, [replicaSet("api-old", "rs-old", "api", "staging")]), undefined);
  assert.equal(resolvePodWorkload(oldPod, [replicaSet("other-name", "rs-old")]), undefined);
  const withoutUID = pod("api-old-a", { kind: "ReplicaSet", name: "api-old", controller: true });
  assert.equal(resolvePodWorkload(withoutUID, [oldRS]), undefined);
  assert.equal(resolvePodWorkload(oldPod, [{ metadata: { name: "api-old", namespace: "production" } }]), undefined);
});

test("same workload names in different namespaces remain separate options", () => {
  const stagingRS = replicaSet("api-old", "rs-staging", "api", "staging");
  const stagingPod = pod("api-old-a", owner("ReplicaSet", "api-old", "rs-staging"), "staging");
  const options = listWorkloads([oldPod, stagingPod], [oldRS, stagingRS], [], []);
  assert.deepEqual(options.map(({ id }) => id), ["production/Deployment/production-api-uid", "staging/Deployment/staging-api-uid"]);
  assert.deepEqual(filterPodsByWorkload([oldPod, stagingPod], [oldRS, stagingRS], "Deployment", options[0].id), [oldPod]);
});

test("StatefulSets resolve directly from the Pod controller", () => {
  const databasePod = pod("database-0", owner("StatefulSet", "database", "database-uid"));
  assert.deepEqual(resolvePodWorkload(databasePod, []), {
    id: "production/StatefulSet/database-uid", kind: "StatefulSet", name: "database", namespace: "production",
  });
  const refs: WorkloadPodLike = {
    ...databasePod,
    metadata: { ...databasePod.metadata, ownerReferences: [owner("ReplicaSet", "ignored", "ignored", false), owner("StatefulSet", "database", "database-uid")] },
  };
  assert.equal(resolvePodWorkload(refs, [])?.kind, "StatefulSet");
});

test("controller identity is never guessed from Pod name or a noncontroller reference", () => {
  for (const candidate of [
    pod("api-old-looks-owned"),
    pod("api-old-a", owner("ReplicaSet", "api-old", "rs-old", false)),
    pod("api-old-a", { kind: "ReplicaSet", name: "api-old", uid: "rs-old" }),
    pod("api-old-a", owner("Deployment", "api", "production-api-uid")),
    pod("database-0", { ...owner("StatefulSet", "database", "database-uid"), apiVersion: "other.example/v1" }),
    pod("database-0", { ...owner("StatefulSet", "database", "database-uid"), apiVersion: "" }),
  ]) {
    assert.equal(resolvePodWorkload(candidate, [oldRS]), undefined);
  }

  const rsWithoutController: ReplicaSetLike = {
    metadata: { ...oldRS.metadata, ownerReferences: [owner("Deployment", "api", "production-api-uid", false)] },
  };
  assert.equal(resolvePodWorkload(oldPod, [rsWithoutController]), undefined);
});

test("missing workload UIDs use a stable name fallback, while absent metadata is ignored", () => {
  const candidate = pod("database-0", { kind: "StatefulSet", name: "database", controller: true });
  assert.equal(resolvePodWorkload(candidate, [])?.id, "production/StatefulSet/database");
  assert.deepEqual(listWorkloads([{}], [], [{ metadata: { name: "idle", namespace: "test" } }, {}], []), [
    { id: "test/Deployment/idle", kind: "Deployment", name: "idle", namespace: "test" },
  ]);
});

test("resource options include zero-pod workloads and deduplicate resolved owners", () => {
  const workloads = listWorkloads([oldPod, newPod], [oldRS, newRS], [
    { metadata: { name: "api", namespace: "production", uid: "production-api-uid" } },
    { metadata: { name: "idle", namespace: "production", uid: "idle-uid" } },
  ], [{ metadata: { name: "database", namespace: "production", uid: "database-uid" } }]);

  assert.deepEqual(workloads.map(({ name, kind }) => [name, kind]), [
    ["api", "Deployment"], ["idle", "Deployment"], ["database", "StatefulSet"],
  ]);
});

test("workload filtering scopes Pods before image grouping and preserves unowned Pods only when unfiltered", () => {
  const databasePod = pod("database-0", owner("StatefulSet", "database", "database-uid"));
  const unowned = pod("manual");
  const pods = [oldPod, newPod, databasePod, unowned];
  const rs = [oldRS, newRS];
  assert.deepEqual(filterPodsByWorkload(pods, rs, "", ""), pods);
  assert.deepEqual(filterPodsByWorkload(pods, rs, "Deployment", ""), [oldPod, newPod]);
  assert.deepEqual(filterPodsByWorkload(pods, rs, "StatefulSet", ""), [databasePod]);
  assert.deepEqual(filterPodsByWorkload(pods, rs, "", "production/StatefulSet/database-uid"), [databasePod]);
  assert.deepEqual(filterPodsByWorkload(pods, rs, "Deployment", "production/StatefulSet/database-uid"), []);
  const [group] = groupImages(collectContainerImages(filterPodsByWorkload(pods, rs, "Deployment", "")));
  assert.equal(group.containerCount, 2);
  assert.equal(group.variants[0].containers.some(({ podName }) => podName === "database-0" || podName === "manual"), false);
});
