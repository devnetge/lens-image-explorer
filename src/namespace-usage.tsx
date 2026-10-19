import { Div, Span } from "@k8slens/element-components";
import type { NamespaceUsage as NamespaceUsageEntry } from "./image-model";

const usageCount = (count: number) => `${count} container${count === 1 ? "" : "s"}`;

export const NamespaceUsage = ({ usages }: { usages: readonly NamespaceUsageEntry[] }) => {
  if (!usages.length) return <Span $color="textMuted">Unavailable</Span>;
  if (usages.length <= 2) return (
    <Div $className="lie-namespace-names">
      {usages.map((usage) => <Span key={usage.namespace} $color="textMuted"
        $tooltip={`${usage.namespace}: ${usageCount(usage.containerCount)} in the current scope`}>{usage.namespace}</Span>)}
    </Div>
  );

  return (
    <details className="lie-namespace-disclosure">
      <summary aria-label={`Show usage across ${usages.length} namespaces`}>
        {usages.length} namespaces <span aria-hidden="true" className="lie-namespace-chevron">▸</span>
      </summary>
      <Div $className="lie-namespace-breakdown">
        {usages.map((usage) => <Div key={usage.namespace} $className="lie-namespace-usage-row">
          <Span>{usage.namespace}</Span><Span $color="textMuted">{usageCount(usage.containerCount)}</Span>
        </Div>)}
      </Div>
    </details>
  );
};
