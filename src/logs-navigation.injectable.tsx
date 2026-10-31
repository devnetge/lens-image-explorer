import { getInjectable2 } from "@k8slens/injectable";
import { logsStateInjectable } from "./logs-state.injectable";
import { getTabKind, getTabKindInjectableBunch, openTabInjectionToken, focusTabInjectionToken, tabIsOpenInjectionToken, type TabProps } from "@k8slens/tab-contracts";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { clusterGroupNavigatorItemKind, connectClusterInjectionToken } from "@k8slens/cluster-contracts";
import { getNavigationTargetKind, getNavigationTargetInjectableBunch, navigateToInjectionToken } from "@k8slens/navigation-contracts";
import { getNavigatorItemKind, getNavigatorItemKindInjectableBunch2, type NavigatorItemProps } from "@k8slens/navigator-contracts";
import { NavigatorItemLabel, NavigatorLeafIndicator } from "@k8slens/navigator-components";
import { computed } from "mobx";
import { LogsView } from "./logs-view";

export const logsTabKind = getTabKind()("image-explorer-logs");
const LogsTab = ({ tabId }: TabProps<typeof mainViewTabHostKind>) => <LogsView clusterId={tabId} />;
const LogsTitle = () => <>Logs Explorer</>;

export const logsTabBunch = getTabKindInjectableBunch({
  tabHostKind: mainViewTabHostKind, kind: logsTabKind,
  Component: LogsTab, Title: LogsTitle,
});

export const logsNavigationKind = getNavigationTargetKind<{ clusterId: string }>()("lens-image-explorer-logs");
export const logsNavigationBunch = getNavigationTargetInjectableBunch({
  kind: logsNavigationKind,
  preconditions: [{ consumptions: [connectClusterInjectionToken], instantiate: (di) => {
    const connect = di.inject(connectClusterInjectionToken);
    return () => ({ clusterId }) => connect(clusterId);
  } }],
  navigate: {
    consumptions: [openTabInjectionToken, focusTabInjectionToken, tabIsOpenInjectionToken],
    instantiate: (di) => {
      const open = di.inject(openTabInjectionToken.for(mainViewTabHostKind).for(logsTabKind).for(di.scopeIds))();
      const focus = di.inject(focusTabInjectionToken.for(mainViewTabHostKind).for(logsTabKind).for(di.scopeIds))();
      const isOpen = di.inject(tabIsOpenInjectionToken.for(mainViewTabHostKind).for(logsTabKind).for(di.scopeIds))();
      return () => async ({ clusterId }, signal) => {
        const alreadyOpen = await isOpen({ tabId: clusterId });
        if (signal.aborted) return;
        if (alreadyOpen) await focus({ tabId: clusterId });
        else await open({ tabId: clusterId });
      };
    },
  },
  describe: () => "Logs Explorer",
});

interface LogsItem { readonly id: string; readonly name: string }
export const logsNavigatorKind = getNavigatorItemKind<LogsItem, [clusterId: string, groupId: string]>()("image-explorer-logs");
const LogsNavigatorRow = ({ item }: NavigatorItemProps<LogsItem, typeof clusterGroupNavigatorItemKind>) => (
  <><NavigatorLeafIndicator /><NavigatorItemLabel>{item.name}</NavigatorItemLabel></>
);

export const logsNavigatorBunch = getNavigatorItemKindInjectableBunch2({
  kind: logsNavigatorKind, parentKind: clusterGroupNavigatorItemKind,
  description: "Inspect bounded pod and container log snapshots.",
  items: { instantiate: () => async (_clusterId, groupId) => computed(() => groupId === "workloads" ? [{ id: "logs", name: "Logs", orderNumber: 81 }] : []) },
  activate: {
    consumptions: [navigateToInjectionToken],
    instantiate: (di) => {
      const navigate = di.inject(navigateToInjectionToken.for(logsNavigationKind))();
      return async (clusterId) => { await navigate({ clusterId }); };
    },
  },
  Component: LogsNavigatorRow,
});

export const openImageLogsInjectable = getInjectable2({
  id: "lens-image-explorer-open-image-logs",
  consumptions: [navigateToInjectionToken.for(logsNavigationKind)],
  instantiate: di => {
    const navigate = di.inject(navigateToInjectionToken.for(logsNavigationKind))();
    const stateFor = di.inject(logsStateInjectable);
    return (clusterId: string) => async (image: string) => {
      stateFor(clusterId).setScope("namespace", "");
      stateFor(clusterId).setScope("image", image);
      await navigate({ clusterId });
    };
  },
});
