import assert from "node:assert/strict";
import { test } from "node:test";
import { computed, observable, runInAction, type IComputedValue } from "mobx";
import type { Subscribable } from "@k8slens/subscribable";
import { createResourceState } from "../src/resource-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function source(value: Promise<IComputedValue<readonly string[]>>, failures: { claim?: boolean; refresh?: boolean; dispose?: boolean } = {}) {
  const counts = { claims: 0, refreshes: 0, disposals: 0 };
  const resource: Subscribable<readonly string[]> = {
    isLive: () => counts.claims > counts.disposals,
    subscribe: () => ({ value, claim: () => { counts.claims += 1; if (failures.claim) throw new Error("Claim failed"); },
      refresh: () => { counts.refreshes += 1; if (failures.refresh) throw new Error("Refresh failed"); },
      dispose: () => { counts.disposals += 1; if (failures.dispose) throw new Error("Dispose failed"); } }),
  };
  return { resource, counts };
}

test("rejected and claim-failed resources release their consumers immediately and absorb late results", async () => {
  const pending = deferred<IComputedValue<readonly string[]>>();
  const failed = source(pending.promise);
  const state = createResourceState(() => failed.resource);
  state.start();
  pending.reject(new Error("Read failed"));
  await Promise.resolve();
  assert.equal(state.error.get(), "Read failed");
  assert.equal(failed.counts.disposals, 1);
  assert.equal(failed.resource.isLive(), false);
  state.stop();
  assert.equal(failed.counts.disposals, 1, "stopping cannot dispose an already released consumer twice");

  const late = deferred<IComputedValue<readonly string[]>>();
  const claimFailed = source(late.promise, { claim: true });
  const claimState = createResourceState(() => claimFailed.resource);
  claimState.start();
  assert.equal(claimFailed.counts.disposals, 1);
  late.resolve(computed(() => ["stale"]));
  await Promise.resolve();
  assert.equal(claimState.data.get(), undefined);
  assert.equal(claimState.error.get(), "Claim failed");
});

test("a previous request finishing or rejecting after restart cannot replace the current value", async () => {
  const previous = deferred<IComputedValue<readonly string[]>>();
  const latest = deferred<IComputedValue<readonly string[]>>();
  const first = source(previous.promise);
  const second = source(latest.promise);
  let attempts = 0;
  const state = createResourceState(() => attempts++ ? second.resource : first.resource);
  state.start();
  state.start();
  latest.resolve(computed(() => ["current"]));
  await Promise.resolve();
  previous.reject(new Error("Stale read failure"));
  await Promise.resolve();
  assert.deepEqual(state.read([]), ["current"]);
  assert.equal(state.error.get(), "");
  assert.equal(first.counts.disposals, 1);
  assert.equal(second.counts.disposals, 0);
  state.stop();
  assert.equal(second.counts.disposals, 1);
  assert.equal(state.data.get(), undefined, "stopped state releases its computed resource reference");
});

test("live computed errors become retryable resource failures and refresh obtains a fresh value", async () => {
  const broken = observable.box(false);
  const failing = source(Promise.resolve(computed(() => { if (broken.get()) throw new Error("Live read failed"); return ["first"]; })));
  const recovered = source(Promise.resolve(computed(() => ["recovered"])));
  let attempts = 0;
  const state = createResourceState(() => attempts++ ? recovered.resource : failing.resource);
  state.start();
  await Promise.resolve();
  assert.deepEqual(state.read([]), ["first"]);
  runInAction(() => broken.set(true));
  assert.deepEqual(state.read([]), []);
  assert.equal(state.error.get(), "Live read failed");
  assert.equal(failing.counts.disposals, 1);
  state.refresh();
  await Promise.resolve();
  assert.deepEqual(state.read([]), ["recovered"]);
  assert.equal(state.error.get(), "");
  state.stop();
  assert.equal(recovered.counts.disposals, 1);
});

test("refresh failures release the watch and throwing cleanup cannot retain state or run twice", async () => {
  const failing = source(Promise.resolve(computed(() => ["value"])), { refresh: true, dispose: true });
  const state = createResourceState(() => failing.resource);
  state.start();
  await Promise.resolve();
  assert.doesNotThrow(state.refresh);
  assert.equal(state.error.get(), "Refresh failed");
  assert.equal(state.data.get(), undefined);
  assert.equal(failing.counts.disposals, 1);
  assert.doesNotThrow(state.stop);
  assert.equal(failing.counts.disposals, 1);
});
