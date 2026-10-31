import { getFeature, registerInjectablesFromModules } from "@k8slens/feature-core";
import * as state from "./images-state.injectable";
import * as navigation from "./images-navigation.injectable";
import * as podImages from "./pod-images.injectable";
import * as styles from "./images-styles.injectable";
import * as clusterHeading from "./cluster-heading.injectable";
import * as registryDetails from "./registry-details.injectable";
import * as registryQuery from "./registry-query.injectable";
import * as imageSearchQuery from "./image-search-query.injectable";
import * as nodeRuntime from "./node-runtime.injectable";
import * as nodeRuntimeQuery from "./node-runtime-query.injectable";

import * as logsState from "./logs-state.injectable";
import * as logsNavigation from "./logs-navigation.injectable";
import * as logsStyles from "./logs-styles.injectable";
import * as logsQueries from "./logs-query.injectable";

export const luminaInfrabotLinkFeature = getFeature({
  id: "lumina-infrabot-link",
  register: (di) => {
    registerInjectablesFromModules(di, [state, navigation, podImages, styles, clusterHeading, registryDetails, registryQuery, imageSearchQuery, nodeRuntime, nodeRuntimeQuery, logsState, logsNavigation, logsStyles, logsQueries]);
  },
});
