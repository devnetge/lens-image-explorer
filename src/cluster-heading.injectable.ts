import { getInjectable2 } from "@k8slens/injectable";
import { clusterNameReactiveInjectionToken } from "@k8slens/cluster-contracts";
import { computed, observable, runInAction, type IComputedValue } from "mobx";

/** Keep unresolved Lens metadata out of React children, without Suspense. */
export function createClusterHeading(name: Promise<IComputedValue<string>>): IComputedValue<string> {
  const resolved = observable.box<IComputedValue<string> | undefined>(undefined, { deep: false });
  void name.then(
    (value) => runInAction(() => resolved.set(value)),
    () => { /* The fallback remains usable if cluster metadata is unavailable. */ },
  );
  return computed(() => resolved.get()?.get() || "Kubernetes cluster");
}

export const clusterHeadingInjectable = getInjectable2({
  id: "lens-image-explorer-cluster-heading",
  consumptions: [clusterNameReactiveInjectionToken],
  instantiate: (di) => {
    const clusterName = di.inject(clusterNameReactiveInjectionToken);
    return (clusterId: string) => createClusterHeading(clusterName(clusterId));
  },
});
