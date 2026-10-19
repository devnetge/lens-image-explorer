import type { Subscribable, Subscription } from "@k8slens/subscribable";
import { observable, runInAction, type IComputedValue } from "mobx";

/** An optional read source that cannot take down the primary Pod view. */
export function createResourceState<T>(load?: () => Subscribable<T>) {
  const data = observable.box<IComputedValue<T> | undefined>(undefined, { deep: false });
  const error = observable.box("");
  let subscription: Subscription<T> | undefined;
  let generation = 0;
  const stop = () => {
    generation += 1;
    subscription?.dispose();
    subscription = undefined;
    runInAction(() => data.set(undefined));
  };
  const start = () => {
    stop();
    runInAction(() => error.set(""));
    if (!load) return;
    const current = generation;
    try {
      subscription = load().subscribe();
      subscription.claim();
      void subscription.value.then(
        (value) => { if (generation === current) runInAction(() => data.set(value)); },
        (reason: unknown) => { if (generation === current) runInAction(() => error.set(reason instanceof Error ? reason.message : "Resource access unavailable.")); },
      );
    } catch (reason) {
      runInAction(() => error.set(reason instanceof Error ? reason.message : "Resource access unavailable."));
    }
  };
  return { data, error, configured: Boolean(load), start, stop,
    refresh: () => { error.get() ? start() : subscription?.refresh(); } };
}
