import type { Subscribable, Subscription } from "@k8slens/subscribable";
import { observable, runInAction, type IComputedValue } from "mobx";

/** An optional read source that cannot take down the primary Pod view. */
export function createResourceState<T>(load?: () => Subscribable<T>, unavailableMessage = "Resource access unavailable.") {
  const data = observable.box<IComputedValue<T> | undefined>(undefined, { deep: false });
  const error = observable.box("");
  let subscription: Subscription<T> | undefined;
  let generation = 0;
  const stop = () => {
    generation += 1;
    const previous = subscription;
    subscription = undefined;
    runInAction(() => data.set(undefined));
    try { previous?.dispose(); } catch { /* One failed cleanup must not retain this consumer or prevent sibling cleanup. */ }
  };
  const fail = (current: number, reason: unknown) => {
    if (generation !== current) return;
    runInAction(() => {
      stop();
      error.set(reason instanceof Error ? reason.message : unavailableMessage);
    });
  };
  const start = () => runInAction(() => {
    stop();
    error.set("");
    if (!load) return;
    const current = generation;
    try {
      subscription = load().subscribe();
      void subscription.value.then(
        (value) => { if (generation === current) runInAction(() => data.set(value)); },
        (reason: unknown) => fail(current, reason),
      );
      subscription.claim();
    } catch (reason) {
      fail(current, reason);
    }
  });
  return { data, error, configured: Boolean(load), start, stop,
    read: (fallback: T): T => {
      const value = data.get();
      if (!value) return fallback;
      try { return value.get(); } catch (reason) { fail(generation, reason); return fallback; }
    },
    refresh: () => {
      if (error.get()) { start(); return; }
      try { subscription?.refresh(); } catch (reason) { fail(generation, reason); }
    } };
}
