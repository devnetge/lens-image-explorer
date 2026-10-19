import { buildDetailsPanelSectionBunch, type DetailsPanelSectionProps } from "@k8slens/details-panel-contracts";
import { DrawerItem, DrawerSubTitle, NoItemsDetailItem } from "@k8slens/details-panel-components";
import { coreV1, podKind } from "@k8slens/kubernetes-contracts";
import { Div, Code, Span } from "@k8slens/element-components";
import { ContentCopyIcon } from "@k8slens/icon";
import { PlainButton } from "@k8slens/input-components";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { describePodImagesInjectable, imageActionsInjectable } from "./images-state.injectable";
import { RegistryBadges } from "./registry-badges";
import { registryDetailsInjectable } from "./registry-details.injectable";
import { NodeRuntime } from "./node-runtime-view";

const PodRegistryBadges = ({ image }: { image: string }) => (
  <RegistryBadges details={useSyncInject(registryDetailsInjectable, image)} />
);

export const PodRuntimeImageID = ({ value, copy }: { value: string; copy: (value: string) => Promise<void> }) => (
  <Div $className="lie-pod-runtime-id">
    <Code aria-label="Full runtime image ID" $padding="s" $backgroundColor="backgroundSecondary"
      $color={value ? "textDefault" : "textMuted"} $className="lie-pod-runtime-value lie-mono">
      {value || "Not reported yet"}
    </Code>
    <PlainButton Icon={ContentCopyIcon} $disabled={!value} $onClick={() => copy(value)}
      aria-label="Copy full runtime image ID" $tooltip="Copy the complete runtime image ID"
      $padding="xs" $font={{ size: "s" }} $className="lie-pod-copy-id">Copy</PlainButton>
  </Div>
);

export const PodImages = observer(({ resource, clusterId }: DetailsPanelSectionProps<typeof podKind, typeof coreV1>) => {
  const describe = useSyncInject(describePodImagesInjectable);
  const actions = useSyncInject(imageActionsInjectable, clusterId);
  const containers = describe(resource);
  return <Div $className="lie-pod-images">
    {containers.length ? containers.map((container) => <Div key={container.id} $className="lie-pod-container">
      <DrawerSubTitle $className="lie-pod-container-title">
        <Span $font={{ bold: true }}>{container.containerName}</Span>
        <Span $color="textMuted" $font={{ size: "s", bold: false }}>{container.kind} · {container.state}</Span>
      </DrawerSubTitle>
      <DrawerItem name="Requested image" $className="lie-pod-image-row">
        <Code $padding="s" $backgroundColor="backgroundSecondary" $className="lie-pod-requested-image lie-mono">
          {container.requestedImage}
        </Code>
      </DrawerItem>
      <DrawerItem name="Registry" $className="lie-pod-image-row">
        <Div $className="lie-pod-image-value"><PodRegistryBadges image={container.requestedImage} /></Div>
      </DrawerItem>
      <DrawerItem name="Runtime image ID" $className="lie-pod-image-row">
        <PodRuntimeImageID value={container.imageID} copy={actions.copyID} />
      </DrawerItem>
      <DrawerItem name="Node runtime" $className="lie-pod-image-row">
        <NodeRuntime clusterId={clusterId} nodeName={container.nodeName} />
      </DrawerItem>
    </Div>) : <NoItemsDetailItem>No container images reported.</NoItemsDetailItem>}
    {actions.feedback.get() && <DrawerItem name="Clipboard" $className="lie-pod-image-row">
      <Span role="status">{actions.feedback.get()}</Span>
    </DrawerItem>}
  </Div>;
});

export const podImagesSection = buildDetailsPanelSectionBunch({
  id: "image-explorer-container-images", kind: podKind, apiVersion: coreV1,
  title: "Container images", orderNumber: 35, Component: PodImages,
});
