import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { autorun, computed, observable, onBecomeObserved, onBecomeUnobserved, runInAction, type IComputedValue } from "mobx";
import { createClusterHeading } from "../src/cluster-heading.injectable";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

test("a pending cluster name immediately exposes a string fallback", () => {
  const name = deferred<IComputedValue<string>>();
  const heading = createClusterHeading(name.promise);

  assert.equal(heading.get(), "Kubernetes cluster");
  assert.equal(typeof heading.get(), "string", "React children must receive text while metadata loads");
  assert.equal((heading.get() as unknown as { then?: unknown }).then, undefined);
});

test("the heading resolves to the cluster name and follows reactive renames", async (t) => {
  const name = deferred<IComputedValue<string>>();
  const clusterName = observable.box("Production");
  const heading = createClusterHeading(name.promise);
  const seen: string[] = [];
  const dispose = autorun(() => { seen.push(heading.get()); });
  t.after(dispose);

  assert.deepEqual(seen, ["Kubernetes cluster"]);
  name.resolve(computed(() => clusterName.get()));
  await Promise.resolve();
  assert.equal(seen.at(-1), "Production");

  runInAction(() => clusterName.set("Production Europe"));
  assert.equal(seen.at(-1), "Production Europe");

  runInAction(() => clusterName.set(""));
  assert.equal(seen.at(-1), "Kubernetes cluster", "an unavailable name still leaves a usable heading");
});

test("metadata rejection retains a usable string heading", async () => {
  const name = deferred<IComputedValue<string>>();
  const heading = createClusterHeading(name.promise);

  name.reject(new Error("Cluster metadata unavailable"));
  await Promise.resolve();

  assert.equal(heading.get(), "Kubernetes cluster");
  assert.equal(typeof heading.get(), "string");
});

test("live metadata read failures use the fallback, recover reactively and release observation", async () => {
  const failed = observable.box(true);
  const clusterName = computed(() => {
    if (failed.get()) throw new Error("Cluster metadata unavailable");
    return "Production";
  });
  let activeObservers = 0;
  onBecomeObserved(clusterName, () => { activeObservers += 1; });
  onBecomeUnobserved(clusterName, () => { activeObservers -= 1; });
  const heading = createClusterHeading(Promise.resolve(clusterName));
  await Promise.resolve();
  assert.equal(heading.get(), "Kubernetes cluster");
  assert.equal(activeObservers, 0, "resolving metadata does not start a retained reaction");
  const seen: string[] = [];
  const dispose = autorun(() => { seen.push(heading.get()); });
  assert.equal(activeObservers, 1);
  runInAction(() => failed.set(false));
  assert.equal(seen.at(-1), "Production");
  runInAction(() => failed.set(true));
  assert.equal(seen.at(-1), "Kubernetes cluster");
  dispose();
  assert.equal(activeObservers, 0);
});

test("the actual ImagesView renders safely before and after async cluster metadata resolves", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "lens-images-heading-render-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "images-view.cjs");
  const source = (name: string) => JSON.stringify(resolve("src", name));

  await build({
    stdin: {
      contents: `
        export { ImagesView } from ${source("images-view.tsx")};
        export { imagesStateInjectable, imageActionsInjectable } from ${source("images-state.injectable.ts")};
        export { clusterHeadingInjectable } from ${source("cluster-heading.injectable.ts")};
        export { nodeRuntimeDetailsInjectable } from ${source("node-runtime.injectable.ts")};
        export { clusterNameInjectionToken, clusterNameReactiveInjectionToken } from "@k8slens/cluster-contracts";
        export { setTestInjections } from "@k8slens/use-inject";
      `,
      loader: "ts",
      resolveDir: process.cwd(),
    },
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    packages: "external",
    plugins: [{
      name: "test-lens-rendering-surfaces",
      setup(builder) {
        builder.onResolve({ filter: /^@k8slens\/(use-inject|element-components|input-components|icon)$/ }, (args) => ({
          path: args.path, namespace: "test-lens",
        }));
        builder.onLoad({ filter: /.*/, namespace: "test-lens" }, (args) => ({
          contents: args.path.endsWith("use-inject") ? `
            let injections = new Map();
            export const setTestInjections = (next) => { injections = next; };
            export const useSyncInject = (token, ...parameters) => {
              if (!injections.has(token)) throw new Error("Unexpected view injection");
              const value = injections.get(token);
              return typeof value === "function" ? value(...parameters) : value;
            };
          ` : `
            import { createElement } from "react";
            const element = (tag) => (props) => createElement(tag,
              Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith("$"))));
            export const Div = element("div"), Span = element("span"), Svg = element("svg"), H1 = element("h1"),
              Code = element("code"), Button = element("button"), Input = element("input"),
              TextInput = element("input"), PlainButton = element("button"),
              AwsIcon = element("svg"), AzureIcon = element("svg"), GitHubIcon = element("svg"), ContentCopyIcon = element("svg");
          `,
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    }],
  });

  const load = createRequire(resolve("package.json"));
  const view = load(output);
  const name = deferred<IComputedValue<string>>();
  const heading = createClusterHeading(name.promise);
  const noop = () => {};
  const state = {
    view: computed(() => ({ status: "loading", sizeStatus: "unavailable", groups: [], imageCount: 0,
      containerCount: 0, namespaceCount: 0, multipleCount: 0, error: "", sizeError: "",
      namespaces: ["production", "staging"], workloadStatus: "ready", workloadLabels: new Map(), matchFields: new Map(),
      workloads: [
        { id: "production/Deployment/api-uid", kind: "Deployment", name: "api", namespace: "production" },
        { id: "production/StatefulSet/database-uid", kind: "StatefulSet", name: "database", namespace: "production" },
      ],
    })),
    search: observable.box(""), tagOrPin: observable.box(""), pinning: observable.box("all"),
    namespaceDraft: observable.box(""), namespaceError: observable.box(""),
    namespace: observable.box(""), runningOnly: observable.box(true), multipleOnly: observable.box(false), multipleNamespacesOnly: observable.box(false),
    workloadType: observable.box(""), workloadID: observable.box(""),
    namespaceManual: observable.box(false), scopeOpen: observable.box(false), namespaceExpanded: observable.set<string>(),
    activeFilters: computed(() => []), scopeCount: computed(() => 0), showReset: computed(() => false), relaxedFilters: computed(() => []),
    expanded: observable.set<string>(), sort: observable.box("image"), descending: observable.box(false),
    toggleScope: noop, toggleNamespaces: noop, toggleMultipleOnly: noop, clearFilter: noop, resetAllFilters: noop, sortBy: noop,
    refresh: noop, setSearch: noop, setTagOrPin: noop, selectPinning: noop, clearSearchFilters: noop,
    setNamespaceDraft: noop, applyNamespace: noop,
    setRunningOnly: noop, setMultipleOnly: noop, setMultipleNamespacesOnly: noop, selectNamespace: noop, selectWorkloadType: noop, selectWorkload: noop,
  };
  view.setTestInjections(new Map([
    [view.imagesStateInjectable, state],
    [view.imageActionsInjectable, { feedback: observable.box(""), copyFeedback: observable.box(undefined) }],
    [view.clusterHeadingInjectable, heading],
    [view.nodeRuntimeDetailsInjectable, () => computed(() => ({ available: false, label: "Unavailable", runtime: "", version: "", reported: "", reason: "Node runtime is loading." }))],
    // These emulate the host's asynchronous contracts if the view regresses to using them directly.
    [view.clusterNameInjectionToken, Promise.resolve("Production")],
    [view.clusterNameReactiveInjectionToken, name.promise],
  ]));

  const pending = renderToStaticMarkup(createElement(view.ImagesView, { clusterId: "cluster-a" }));
  assert.match(pending, /class="lx-crumb"><span>Kubernetes cluster<\/span><span>\/<\/span><span>Workloads<\/span>/);
  assert.match(pending, /Image Explorer/);
  assert.match(pending, /aria-label="Namespace"/);
  assert.match(pending, /<option value="production">production<\/option>/);
  assert.match(pending, /<option value="staging">staging<\/option>/);
  assert.match(pending, /aria-label="Workload type"/);
  assert.match(pending, /<option value="Deployment">Deployment<\/option>/);
  assert.match(pending, /<option value="StatefulSet">StatefulSet<\/option>/);
  assert.match(pending, /aria-label="Workload"/);
  assert.match(pending, /api \(Deployment\) · production/);
  assert.match(pending, /database \(StatefulSet\) · production/);
  assert.match(pending, /<table class="results" aria-label="Container images" aria-busy="true">/);
  assert.doesNotMatch(pending, /\[object Promise\]/);

  name.resolve(computed(() => "Production"));
  await Promise.resolve();

  const ready = renderToStaticMarkup(createElement(view.ImagesView, { clusterId: "cluster-a" }));
  assert.match(ready, /class="lx-crumb"><span>Production<\/span><span>\/<\/span><span>Workloads<\/span>/);
});
