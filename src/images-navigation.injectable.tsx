import { getTabKind, getTabKindInjectableBunch, openTabInjectionToken, focusTabInjectionToken, tabIsOpenInjectionToken, type TabProps } from "@k8slens/tab-contracts";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { clusterGroupNavigatorItemKind, connectClusterInjectionToken } from "@k8slens/cluster-contracts";
import { getNavigationTargetKind, getNavigationTargetInjectableBunch, navigateToInjectionToken } from "@k8slens/navigation-contracts";
import { getNavigatorItemKind, getNavigatorItemKindInjectableBunch2, type NavigatorItemProps } from "@k8slens/navigator-contracts";
import { NavigatorItemLabel, NavigatorLeafIndicator } from "@k8slens/navigator-components";
import { computed } from "mobx";
import { ImagesView } from "./images-view";

export const imagesTabKind = getTabKind()("image-explorer");
const ImagesTab = ({ tabId }: TabProps<typeof mainViewTabHostKind>) => <ImagesView clusterId={tabId} />;
const ImagesTitle = () => <>Image Explorer</>;

export const imagesTabBunch = getTabKindInjectableBunch({
  tabHostKind: mainViewTabHostKind, kind: imagesTabKind,
  Component: ImagesTab, Title: ImagesTitle,
});

export const imagesNavigationKind = getNavigationTargetKind<{ clusterId: string }>()("lens-image-explorer-images");
export const imagesNavigationBunch = getNavigationTargetInjectableBunch({
  kind: imagesNavigationKind,
  preconditions: [{ consumptions: [connectClusterInjectionToken], instantiate: (di) => {
    const connect = di.inject(connectClusterInjectionToken);
    return () => ({ clusterId }) => connect(clusterId);
  } }],
  navigate: {
    consumptions: [openTabInjectionToken, focusTabInjectionToken, tabIsOpenInjectionToken],
    instantiate: (di) => {
      const open = di.inject(openTabInjectionToken.for(mainViewTabHostKind).for(imagesTabKind).for(di.scopeIds))();
      const focus = di.inject(focusTabInjectionToken.for(mainViewTabHostKind).for(imagesTabKind).for(di.scopeIds))();
      const isOpen = di.inject(tabIsOpenInjectionToken.for(mainViewTabHostKind).for(imagesTabKind).for(di.scopeIds))();
      return () => async ({ clusterId }, signal) => {
        const alreadyOpen = await isOpen({ tabId: clusterId });
        if (signal.aborted) return;
        if (alreadyOpen) await focus({ tabId: clusterId });
        else await open({ tabId: clusterId });
      };
    },
  },
  describe: () => "Image Explorer",
});

interface ImagesItem { readonly id: string; readonly name: string }
export const imagesNavigatorKind = getNavigatorItemKind<ImagesItem, [clusterId: string, groupId: string]>()("image-explorer");
const ImagesNavigatorRow = ({ item }: NavigatorItemProps<ImagesItem, typeof clusterGroupNavigatorItemKind>) => (
  <><NavigatorLeafIndicator /><NavigatorItemLabel>{item.name}</NavigatorItemLabel></>
);

export const imagesNavigatorBunch = getNavigatorItemKindInjectableBunch2({
  kind: imagesNavigatorKind, parentKind: clusterGroupNavigatorItemKind,
  description: "Inspect the images and runtime image IDs used by a cluster's containers.",
  items: { instantiate: () => async (_clusterId, groupId) => computed(() => groupId === "workloads" ? [{ id: "images", name: "Images", orderNumber: 80 }] : []) },
  activate: {
    consumptions: [navigateToInjectionToken],
    instantiate: (di) => {
      const navigate = di.inject(navigateToInjectionToken.for(imagesNavigationKind))();
      return async (clusterId) => { await navigate({ clusterId }); };
    },
  },
  Component: ImagesNavigatorRow,
});
