import { Div, Span, Svg } from "@k8slens/element-components";
import { AwsIcon, AzureIcon, GitHubIcon } from "@k8slens/icon";
import type { ReactNode } from "react";
import type { RegistryDetails } from "./registry-model";

// Compact provider marks inherit the Lens theme; use host brand glyphs where available.
const dockerMark = <>
  <path d="M3 11h15c1.5 0 2.8-.6 3.5-1.7-.1 5.6-3.2 9.2-9.5 9.2-4.6 0-7.8-2.4-9-7.5Z" fill="currentColor" stroke="none" />
  <path d="M19 10c-.4-1.4-.1-2.5.7-3.5 1 .9 1.4 2 1.1 3.1" />
  <path d="M5 7h3v3H5zm4 0h3v3H9zm4 0h3v3h-3zM9 3h3v3H9zm4 0h3v3h-3z" fill="currentColor" stroke="none" />
  <circle cx="6.5" cy="13.5" r=".7" fill="Canvas" stroke="none" />
</>;
const googleMark = <>
  <path d="M7.4 7.2a5.8 5.8 0 0 1 10.9 1.5A4.7 4.7 0 0 1 18.2 18H6a4.8 4.8 0 0 1-1-9.5 4 4 0 0 1 2.4-1.3Z" />
  <path d="M14.6 10.7a3.5 3.5 0 1 0 .8 4H12m3.4 0v-2H12" />
</>;
const registryMarks: Partial<Record<RegistryDetails["provider"], ReactNode>> = {
  "docker-hub": dockerMark,
  "google-artifact-registry": googleMark,
  "google-container-registry": googleMark,
  "quay": <>
    <circle cx="11" cy="10.5" r="8" strokeWidth="3" />
    <path d="m12 12 8 9m-9-9 1 6 5-2" strokeWidth="3" />
  </>,
  "unknown": <>
    <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10m-4-17 9 5" />
  </>,
};

const hostRegistryIcons: Partial<Record<RegistryDetails["provider"], typeof AwsIcon>> = {
  "aws-ecr": AwsIcon,
  "aws-ecr-public": AwsIcon,
  "azure-container-registry": AzureIcon,
  "github-container-registry": GitHubIcon,
};

const RegistryProviderIcon = ({ details }: { details: RegistryDetails }) => {
  const HostIcon = hostRegistryIcons[details.provider];

  return HostIcon ? (
    <HostIcon $size="l" $color="textDefault" role="img" aria-label={details.providerLabel} />
  ) : (
    <Svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={details.providerLabel}>
      {registryMarks[details.provider]}
    </Svg>
  );
};

const visibilityLabels = { public: "Public", private: "Private", unknown: "Unknown" } as const;
const visibilityMarks: Record<RegistryDetails["visibility"], ReactNode> = {
  public: <>
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
  </>,
  private: <>
    <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
  </>,
  unknown: <>
    <circle cx="12" cy="12" r="9" /><path d="M9.5 8.8a2.6 2.6 0 1 1 4 2.4c-1.1.6-1.5 1.1-1.5 2.3m0 2.8v.2" />
  </>,
};

/** Lens owns the hover tooltip; native disclosure keeps persistent details in the row. */
export const RegistryBadges = ({ details }: { details: RegistryDetails }) => (
    <details className="lie-registry-disclosure">
      <summary className="lie-registry-summary"
        aria-label={`${details.providerLabel}; visibility ${visibilityLabels[details.visibility]}; registry details for ${details.registry}/${details.repository}`}>
        <Span $tooltip={details.tooltip} $className="lie-registry-badges" $color="textMuted"
        $flex={{ gap: "s", verticalAlign: "center", wrap: true }}>
        <Span $className="lie-registry-provider" $size="l"
          $flex={{ horizontalAlign: "center", verticalAlign: "center" }}>
          <RegistryProviderIcon details={details} />
        </Span>
        <Span $className={`lie-visibility lie-visibility-${details.visibility}`} $flex={{ gap: "xs", verticalAlign: "center" }}>
          <Svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {visibilityMarks[details.visibility]}
          </Svg>
          <Span>{visibilityLabels[details.visibility]}</Span>
        </Span>
        <Span aria-hidden="true" $className="lie-registry-chevron">▸</Span>
        </Span>
      </summary>
      <Div
        $padding="m" $backgroundColor="backgroundSecondary" $color="textDefault" $className="lie-registry-details">
        {details.tooltip}
      </Div>
    </details>
);
