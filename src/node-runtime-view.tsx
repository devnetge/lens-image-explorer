import { Code } from "@k8slens/element-components";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { nodeRuntimeDetailsInjectable } from "./node-runtime.injectable";
import type { NodeRuntimeInfo } from "./node-runtime";

export const NodeRuntimeLabel = ({ info }: { info: NodeRuntimeInfo }) => (
  <Code $className="lie-node-runtime lie-wrap" $color={info.available ? "textDefault" : "textMuted"}
    $tooltip={info.available ? `Node-reported runtime: ${info.reported}` : info.reason}>
    {info.label}
  </Code>
);

export const NodeRuntime = observer(({ clusterId, nodeName }: { clusterId: string; nodeName: string }) => (
  <NodeRuntimeLabel info={useSyncInject(nodeRuntimeDetailsInjectable, clusterId, nodeName).get()} />
));
