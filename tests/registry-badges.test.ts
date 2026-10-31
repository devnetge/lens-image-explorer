import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { autorun, computed, observable, runInAction } from "mobx";

// Read React text children without parsing serialized HTML.
const visibleChildText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map(visibleChildText).join("");
  if (!isValidElement<{ children?: ReactNode; "aria-hidden"?: boolean | string }>(node)) return "";
  if (node.props["aria-hidden"] === true || node.props["aria-hidden"] === "true") return "";
  return visibleChildText(node.props.children);
};

test("registry badges keep visibility honest and details available from the keyboard in both image views", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "lens-registry-badges-render-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "registry-render.cjs");
  const source = (name: string) => JSON.stringify(resolve("src", name));
  const jsxRuntime = createRequire(resolve("package.json")).resolve("react/jsx-runtime");
  await build({
    stdin: {
      contents: `
        export { RegistryBadges } from ${source("registry-badges.tsx")};
        export { describeRegistry } from ${source("registry-model.ts")};
        export { registryDetailsInjectable } from ${source("registry-details.injectable.ts")};
        export { openImageLogsInjectable } from ${source("logs-navigation.injectable.tsx")};
        export { LogsView } from ${source("logs-view.tsx")};
        export { createLogsState, logsStateInjectable } from ${source("logs-state.injectable.ts")};
        export { ImagesView, FullImageID } from ${source("images-view.tsx")};
        export { PodImages, PodRuntimeImageID } from ${source("pod-images.injectable.tsx")};
        export { createImagesState, imagesStateInjectable, imageActionsInjectable, describePodImagesInjectable } from ${source("images-state.injectable.ts")};
        export { clusterHeadingInjectable } from ${source("cluster-heading.injectable.ts")};
        export { NodeRuntime, NodeRuntimeLabel } from ${source("node-runtime-view.tsx")};
        export { NamespaceUsage } from ${source("namespace-usage.tsx")};
        export { nodeRuntimeDetailsInjectable } from ${source("node-runtime.injectable.ts")};
        export { collectContainerImages, groupImages } from ${source("image-model.ts")};
        export { setTestInjections } from "@k8slens/use-inject";
        export { getTestRenderedProps, resetTestRenderedProps } from "react/jsx-runtime";
      `,
      loader: "ts", resolveDir: process.cwd(),
    },
    outfile: output, bundle: true, platform: "node", format: "cjs", jsx: "automatic", packages: "external",
    plugins: [{
      name: "test-lens-registry-rendering",
      setup(builder) {
        builder.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: "jsx-runtime", namespace: "test-jsx" }));
        builder.onResolve({ filter: /.*/, namespace: "test-jsx" }, (args) => ({ path: args.path, external: true }));
        builder.onLoad({ filter: /.*/, namespace: "test-jsx" }, () => ({
          contents: `
            import { jsx as renderJsx, jsxs as renderJsxs, Fragment } from ${JSON.stringify(jsxRuntime)};
            const rendered = [];
            const track = (render) => (type, props, key) => {
              if (props && (props["aria-label"] || props.$tooltip || props.title || props.onClick || props.onKeyDown || props.type === "checkbox")) rendered.push({ type, props });
              return render(type, props, key);
            };
            export { Fragment };
            export const jsx = track(renderJsx), jsxs = track(renderJsxs);
            export const getTestRenderedProps = () => rendered;
            export const resetTestRenderedProps = () => { rendered.length = 0; };
          `, loader: "js",
        }));
        builder.onResolve({ filter: /^@k8slens\/(use-inject|element-components|input-components|details-panel-components|icon)$/ }, (args) => ({ path: args.path, namespace: "test-lens" }));
        builder.onLoad({ filter: /.*/, namespace: "test-lens" }, (args) => ({
          contents: args.path.endsWith("use-inject") ? `
            let injections = new Map();
            export const setTestInjections = (next) => { injections = next; };
            export const useSyncInject = (token, ...parameters) => {
              if (!injections.has(token)) throw new Error("Unexpected registry view injection");
              const value = injections.get(token);
              return typeof value === "function" ? value(...parameters) : value;
            };
          ` : `
            import { createElement } from "react";
            const element = (tag) => (props) => {
              const ordinary = Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith("$")));
              return createElement(tag, { ...ordinary, className: props.$className,
                disabled: props.$disabled ?? ordinary.disabled });
            };
            export const Div = element("div"), Span = element("span"), Svg = element("svg"), H1 = element("h1"),
              Code = element("code"), Button = element("button"), Input = element("input");
            export const TextInput = (props) => createElement(Input, { ...props, "data-lens-component": "TextInput" });
            export const PlainButton = ({ Icon, ...props }) => createElement(Button,
              { type: "button", ...props, "data-lens-component": "PlainButton" },
              Icon ? createElement(Icon, { "aria-hidden": true }) : null, props.children);
            const icon = (name) => (props) => createElement(Svg, { ...props, "data-lens-icon": name, width: 24, height: 24 });
            export const AwsIcon = icon("AWS"), AzureIcon = icon("Azure"), GitHubIcon = icon("GitHub"), ContentCopyIcon = icon("Copy");
            export const DrawerItem = ({ name, children, ...props }) => createElement(Div,
              { ...props, "data-lens-component": "DrawerItem" }, createElement("span", null, name), createElement("div", null, children));
            export const DrawerSubTitle = (props) => createElement(Div, { ...props, "data-lens-component": "DrawerSubTitle" });
            export const NoItemsDetailItem = (props) => createElement(Div, { ...props, "data-lens-component": "NoItemsDetailItem" });
          `,
          loader: "js", resolveDir: process.cwd(),
        }));
      },
    }],
  });
  const ui = createRequire(resolve("package.json"))(output);
  const renderBadges = (image: string) => renderToStaticMarkup(createElement(ui.RegistryBadges, { details: ui.describeRegistry(image) }));
  const containerd = { available: true, label: "containerd 1.7.24", runtime: "containerd", version: "1.7.24", reported: "containerd://1.7.24", reason: "" };
  const crio = { available: true, label: "cri-o 1.30.6", runtime: "cri-o", version: "1.30.6", reported: "cri-o://1.30.6", reason: "" };
  const unavailableRuntime = { available: false, label: "Unavailable", runtime: "", version: "", reported: "", reason: "Node runtime was not reported." };
  const runtimeByNode = new Map([["worker-a", containerd], ["worker-b", crio]]);
  const runtimeCalls: [string, string][] = [];
  const runtimeDetails = (clusterId: string, nodeName: string) => {
    runtimeCalls.push([clusterId, nodeName]);
    return computed(() => runtimeByNode.get(nodeName) ?? unavailableRuntime);
  };
  const compactState = <T extends Record<string, unknown>>(state: T) => {
    const scopeOpen = observable.box(false);
    const namespaceExpanded = observable.set<string>();
    return {
      scopeOpen, namespaceExpanded, namespaceManual: observable.box(false),
      activeFilters: computed(() => []), scopeCount: computed(() => 0), showReset: computed(() => false), relaxedFilters: computed(() => []),
      toggleScope: () => runInAction(() => scopeOpen.set(!scopeOpen.get())),
      toggleNamespaces: (id: string) => runInAction(() => { namespaceExpanded.has(id) ? namespaceExpanded.delete(id) : namespaceExpanded.add(id); }),
      toggleMultipleOnly: () => {}, clearFilter: (_id: string) => {}, resetAllFilters: () => {},
      ...state,
    };
  };

  await t.test("node runtime labels preserve reported evidence and unavailable reasons", () => {
    const available = ui.NodeRuntimeLabel({ info: containerd });
    assert.equal(available.props.children, "containerd 1.7.24");
    assert.equal(available.props.$tooltip, "Node-reported runtime: containerd://1.7.24");
    const missing = ui.NodeRuntimeLabel({ info: unavailableRuntime });
    assert.equal(missing.props.children, "Unavailable");
    assert.equal(missing.props.$tooltip, unavailableRuntime.reason);
    assert.equal(missing.props.$color, "textMuted");
  });

  await t.test("all provider marks have names and an explicit visibility label", () => {
    for (const image of [
      "nginx:stable",
      "123456789012.dkr.ecr.eu-west-1.amazonaws.com/team/api:v1",
      "public.ecr.aws/example/api:v1",
      "europe-west1-docker.pkg.dev/example/team/api:v1",
      "gcr.io/example/api:v1",
      "ghcr.io/example/api:v1",
      "example.azurecr.io/api:v1",
      "quay.io/example/api:v1",
      "registry.example/team/api:v1",
    ]) {
      const details = ui.describeRegistry(image);
      const markup = renderBadges(image);
      assert.ok(markup.includes(`role="img" aria-label="${details.providerLabel}"`), image);
      assert.match(markup, />Public<|>Private<|>Unknown</, image);
      assert.match(markup, /aria-label="[^"]*visibility (Public|Private|Unknown)/, image);
      const summary = markup.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
      assert.ok(summary, "the provider logo remains keyboard accessible");
      // Inspect text emitted by nested components too, without rewriting HTML.
      const visibleSummaryText = [...summary.matchAll(/>([^<]*)/g)].map((match) => match[1]).join("");
      assert.ok(!visibleSummaryText.includes(details.providerLabel), "provider names belong in the accessible label and tooltip, leaving compact logos visible");
    }
    assert.match(renderBadges("ghcr.io/example/api:v1"), />Unknown</, "provider recognition alone does not establish public access");
    assert.match(renderBadges("123456789012.dkr.ecr.eu-west-1.amazonaws.com/team/api:v1"), />Private</);
    assert.match(renderBadges("public.ecr.aws/example/api:v1"), />Public</);
  });

  await t.test("explorer image IDs keep their complete wrapping text and copy that exact raw value", async () => {
    const rawID = `docker-pullable://registry.example/${"very-long-repository-".repeat(8)}api@sha256:${"a".repeat(64)}`;
    const copied: string[] = [];
    const component = ui.FullImageID({ value: rawID, copy: async (value: string) => { copied.push(value); } });
    const children = Array.isArray(component.props.children) ? component.props.children : [component.props.children];
    const copyAction = children.find((child: { props?: { $onClick?: unknown } }) => typeof child?.props?.$onClick === "function");
    assert.ok(copyAction, "the compact copy control has an action");
    assert.deepEqual(copied, [], "rendering does not copy anything");
    await copyAction.props.$onClick();
    assert.deepEqual(copied, [rawID], "copying must preserve the exact runtime ID");
    const known = renderToStaticMarkup(createElement(ui.FullImageID, { value: rawID, copy: async () => {} }));
    assert.ok(known.includes(`>${rawID}</code>`), "the wrapping code block must keep the complete runtime value");
    assert.match(known, /aria-label="Full runtime image ID"/);
    assert.doesNotMatch(known, /<input\b/);
    assert.match(known, /data-lens-component="PlainButton"/);
    assert.match(known, />Copy<\/button>/);
    assert.doesNotMatch(known, /disabled=""/, "a known ID can be copied");
    const unavailable = renderToStaticMarkup(createElement(ui.FullImageID, { value: "", copy: async () => {} }));
    assert.match(unavailable, />Not reported yet<\/code>/);
    assert.match(unavailable, /disabled=""/, "an unreported ID must not offer an empty copy");
  });

  await t.test("the Pod's wrapping ID keeps the complete raw text and copies that exact value", async () => {
    const rawID = `docker-pullable://registry.example/${"long-repository-".repeat(10)}api@sha256:${"c".repeat(64)}`;
    const copied: string[] = [];
    const component = ui.PodRuntimeImageID({ value: rawID, copy: async (value: string) => { copied.push(value); } });
    const children = Array.isArray(component.props.children) ? component.props.children : [component.props.children];
    const copyAction = children.find((child: { props?: { $onClick?: unknown } }) => typeof child?.props?.$onClick === "function");
    assert.ok(copyAction, "the small copy control has an action");
    assert.deepEqual(copied, [], "rendering does not copy anything");
    await copyAction.props.$onClick();
    assert.deepEqual(copied, [rawID], "copying must not abbreviate or normalize the runtime ID");
    const known = renderToStaticMarkup(createElement(ui.PodRuntimeImageID, { value: rawID, copy: async () => {} }));
    assert.ok(known.includes(`>${rawID}</code>`));
    assert.match(known, /aria-label="Full runtime image ID"/);
    assert.doesNotMatch(known, /<input\b/);
    assert.match(known, />Copy<\/button>/);
    assert.doesNotMatch(known, /disabled=""/);
    const unavailable = renderToStaticMarkup(createElement(ui.PodRuntimeImageID, { value: "", copy: async () => {} }));
    assert.match(unavailable, />Not reported yet<\/code>/);
    assert.match(unavailable, /disabled=""/);
  });

  await t.test("each badge has a default-collapsed native disclosure with complete, escaped details", () => {
    const details = ui.describeRegistry("123456789012.dkr.ecr.eu-west-1.amazonaws.com/team/api:v1");
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(ui.RegistryBadges, { details }), createElement(ui.RegistryBadges, { details })));
    const disclosures = [...markup.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
    assert.equal(disclosures.length, 2, "each badge owns a separate native disclosure");
    for (const [, attributes, contents] of disclosures) {
      assert.doesNotMatch(attributes, /\bopen(?:\s|=|$)/, "details must stay collapsed until requested");
      assert.match(contents, /^<summary\b[^>]*aria-label="[^"]*registry details for /, "the native summary provides keyboard activation");
      assert.ok(contents.includes(`${details.registry}/${details.repository}`), "the summary identifies its image repository");
      assert.match(contents, /<\/summary><div class="lie-registry-details">/, "full details stay inside the native disclosure");
    }
    assert.doesNotMatch(markup, /\bpopover(?:target)?=/i, "persistent details must not depend on host popover visibility");
    for (const value of [details.registry, details.repository, details.account, details.region, details.visibilityReason]) {
      assert.ok(value && markup.includes(value), `full registry information includes ${value}`);
    }
    const escapingCases = [
      {
        name: "lowercase script and ampersand",
        text: "Registry <script>alert('unsafe')</script> & details",
        expected: "Registry &lt;script&gt;alert(&#x27;unsafe&#x27;)&lt;/script&gt; &amp; details",
      },
      {
        name: "uppercase script with attributes",
        text: '<SCRIPT data-test="upper">alert("unsafe")</SCRIPT>',
        expected: "&lt;SCRIPT data-test=&quot;upper&quot;&gt;alert(&quot;unsafe&quot;)&lt;/SCRIPT&gt;",
      },
      {
        name: "mixed-case script",
        text: "<ScRiPt type='text/javascript'>alert(1)</sCrIpT>",
        expected: "&lt;ScRiPt type=&#x27;text/javascript&#x27;&gt;alert(1)&lt;/sCrIpT&gt;",
      },
      {
        name: "image and SVG event attributes",
        text: '<img src=x onerror="alert(1)"><svg onload=\'alert(2)\'></svg>',
        expected: "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;svg onload=&#x27;alert(2)&#x27;&gt;&lt;/svg&gt;",
      },
      {
        name: "encoded markup stays literal",
        text: "&lt;script&gt; &quot;unsafe&quot; &#60;img&#62; &#x3c;svg&#x3e;",
        expected: "&amp;lt;script&amp;gt; &amp;quot;unsafe&amp;quot; &amp;#60;img&amp;#62; &amp;#x3c;svg&amp;#x3e;",
      },
      {
        name: "malformed delimiters and both quote styles",
        text: '<<script> <img src=x onerror=alert(1) < > & "quoted" \'single\'',
        expected: "&lt;&lt;script&gt; &lt;img src=x onerror=alert(1) &lt; &gt; &amp; &quot;quoted&quot; &#x27;single&#x27;",
      },
    ];
    for (const { name, text, expected } of escapingCases) {
      const badge = ui.RegistryBadges({ details: { ...details, tooltip: text } });
      const body = badge.props.children.find((child: { props?: { $className?: string } }) => child.props?.$className === "lie-registry-details");
      assert.ok(body, name);
      assert.equal(body.props.children, text, `${name}: the complete input remains a text child`);
      const expectedBody = `<div class="lie-registry-details">${expected}</div>`;
      assert.equal(renderToStaticMarkup(body), expectedBody, name);
      assert.ok(renderToStaticMarkup(badge).endsWith(`${expectedBody}</details>`), `${name}: the full disclosure keeps the escaped body`);
    }
  });

  await t.test("labeled search controls call their matching state handlers and clear only search filters", () => {
    const noop = () => {};
    const calls: string[] = [];
    const search = observable.box("");
    const tagOrPin = observable.box("");
    const pinning = observable.box("all");
    const multipleNamespacesOnly = observable.box(false);
    const change = (name: string, box: typeof search) => (event: { currentTarget: { value: string } }) => {
      calls.push(name); runInAction(() => box.set(event.currentTarget.value));
    };
    const state = {
      view: computed(() => ({ status: "ready", sizeStatus: "unavailable", groups: [], imageCount: 3, containerCount: 3,
        namespaceCount: 1, multipleCount: 0, error: "", sizeError: "", namespaces: ["production"],
        workloadStatus: "ready", workloadLabels: new Map(), matchFields: new Map(), workloads: [] })),
      search, tagOrPin, pinning, namespace: observable.box("production"), namespaceDraft: observable.box(""), namespaceError: observable.box(""),
      runningOnly: observable.box(true), multipleOnly: observable.box(false), multipleNamespacesOnly, workloadType: observable.box(""), workloadID: observable.box("workload-a"),
      expanded: observable.set<string>(), sort: observable.box("image"), descending: observable.box(false), sortBy: noop, toggleExpanded: noop,
      refresh: noop, setSearch: change("search", search), setTagOrPin: change("tag", tagOrPin), selectPinning: change("pinning", pinning),
      clearSearchFilters: () => { calls.push("clear"); runInAction(() => { search.set(""); tagOrPin.set(""); pinning.set("all"); }); },
      setNamespaceDraft: noop, applyNamespace: noop, setRunningOnly: noop, setMultipleOnly: noop,
      setMultipleNamespacesOnly: (event: { currentTarget: { checked: boolean } }) => {
        calls.push("namespaces"); runInAction(() => multipleNamespacesOnly.set(event.currentTarget.checked));
      },
      selectNamespace: noop, selectWorkloadType: noop, selectWorkload: noop,
    };
    ui.setTestInjections(new Map([
      [ui.openImageLogsInjectable, () => async () => {}],
      [ui.imagesStateInjectable, compactState(state)], [ui.imageActionsInjectable, { feedback: observable.box(""), copyFeedback: observable.box(undefined) }],
      [ui.clusterHeadingInjectable, computed(() => "Production")],
    ]));
    const render = () => {
      ui.resetTestRenderedProps();
      return renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    };
    const markup = render();
    assert.match(markup, /<label[^>]*>Search<\/label>/);
    assert.match(markup, /<label[^>]*>Tag \/ pin<\/label>/);
    assert.match(markup, /<label[^>]*>Pinning<\/label>/);
    assert.match(markup, /Search and Tag \/ pin apply together/);
    assert.match(markup, /Showing <b>0<\/b> of <b>3<\/b> image references/);
    const rendered = ui.getTestRenderedProps();
    const query = rendered.find(({ props }: { props: Record<string, unknown> }) => props["aria-label"] === "Search images").props;
    const tag = rendered.find(({ props }: { props: Record<string, unknown> }) => props["aria-label"] === "Search tag or pin").props;
    const pin = rendered.find(({ props }: { props: Record<string, unknown> }) => props["aria-label"] === "Image pinning").props;
    const clear = rendered.find(({ props }: { props: Record<string, unknown> }) => props.children === "Clear search").props;
    const namespacesOnly = rendered.find(({ props }: { props: Record<string, unknown> }) => props.onChange === state.setMultipleNamespacesOnly).props;
    assert.equal(query.type, "text");
    assert.equal(tag.type, "text");
    assert.equal(query["aria-describedby"], tag["aria-describedby"]);
    for (const label of ["Search images", "Search tag or pin"]) {
      assert.match(markup, new RegExp(`<input[^>]*aria-label="${label}"`));
    }
    assert.match(markup, /<option value="all"[^>]*>All references<\/option>/);
    assert.match(markup, /<option value="pinned">Digest pinned<\/option>/);
    assert.match(markup, /<option value="unpinned">Not pinned<\/option>/);
    assert.equal(clear.disabled, true, "empty queries and all references need no reset");
    assert.equal(namespacesOnly.type, "checkbox");
    assert.equal(namespacesOnly.checked, false);
    namespacesOnly.onChange({ currentTarget: { checked: true } });
    query.onChange({ currentTarget: { value: "api" } });
    tag.onChange({ currentTarget: { value: "sha256:abc" } });
    pin.onChange({ currentTarget: { value: "pinned" } });
    assert.deepEqual([search.get(), tagOrPin.get(), pinning.get()], ["api", "sha256:abc", "pinned"]);
    render();
    const activeClear = ui.getTestRenderedProps().find(({ props }: { props: Record<string, unknown> }) => props.children === "Clear search").props;
    assert.equal(activeClear.disabled, false);
    activeClear.onClick();
    assert.deepEqual(calls, ["namespaces", "search", "tag", "pinning", "clear"]);
    assert.deepEqual([search.get(), tagOrPin.get(), pinning.get()], ["", "", "all"]);
    assert.equal(state.namespace.get(), "production");
    assert.equal(state.workloadID.get(), "workload-a");
    assert.equal(state.runningOnly.get(), true);
    assert.equal(multipleNamespacesOnly.get(), true, "clearing search does not clear the separate namespace-count filter");
  });

  await t.test("compact scope, filter chips and empty-result recovery operate the actual explorer state", async (subtest) => {
    const pod = {
      metadata: { uid: "api", name: "api-0", namespace: "production" },
      spec: { containers: [{ name: "app", image: "example/api:stable" }] },
      status: { containerStatuses: [{ name: "app", imageID: "runtime-api", state: { running: {} }, ready: true }] },
    };
    const watch = (values: readonly unknown[]) => ({
      isLive: () => true,
      subscribe: () => ({ value: Promise.resolve(computed(() => values)), claim() {}, dispose() {}, refresh() {} }),
    });
    const state = ui.createImagesState(() => watch([pod]));
    const dispose = autorun(() => state.view.get());
    subtest.after(dispose);
    await Promise.resolve();
    ui.setTestInjections(new Map([
      [ui.openImageLogsInjectable, () => async () => {}],
      [ui.imagesStateInjectable, state],
      [ui.imageActionsInjectable, { feedback: observable.box(""), copyFeedback: observable.box(undefined), copyID: async () => {}, openPod: async () => {} }],
      [ui.clusterHeadingInjectable, computed(() => "Synthetic cluster")],
      [ui.registryDetailsInjectable, ui.describeRegistry],
    ]));
    const render = () => {
      ui.resetTestRenderedProps();
      return renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    };
    const propsMatching = (predicate: (props: Record<string, any>) => boolean) => {
      const entry = ui.getTestRenderedProps().find(({ props }: { props: Record<string, any> }) => predicate(props));
      assert.ok(entry, "the expected interactive element was rendered");
      return entry.props;
    };
    const initial = render();
    assert.match(initial, /class="row row-scope" hidden=""/);
    const scopeToggle = propsMatching((props) => props.onClick === state.toggleScope);
    assert.equal(scopeToggle["aria-expanded"], false);
    assert.equal(scopeToggle["aria-controls"], "lie-cluster-a-scope");
    scopeToggle.onClick();
    const opened = render();
    assert.doesNotMatch(opened, /class="row row-scope" hidden=/);
    assert.equal(propsMatching((props) => props.onClick === state.toggleScope)["aria-expanded"], true);

    propsMatching((props) => props["aria-label"] === "Search images").onChange({ currentTarget: { value: "api-0" } });
    assert.match(render(), /class="img-match">Matched on pod<\/div>/, "a usage-only match explains why its image remains visible");
    propsMatching((props) => props["aria-label"] === "Search images").onChange({ currentTarget: { value: "example/api" } });
    assert.doesNotMatch(render(), /class="img-match"/, "a configured-reference match needs no usage-only label");
    propsMatching((props) => props["aria-label"] === "Search images").onChange({ currentTarget: { value: "api" } });
    propsMatching((props) => props["aria-label"] === "Search tag or pin").onChange({ currentTarget: { value: "missing-tag" } });
    const empty = render();
    assert.match(empty, /No image references match/);
    assert.match(empty, /Remove one filter to see results/);
    assert.match(empty, /class="relax-n">1 result<\/span>/);
    assert.match(empty, /aria-label="Remove filter: Search api"/);
    propsMatching((props) => props.className === "relax-btn").onClick();
    assert.equal(state.tagOrPin.get(), "");
    assert.equal(state.search.get(), "api", "relaxing one filter keeps the other active query");
    assert.equal(state.view.get().groups.length, 1);

    render();
    propsMatching((props) => props["aria-label"] === "Remove filter: Search api").onClick();
    assert.equal(state.search.get(), "");
    const hostileQuery = '<img src=x onerror="1"> & "quoted"';
    state.setSearch({ currentTarget: { value: hostileQuery } });
    const escapedChip = render();
    assert.ok(escapedChip.includes("&lt;img src=x onerror=&quot;1&quot;&gt; &amp; &quot;quoted&quot;"));
    assert.equal(propsMatching((props) => props.className === "chip-v").children, hostileQuery);

    state.selectNamespace({ currentTarget: { value: "production" } });
    state.setMultipleNamespacesOnly({ currentTarget: { checked: true } });
    await Promise.resolve();
    assert.match(render(), /cannot match while Namespace is set to a single namespace/);
    propsMatching((props) => props.onClick === state.resetAllFilters).onClick();
    assert.equal(state.search.get(), "");
    assert.equal(state.namespace.get(), "");
    assert.equal(state.multipleNamespacesOnly.get(), false);
    assert.equal(state.runningOnly.get(), true);
    await Promise.resolve();
    assert.match(render(), /Showing <b>1<\/b> of <b>1<\/b> image references/);
  });

  await t.test("unknown references and partially reported IDs stay explicit without inventing variants", async (subtest) => {
    const partialImage = "registry.example/team/api:stable";
    const missingImage = "registry.example/team/never-reported:stable";
    const pod = (name: string, image: string, imageID: string) => ({
      metadata: { uid: name, name, namespace: "demo" },
      spec: { containers: [{ name: "app", image }] },
      status: { containerStatuses: [{ name: "app", imageID, state: { running: {} }, ready: true }] },
    });
    const values = [pod("reported", partialImage, "runtime-known"), pod("missing-a", partialImage, ""),
      pod("missing-b", partialImage, ""), pod("unrecognized", "invalid image reference", "runtime-other"),
      pod("not-reported", missingImage, "")];
    const state = ui.createImagesState(() => ({
      isLive: () => true,
      subscribe: () => ({ value: Promise.resolve(computed(() => values)), claim() {}, dispose() {}, refresh() {} }),
    }));
    subtest.after(autorun(() => state.view.get()));
    await Promise.resolve();
    ui.setTestInjections(new Map([
      [ui.openImageLogsInjectable, () => async () => {}],
      [ui.imagesStateInjectable, state],
      [ui.imageActionsInjectable, { feedback: observable.box(""), copyFeedback: observable.box(undefined), copyID: async () => {}, openPod: async () => {} }],
      [ui.clusterHeadingInjectable, computed(() => "Synthetic cluster")], [ui.registryDetailsInjectable, ui.describeRegistry],
      [ui.nodeRuntimeDetailsInjectable, runtimeDetails],
    ]));
    const render = () => {
      ui.resetTestRenderedProps();
      return renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    };
    const collapsed = render();
    assert.match(collapsed, />Unrecognized image reference<\/span>/);
    assert.match(collapsed, />Registry unavailable<\/div>/);
    assert.match(collapsed, />Some IDs not reported<\/span>/);
    assert.match(collapsed, />Not reported<\/span>/);
    assert.doesNotMatch(collapsed, /different IDs<\/button>/, "unreported status is not another runtime image ID");
    const partial = state.view.get().groups.find((group: { requestedImage: string }) => group.requestedImage === partialImage);
    const missing = state.view.get().groups.find((group: { requestedImage: string }) => group.requestedImage === missingImage);
    state.toggleExpanded(partial.id);
    state.toggleExpanded(missing.id);
    const expanded = render();
    assert.match(expanded, />2 containers have no reported image ID\.<\/p>/);
    assert.match(expanded, /No container status reports an image ID\. The image may not have been pulled yet\./);
    const fullIDCopyButtons = ui.getTestRenderedProps().filter(({ props }: { props: Record<string, unknown> }) => props["aria-label"] === "Copy full runtime image ID");
    assert.equal(fullIDCopyButtons.length, 1, "only the one reported runtime ID gets an expanded copy button");
  });

  await t.test("namespace usage shows one or two names and uses a closed native disclosure for three or more", () => {
    const usages = [
      { namespace: "alpha", containerCount: 2 },
      { namespace: "beta", containerCount: 1 },
      { namespace: "gamma-long-namespace", containerCount: 4 },
    ];
    const render = (values: typeof usages) => renderToStaticMarkup(createElement(ui.NamespaceUsage, { usages: values }));
    const one = render(usages.slice(0, 1));
    assert.match(one, />alpha</);
    assert.doesNotMatch(one, /<details\b/);
    const two = render(usages.slice(0, 2));
    assert.match(two, /alpha/);
    assert.match(two, /beta/);
    assert.doesNotMatch(two, /<details\b/);
    const three = render(usages);
    const disclosure = three.match(/<details\b([^>]*)>([\s\S]*?)<\/details>/);
    assert.ok(disclosure, "three namespaces have a keyboard-operable native disclosure");
    assert.doesNotMatch(disclosure[1], /\bopen(?:\s|=|$)/);
    const summary = ui.NamespaceUsage({ usages }).props.children.find((child: { type?: unknown }) => child.type === "summary");
    assert.ok(summary, "the namespace disclosure has a native summary");
    assert.equal(visibleChildText(summary), "3 namespaces ");
    for (const usage of usages) {
      assert.ok(disclosure[2].includes(usage.namespace), "expanded details retain the complete namespace name");
      assert.ok(disclosure[2].includes(`${usage.containerCount} container${usage.containerCount === 1 ? "" : "s"}`));
    }
    const handlers: string[] = [];
    const walk = (element: { props?: Record<string, unknown> } | null) => {
      if (!element?.props) return;
      for (const [key, value] of Object.entries(element.props)) {
        if (/^\$?on[A-Z]/.test(key) && typeof value === "function") handlers.push(key);
      }
      const children = element.props.children;
      for (const child of Array.isArray(children) ? children : [children]) {
        if (child && typeof child === "object") walk(child as { props?: Record<string, unknown> });
      }
    };
    walk(ui.NamespaceUsage({ usages }));
    assert.deepEqual(handlers, [], "namespace expansion is native and has no handlers that change namespace scope");
  });

  await t.test("different configured pins stay separate and show distinct pins with full tooltip values", () => {
    const pinA = `sha256:${"a".repeat(64)}`;
    const pinB = `sha256:${"b".repeat(64)}`;
    const images = [`example/api:stable@${pinA}`, `example/api:stable@${pinB}`];
    const pods = ["alpha", "beta", "gamma"].map((namespace, index) => ({
      metadata: { uid: `pod-${index}`, name: `api-${index}`, namespace },
      spec: { containers: [{ name: "app", image: images[0] }] },
      status: { containerStatuses: [{ name: "app", imageID: "runtime-a", state: { running: {} }, ready: true }] },
    }));
    pods.push({ metadata: { uid: "pod-b", name: "api-b", namespace: "alpha" },
      spec: { containers: [{ name: "app", image: images[1] }] },
      status: { containerStatuses: [{ name: "app", imageID: "runtime-b", state: { running: {} }, ready: true }] } });
    const emptySize = { label: "Unavailable", matchedContainers: 0, totalContainers: 0 };
    const groups = ui.groupImages(ui.collectContainerImages(pods)).map((group: { variants: object[] }) => ({
      ...group, size: emptySize, summaryID: "runtime-ID", variants: group.variants.map((variant) => ({ ...variant, size: emptySize })),
    }));
    const noop = () => {};
    let scopeChanges = 0;
    const state = {
      view: computed(() => ({ status: "ready", sizeStatus: "unavailable", groups, imageCount: 2, containerCount: 4,
        namespaceCount: 3, multipleCount: 0, error: "", sizeError: "", namespaces: ["alpha", "beta", "gamma"],
        workloadStatus: "ready", workloadLabels: new Map(), matchFields: new Map(), workloads: [] })),
      search: observable.box(""), tagOrPin: observable.box(""), pinning: observable.box("all"),
      namespace: observable.box(""), namespaceDraft: observable.box(""), namespaceError: observable.box(""),
      runningOnly: observable.box(true), multipleOnly: observable.box(false), multipleNamespacesOnly: observable.box(false),
      workloadType: observable.box(""), workloadID: observable.box(""), expanded: observable.set<string>(),
      sort: observable.box("image"), descending: observable.box(false),
      refresh: noop, setSearch: noop, setTagOrPin: noop, selectPinning: noop, clearSearchFilters: noop,
      setNamespaceDraft: noop, applyNamespace: noop, setRunningOnly: noop, setMultipleOnly: noop, setMultipleNamespacesOnly: noop,
      selectNamespace: () => { scopeChanges += 1; }, selectWorkloadType: noop, selectWorkload: noop, sortBy: noop, toggleExpanded: noop,
    };
    const displayState = compactState(state);
    ui.setTestInjections(new Map([
      [ui.openImageLogsInjectable, () => async () => {}],
      [ui.imagesStateInjectable, displayState], [ui.imageActionsInjectable, { feedback: observable.box(""), copyFeedback: observable.box(undefined), copyID: async () => {} }],
      [ui.clusterHeadingInjectable, computed(() => "Production")], [ui.registryDetailsInjectable, ui.describeRegistry],
    ]));
    ui.resetTestRenderedProps();
    const markup = renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    assert.equal([...markup.matchAll(/class="ref-row"/g)].length, 2);
    const tagCells = ui.getTestRenderedProps()
      .filter(({ props }: { props: { className?: string } }) => props.className === "mono pin")
      .map(({ props }: { props: { children?: ReactNode } }) => visibleChildText(props.children));
    assert.equal(tagCells.length, 2);
    assert.ok(tagCells.some((text) => text.includes("sha256:a")));
    assert.ok(tagCells.some((text) => text.includes("sha256:b")));
    assert.ok(tagCells.every((text) => !text.includes("Digest pinned")));
    const tooltipProps = ui.getTestRenderedProps().map(({ props }: { props: { title?: string } }) => props.title);
    assert.ok(tooltipProps.some((value: unknown) => typeof value === "string" && value.includes(pinA)));
    assert.ok(tooltipProps.some((value: unknown) => typeof value === "string" && value.includes(pinB)));
    assert.match(markup, /aria-label="Show all 3 namespaces"/);
    const namespaceToggle = ui.getTestRenderedProps().find(({ props }: { props: { "aria-label"?: string } }) => props["aria-label"] === "Show all 3 namespaces").props;
    assert.equal(namespaceToggle["aria-expanded"], false);
    namespaceToggle.onClick();
    const expandedNamespaces = renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    assert.match(expandedNamespaces, /class="ns-list">alpha, beta, gamma<\/span>/);
    assert.equal(displayState.namespaceExpanded.has(groups[0].id), true);
    assert.equal(scopeChanges, 0);
    assert.equal(state.namespace.get(), "");
  });

  await t.test("native image tables preserve full IDs, registry context and node runtime in expanded rows", async () => {
    const image = "public.ecr.aws/example/api:v1";
    const imageID = `runtime-image-ID-${"x".repeat(256)}<img onerror="unsafe"> & 'quoted'`;
    const escapedImageID = `runtime-image-ID-${"x".repeat(256)}&lt;img onerror=&quot;unsafe&quot;&gt; &amp; &#x27;quoted&#x27;`;
    const pod = {
      metadata: { uid: "pod-a", name: "api-0", namespace: "production" },
      spec: { nodeName: "worker-a", containers: [{ name: "app", image }] },
      status: { containerStatuses: [{ name: "app", imageID, state: { running: {} }, ready: true }] },
    };
    const otherPod = { ...pod, metadata: { ...pod.metadata, uid: "pod-b", name: "api-1" }, spec: { ...pod.spec, nodeName: "worker-b" } };
    const unknownPod = { ...pod, metadata: { ...pod.metadata, uid: "pod-c", name: "api-2" }, spec: { ...pod.spec, nodeName: "worker-unknown" } };
    const containers = ui.collectContainerImages([pod, otherPod, unknownPod]);
    const emptySize = { label: "Unavailable", matchedContainers: 0, totalContainers: 3 };
    const group = { ...ui.groupImages(containers)[0], size: emptySize, summaryID: "runtime-image-ID",
      variants: ui.groupImages(containers)[0].variants.map((variant: object) => ({ ...variant, size: emptySize })) };
    const noop = () => {};
    const state = {
      view: computed(() => ({ status: "ready", sizeStatus: "unavailable", groups: [group], imageCount: 1, containerCount: 3,
        namespaceCount: 1, multipleCount: 0, error: "", sizeError: "", namespaces: ["production"],
        workloadStatus: "ready", workloadLabels: new Map(), matchFields: new Map(), workloads: [] })),
      search: observable.box(""), tagOrPin: observable.box(""), pinning: observable.box("all"),
      namespaceDraft: observable.box(""), namespaceError: observable.box(""), namespace: observable.box(""),
      runningOnly: observable.box(true), multipleOnly: observable.box(false), multipleNamespacesOnly: observable.box(false), workloadType: observable.box(""), workloadID: observable.box(""),
      expanded: observable.set<string>(), sort: observable.box("image"), descending: observable.box(false),
      refresh: noop, setSearch: noop, setTagOrPin: noop, selectPinning: noop, clearSearchFilters: noop,
      setNamespaceDraft: noop, applyNamespace: noop,
      setRunningOnly: noop, setMultipleOnly: noop, setMultipleNamespacesOnly: noop, selectNamespace: noop, selectWorkloadType: noop,
      selectWorkload: noop, toggleExpanded: noop, sortBy: noop,
    };
    const copied: string[] = [];
    const copyFeedback = observable.box<{ value: string; status: "copied" | "failed" } | undefined>(undefined, { deep: false });
    ui.setTestInjections(new Map([
      [ui.openImageLogsInjectable, () => async () => {}],
      [ui.imagesStateInjectable, compactState(state)],
      [ui.imageActionsInjectable, { feedback: observable.box(""), copyFeedback,
        copyID: async (value: string) => { copied.push(value); runInAction(() => copyFeedback.set({ value, status: "copied" })); }, openPod: async () => {} }],
      [ui.describePodImagesInjectable, () => (resource: typeof pod) => ui.collectContainerImages([resource], false)],
      [ui.clusterHeadingInjectable, computed(() => "Production")],
      [ui.registryDetailsInjectable, ui.describeRegistry],
      [ui.nodeRuntimeDetailsInjectable, runtimeDetails],
    ]));
    const collapsed = renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    assert.match(collapsed, /<table class="results" aria-label="Container images"/);
    assert.doesNotMatch(collapsed, /class="detail-row"/);
    assert.match(collapsed, />Public</);
    assert.ok(collapsed.includes(ui.describeRegistry(image).providerLabel));
    assert.ok(collapsed.includes(escapedImageID), "an unfamiliar long ID stays complete and escaped in the summary");
    ui.resetTestRenderedProps();
    runInAction(() => state.expanded.add(group.id));
    const expanded = renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    assert.equal([...expanded.matchAll(/>Public</g)].length, 2, "expanded usage repeats the requested image's registry context");
    assert.match(expanded, /<tr class="detail-row"[^>]*><td colSpan="6">/i);
    assert.match(expanded, /class="detail-label">Reference<\/span>/);
    assert.ok(expanded.includes(`aria-label="Full runtime image ID">${escapedImageID}</code>`), "expanded IDs keep the complete escaped text");
    assert.doesNotMatch(expanded, /<input\b[^>]*aria-label="Full runtime image ID"/i);
    assert.match(expanded, /<th scope="col">Node<\/th><th scope="col">Node runtime<\/th><th scope="col">State<\/th>/, "node runtime has its own usage column");
    const copyButton = ui.getTestRenderedProps().find(({ props }: { props: { "aria-label"?: string } }) => props["aria-label"] === "Copy full runtime image ID").props;
    assert.equal(copyButton.disabled, false);
    await copyButton.onClick();
    assert.deepEqual(copied, [imageID], "native table copy preserves the exact long raw ID, including markup-like characters");
    const copiedMarkup = renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    assert.equal([...copiedMarkup.matchAll(/>Copied<\/span>/g)].length, 2, "only the summary and expanded buttons for this same value report success");
    runInAction(() => copyFeedback.set({ value: "another runtime ID", status: "copied" }));
    const unrelatedCopy = renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    assert.doesNotMatch(unrelatedCopy, />Copied<\/span>/);
    runInAction(() => copyFeedback.set({ value: imageID, status: "failed" }));
    const failedCopy = renderToStaticMarkup(createElement(ui.ImagesView, { clusterId: "cluster-a" }));
    assert.equal([...failedCopy.matchAll(/>Copy failed<\/span>/g)].length, 2);
    assert.doesNotMatch(failedCopy, />Copied<\/span>/);
    assert.match(expanded, /class="lie-node-runtime lie-wrap">containerd 1\.7\.24<\/code>/);
    assert.match(expanded, /class="lie-node-runtime lie-wrap">cri-o 1\.30\.6<\/code>/);
    assert.match(expanded, /class="lie-node-runtime lie-wrap">Unavailable<\/code>/);
    assert.equal([...expanded.matchAll(/class="lie-node-runtime lie-wrap"/g)].length, 3, "each node's usage gets its own runtime lookup");
    const podDetails = renderToStaticMarkup(createElement(ui.PodImages, { resource: pod, clusterId: "cluster-a" }));
    assert.match(podDetails, /Requested image/);
    assert.match(podDetails, />Public</);
    assert.match(podDetails, /runtime-image-ID/);
    assert.match(podDetails, /data-lens-component="DrawerSubTitle"/);
    assert.equal([...podDetails.matchAll(/data-lens-component="DrawerItem"/g)].length, 4);
    assert.match(podDetails, /Node runtime/);
    assert.match(podDetails, /class="lie-node-runtime lie-wrap">containerd 1\.7\.24<\/code>/);
    const otherDetails = renderToStaticMarkup(createElement(ui.PodImages, { resource: otherPod, clusterId: "cluster-a" }));
    assert.match(otherDetails, /class="lie-node-runtime lie-wrap">cri-o 1\.30\.6<\/code>/);
    assert.doesNotMatch(otherDetails, /containerd 1\.7\.24/, "Pod details use their own assigned node");
    const unknownDetails = renderToStaticMarkup(createElement(ui.PodImages, { resource: unknownPod, clusterId: "cluster-a" }));
    assert.match(unknownDetails, /class="lie-node-runtime lie-wrap">Unavailable<\/code>/);
    assert.match(unknownDetails, /runtime-image-ID/, "missing node metadata does not hide the runtime image ID");
    for (const nodeName of ["worker-a", "worker-b", "worker-unknown"]) {
      assert.ok(runtimeCalls.some(([clusterId, node]) => clusterId === "cluster-a" && node === nodeName), "both instantiation parameters reach the runtime details injectable");
    }
  });

  await t.test("the Pod drawer preserves long references and IDs in native rows and handles missing images", () => {
    const image = `ghcr.io/example/${"long-repository-".repeat(12)}api:release`;
    const imageID = `docker-pullable://${image.split(":")[0]}@sha256:${"b".repeat(64)}`;
    const pod = {
      metadata: { uid: "long-pod", name: "api-0", namespace: "production" },
      spec: { containers: [{ name: "app", image }] },
      status: { containerStatuses: [{ name: "app", imageID, state: { running: {} }, ready: true }] },
    };
    ui.setTestInjections(new Map([
      [ui.openImageLogsInjectable, () => async () => {}],
      [ui.imageActionsInjectable, { feedback: observable.box(""), copyFeedback: observable.box(undefined), copyID: async () => {} }],
      [ui.describePodImagesInjectable, () => (resource: typeof pod) => ui.collectContainerImages([resource], false)],
      [ui.registryDetailsInjectable, ui.describeRegistry],
      [ui.nodeRuntimeDetailsInjectable, runtimeDetails],
    ]));
    const markup = renderToStaticMarkup(createElement(ui.PodImages, { resource: pod, clusterId: "cluster-a" }));
    assert.ok(markup.includes(`>${image}</code>`), "the wrapping requested-image block retains the complete reference");
    assert.ok(markup.includes(`>${imageID}</code>`), "the wrapping runtime-ID block retains the complete reported value");
    assert.match(markup, /class="lie-pod-requested-image lie-mono"/);
    assert.doesNotMatch(markup, /<input\b/, "Pod runtime IDs wrap as selectable text instead of scrolling inputs");
    assert.doesNotMatch(markup, /disabled=""/, "the full known runtime ID remains copyable");
    assert.match(markup, /class="lie-node-runtime lie-wrap">Unavailable<\/code>/, "an unscheduled Pod has no inferred node runtime");
    const empty = renderToStaticMarkup(createElement(ui.PodImages, { resource: {}, clusterId: "cluster-a" }));
    assert.match(empty, /data-lens-component="NoItemsDetailItem"/);
    assert.match(empty, /No container images reported\./);
  });
  await t.test("Logs view renders bounded rows, escaped messages, filters, coverage and details", async () => {
    const source = (value: unknown[]) => ({ isLive: () => true, subscribe: () => ({ value: Promise.resolve(computed(() => value)), claim() {}, dispose() {}, refresh() {} }) });
    const pods = source([{ metadata: { uid: "p", name: "api-0", namespace: "demo" }, spec: { containers: [{ name: "api", image: "example/api:1" }] }, status: { containerStatuses: [{ name: "api", state: { running: {} } }] } }]);
    const state = ui.createLogsState(async () => Array.from({ length: 130 }, (_, i) => `2026-10-30T08:00:00Z INFO <script>literal-${i}</script>\n`).join(""), () => pods, () => source([]));
    const release = autorun(() => state.view.get());
    try {
      await Promise.resolve(); await Promise.resolve();
      await state.refresh();
      ui.setTestInjections(new Map([[ui.logsStateInjectable, state], [ui.clusterHeadingInjectable, computed(() => "Example cluster")]]));
      let markup = renderToStaticMarkup(createElement(ui.LogsView, { clusterId: "cluster-a" }));
      assert.match(markup, /Logs Explorer/);
      assert.match(markup, /Search loaded logs/);
      assert.match(markup, /Loaded logs/);
      assert.match(markup, /1 \/ 1 readable containers/);
      assert.equal((markup.match(/class="lle-row lle-logrow/g) ?? []).length, 100);
      assert.doesNotMatch(markup, /<script>/);
      assert.match(markup, /&lt;script&gt;literal/);
      assert.match(markup, /Page 1 \/ 2/);
      state.select(state.snapshot.get().entries[0]);
      markup = renderToStaticMarkup(createElement(ui.LogsView, { clusterId: "cluster-a" }));
      assert.match(markup, /aria-label="Log entry details"/);
      assert.match(markup, /Copy raw message/);
      assert.match(markup, /Nearby loaded lines/);
      state.setFilter("text", "no-such-entry");
      markup = renderToStaticMarkup(createElement(ui.LogsView, { clusterId: "cluster-a" }));
      assert.match(markup, /No matching log entries/);
      assert.match(markup, /Clear all/);
    } finally { release(); }
  });

});
