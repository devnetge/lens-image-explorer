import { getInjectable2 } from "@k8slens/injectable";
import { describeRegistry } from "./registry-model";

/** Keep registry parsing and visibility inference outside rendering. */
export const registryDetailsInjectable = getInjectable2({
  id: "lens-image-explorer-registry-details",
  instantiate: () => (image: string) => describeRegistry(image),
});
