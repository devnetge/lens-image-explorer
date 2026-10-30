import { asStylesheet } from "@k8slens/stylesheet-contracts";

export const imageExplorerStyles = asStylesheet({
  id: "lens-image-explorer/images",
  css: `
    .lie-explorer { height: 100%; overflow: auto; box-sizing: border-box; }
    .lie-explorer h1 { margin: 0; }
    .lie-stat { display: flex; flex-direction: column; flex: 1 1 160px; border-radius: 8px; }
    .lie-search-controls { min-width: 0; max-width: 100%; }
    .lie-search-controls .lie-search-field { flex-grow: 2; }
    .lie-search { width: 100%; min-width: 0; box-sizing: border-box; }
    .lie-namespace-form { display: flex; align-items: center; gap: 8px; flex: 0 1 360px; }
    .lie-namespace-form input { flex: 1; min-width: 180px; }
    .lie-filter-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 210px; border-radius: 6px; }
    .lie-filter-field label { font-size: .9em; }
    .lie-select { width: 100%; min-width: 180px; padding: 8px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 4px; background: transparent; color: inherit; }
    .lie-select option { background: Canvas; color: CanvasText; }
    .lie-checkbox { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
    .lie-checkbox input { width: auto; }
    .lie-table-scroll { overflow-x: auto; flex-shrink: 0; }
    .lie-image-table { min-width: 1000px; }
    .lie-image-grid { display: grid; grid-template-columns: minmax(240px, 2.5fr) minmax(110px, 1fr) minmax(210px, 1.4fr) minmax(130px, 1fr) 100px minmax(130px, 1fr); align-items: center; gap: 16px; padding: 14px 16px; }
    .lie-image-group { border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent); }
    .lie-grid-heading { position: sticky; top: 0; z-index: 1; font-size: 0.92em; }
    .lie-text-button { appearance: none; border: 0; background: transparent; padding: 0; text-align: left; max-width: 100%; overflow-wrap: anywhere; }
    .lie-mono, .lie-tag { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-ligatures: none; }
    .lie-tag { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lie-count { font-variant-numeric: tabular-nums; }
    .lie-namespace-cell, .lie-namespace-names, .lie-namespace-disclosure { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .lie-namespace-names { display: flex; flex-direction: column; gap: 4px; }
    .lie-namespace-disclosure > summary { display: block; list-style: none; cursor: pointer; font-weight: 600; }
    .lie-namespace-disclosure > summary::-webkit-details-marker { display: none; }
    .lie-namespace-disclosure > summary:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; border-radius: 3px; }
    .lie-namespace-chevron { display: inline-block; }
    .lie-namespace-disclosure[open] .lie-namespace-chevron { transform: rotate(90deg); }
    .lie-namespace-disclosure:not([open]) > .lie-namespace-breakdown { display: none; }
    .lie-namespace-breakdown { position: static; display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .lie-namespace-usage-row { display: flex; flex-direction: column; gap: 2px; font-size: .9em; }
    .lie-usage-grid { display: grid; grid-template-columns: minmax(210px, 2fr) minmax(110px, 1fr) minmax(150px, 1.4fr) minmax(170px, 1.2fr) minmax(100px, 1fr); gap: 16px; align-items: start; overflow-wrap: anywhere; }
    .lie-node-runtime { display: block; min-width: 0; max-width: 100%; white-space: normal; }
    .lie-full-id { width: 100%; }
    .lie-wrap { overflow-wrap: anywhere; user-select: text; }
    .lie-pod-images, .lie-pod-container, .lie-pod-image-value { min-width: 0; max-width: 100%; }
    .lie-pod-container + .lie-pod-container { margin-top: 8px; }
    .lie-pod-container-title { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; row-gap: 2px; }
    .lie-pod-container-title > * { min-width: 0; overflow-wrap: anywhere; }
    .lie-pod-image-row { min-width: 0; max-width: 100%; }
    .lie-pod-image-row > * { min-width: 0; }
    .lie-pod-image-row > :last-child { max-width: 100%; }
    .lie-pod-image-value { width: 100%; }
    .lie-full-id, .lie-pod-runtime-id { display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: start; gap: 8px; min-width: 0; max-width: 100%; }
    .lie-runtime-id, .lie-pod-runtime-value { display: block; min-width: 0; max-width: 100%; box-sizing: border-box; border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; line-height: 1.45; user-select: text; }
    .lie-copy-id, .lie-pod-copy-id { align-self: start; white-space: nowrap; }
    .lie-pod-requested-image { display: block; min-width: 0; max-width: 100%; box-sizing: border-box; border-radius: 4px; white-space: normal; overflow-wrap: anywhere; word-break: break-word; line-height: 1.45; user-select: text; }
    .lie-registry-disclosure { min-width: 0; max-width: 100%; }
    .lie-registry-summary { display: block; list-style: none; cursor: pointer; font: inherit; font-size: .82em; }
    .lie-registry-summary::-webkit-details-marker { display: none; }
    .lie-registry-summary:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; border-radius: 3px; }
    .lie-registry-badges { display: inline-flex; max-width: 100%; }
    .lie-registry-chevron { flex-shrink: 0; }
    .lie-registry-disclosure[open] .lie-registry-chevron { transform: rotate(90deg); }
    .lie-registry-disclosure:not([open]) > .lie-registry-details { display: none; }
    .lie-registry-provider svg, .lie-visibility svg { flex-shrink: 0; }
    .lie-visibility { border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 999px; padding: 2px 6px; white-space: nowrap; }
    .lie-registry-details { position: static; box-sizing: border-box; max-width: 100%; margin-top: 8px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 6px; white-space: pre-line; overflow-wrap: anywhere; font-size: .9em; line-height: 1.5; }

    /* Exported explorer design, scoped to the Lens content pane. */
    .lie-explorer.lx {
      --lx-bg: #1e2124;
      --lx-surface: #25282c;
      --lx-surface-2: #2b2f34;
      --lx-surface-3: #343940;
      --lx-input-bg: #1a1d20;
      --lx-border: #3a3f46;
      --lx-border-strong: #4b525b;
      --lx-border-faint: #2d3136;
      --lx-text: #e6e9ec;
      --lx-text-2: #9ba4ae;
      --lx-text-3: #6e7782;
      --lx-accent: #4a9ede;
      --lx-accent-dim: rgba(74, 158, 222, 0.16);
      --lx-accent-text: #7ab8ea;
      --lx-ok: #5fb760;
      --lx-warn: #e2a93f;
      --lx-err: #e5534b;
      --lx-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --lx-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
      --lx-radius: 4px;
      font-family: var(--lx-font);
      font-size: 13px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }
    .lie-explorer, .lie-explorer *, .lie-explorer *::before, .lie-explorer *::after { box-sizing: border-box; }
    .lie-explorer [hidden]:not([hidden=until-found i]) { display: none !important; }
    .lie-explorer .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    /* ---------- Lens frame ---------- */
    .lie-explorer.lx {
      color-scheme: dark;
      width: 100%;
      margin: 0;
      background: var(--lx-bg);
      color: var(--lx-text);
      border: 0;
      border-radius: 0;
      padding: 14px 20px 24px;
      min-height: 0;
      container-type: inline-size;
      container-name: lx;
      display: flex; flex-direction: column; gap: 12px;
      position: relative;

    }
    .lie-explorer .lx-crumb { font-size: 11.5px; color: var(--lx-text-3); display: flex; gap: 6px; }
    .lie-explorer .lx-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 16px; flex-wrap: wrap; }
    .lie-explorer .lx-head-main { min-width: 0; }
    .lie-explorer .lx-title { font-size: 17px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; line-height: 1.25; }
    .lie-explorer .stats { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--lx-text-2); }
    .lie-explorer .stat b { color: var(--lx-text); font-weight: 600; font-variant-numeric: tabular-nums; margin-right: 4px; }
    .lie-explorer .stat-btn {
      font: inherit; color: inherit; background: none; border: 0; padding: 0 3px; margin: 0 -3px;
      border-radius: 3px; cursor: pointer; text-decoration: underline dotted var(--lx-text-3); text-underline-offset: 3px;
    }
    .lie-explorer .stat-btn:hover { color: var(--lx-text); text-decoration-color: var(--lx-text-2); }
    .lie-explorer .stat-btn.on, .lie-explorer .stat-btn.on b { color: var(--lx-accent-text); text-decoration-color: var(--lx-accent-text); }
    .lie-explorer .stat-btn:focus-visible { outline: 2px solid var(--lx-accent); outline-offset: 1px; }
    .lie-explorer .lx-head-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
    .lie-explorer .refreshed { font-size: 11.5px; color: var(--lx-text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* ---------- buttons ---------- */
    .lie-explorer .btn {
      display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px;
      font: inherit; font-size: 12.5px; color: var(--lx-text); background: var(--lx-surface-2);
      border: 1px solid var(--lx-border); border-radius: var(--lx-radius); cursor: pointer; white-space: nowrap;
    }
    .lie-explorer .btn:hover { background: var(--lx-surface-3); border-color: var(--lx-border-strong); }
    .lie-explorer .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .lie-explorer .btn:disabled:hover { background: var(--lx-surface-2); border-color: var(--lx-border); }
    .lie-explorer .btn-ico { display: inline-flex; color: var(--lx-text-2); }
    .lie-explorer .btn.is-loading .btn-ico svg { animation: lie-explorer-spin 1s linear infinite; }
    .lie-explorer .btn.scope-btn .chev { transition: transform 0.15s ease; }
    .lie-explorer .btn.scope-btn.open .chev { transform: rotate(90deg); }
    .lie-explorer .badge {
      min-width: 18px; height: 18px; padding: 0 5px; font-size: 11px; font-weight: 600; line-height: 18px;
      text-align: center; color: #fff; background: var(--lx-accent); border-radius: 9px;
    }
    .lie-explorer .btn-text {
      font: inherit; font-size: 12.5px; color: var(--lx-accent-text); background: none; border: 0;
      padding: 5px 7px; border-radius: 3px; cursor: pointer; white-space: nowrap;
    }
    .lie-explorer .btn-text:hover { background: var(--lx-accent-dim); }
    .lie-explorer .btn-text:disabled { color: var(--lx-text-3); cursor: not-allowed; background: none; }
    .lie-explorer .icon-btn {
      display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
      color: var(--lx-text-2); background: transparent; border: 1px solid transparent; border-radius: 3px;
      cursor: pointer; padding: 0;
    }
    .lie-explorer .icon-btn:hover { background: var(--lx-surface-3); color: var(--lx-text); }
    .lie-explorer .icon-btn.copied { color: var(--lx-ok); }
    .lie-explorer .copy-wrap { display: inline-flex; align-items: center; gap: 4px; }
    .lie-explorer .copied-tip { font-size: 11px; color: var(--lx-ok); white-space: nowrap; }
    .lie-explorer .link-btn { font: inherit; color: var(--lx-accent-text); background: none; border: 0; padding: 0 3px; margin: 0 -3px; border-radius: 3px; cursor: pointer; }
    .lie-explorer .link-btn:hover { text-decoration: underline; }
    .lie-explorer .btn:focus-visible, .lie-explorer .btn-text:focus-visible, .lie-explorer .icon-btn:focus-visible, .lie-explorer .link-btn:focus-visible, .lie-explorer .expander:focus-visible, .lie-explorer .chip-x:focus-visible, .lie-explorer .th-btn:focus-visible, .lie-explorer .relax-btn:focus-visible, .lie-explorer .check input:focus-visible {
      outline: 2px solid var(--lx-accent); outline-offset: 1px;
    }

    /* ---------- toolbar ---------- */
    .lie-explorer .toolbar {
      background: var(--lx-surface); border: 1px solid var(--lx-border-faint); border-radius: var(--lx-radius);
      padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px;
    }
    .lie-explorer .row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 12px; }
    .lie-explorer .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .lie-explorer .field-label { font-size: 11.5px; font-weight: 500; color: var(--lx-text-2); }
    .lie-explorer .field-hint { font-size: 11px; color: var(--lx-text-3); }
    .lie-explorer .f-search { flex: 1 1 380px; }
    .lie-explorer .f-tq { flex: 0 1 240px; min-width: 180px; }
    .lie-explorer .f-pinning { flex: 0 0 170px; }
    .lie-explorer .row-actions { display: flex; align-items: center; gap: 6px; height: 34px; margin-left: auto; }
    .lie-explorer .input {
      height: 30px; width: 100%; font: inherit; font-size: 13px; color: var(--lx-text);
      background: var(--lx-input-bg); border: 1px solid var(--lx-border); border-radius: var(--lx-radius); padding: 0 8px;
    }
    .lie-explorer .input.mono { font-family: var(--lx-mono); font-size: 12.5px; }
    .lie-explorer .input::placeholder { color: var(--lx-text-3); }
    .lie-explorer .input:hover { border-color: var(--lx-border-strong); }
    .lie-explorer .input:focus { outline: none; border-color: var(--lx-accent); box-shadow: 0 0 0 2px var(--lx-accent-dim); }
    .lie-explorer .input:disabled { opacity: 0.55; cursor: not-allowed; }
    .lie-explorer .search-wrap { position: relative; }
    .lie-explorer .search-wrap .input { height: 34px; padding-left: 30px; padding-right: 40px; font-size: 13.5px; }
    .lie-explorer .search-ico { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--lx-text-3); display: flex; pointer-events: none; }
    .lie-explorer .search-wrap .input:focus ~ .search-ico { color: var(--lx-accent-text); }
    .lie-explorer .search-tools { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; }
    .lie-explorer kbd.key {
      font: 11px var(--lx-mono); color: var(--lx-text-3); background: var(--lx-surface);
      border: 1px solid var(--lx-border); border-bottom-width: 2px; border-radius: 3px; padding: 0 5px; line-height: 16px;
    }
    .lie-explorer .select-wrap { position: relative; }
    .lie-explorer .select { appearance: none; -webkit-appearance: none; padding-right: 26px; cursor: pointer; }
    .lie-explorer .select:disabled { cursor: not-allowed; }
    .lie-explorer .select-caret { position: absolute; right: 8px; top: 50%; transform: translateY(-50%) rotate(90deg); color: var(--lx-text-3); display: flex; pointer-events: none; }
    .lie-explorer .hint { margin: 0; font-size: 11.5px; color: var(--lx-text-3); line-height: 1.45; }
    .lie-explorer .row-scope { padding-top: 10px; border-top: 1px solid var(--lx-border-faint); }
    .lie-explorer .f-ns { flex: 0 1 220px; min-width: 180px; }
    .lie-explorer .f-ns-manual { flex: 0 1 200px; min-width: 160px; }
    .lie-explorer .f-wtype { flex: 0 0 160px; }
    .lie-explorer .f-workload { flex: 1 1 240px; max-width: 360px; }
    .lie-explorer .f-toggles { flex: 1 1 auto; min-width: 0; }
    .lie-explorer .toggles { display: flex; flex-wrap: wrap; gap: 4px 14px; min-height: 30px; align-items: center; }
    .lie-explorer .check { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; cursor: pointer; white-space: nowrap; color: var(--lx-text); }
    .lie-explorer .check input { width: 14px; height: 14px; margin: 0; accent-color: var(--lx-accent); cursor: pointer; }

    /* ---------- results bar ---------- */
    .lie-explorer .results-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-height: 26px; font-size: 12.5px; color: var(--lx-text-2); }
    .lie-explorer .results-count b { color: var(--lx-text); font-weight: 600; font-variant-numeric: tabular-nums; }
    .lie-explorer .chips { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
    .lie-explorer .chip {
      display: inline-flex; align-items: center; height: 24px; padding-left: 8px; max-width: 100%;
      border: 1px solid var(--lx-border); background: var(--lx-surface-2); border-radius: 3px; font-size: 12px; color: var(--lx-text);
    }
    .lie-explorer .chip-k { color: var(--lx-text-2); white-space: nowrap; }
    .lie-explorer .chip-k.chip-only { color: var(--lx-text); }
    .lie-explorer .chip-v { margin-left: 5px; font-weight: 500; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lie-explorer .chip-x {
      display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; margin-left: 2px;
      color: var(--lx-text-2); background: none; border: 0; border-radius: 2px; cursor: pointer;
    }
    .lie-explorer .chip-x:hover { color: var(--lx-text); background: var(--lx-surface-3); }
    .lie-explorer .reset-btn { margin-left: auto; }

    /* ---------- results table ---------- */
    .lie-explorer .table-wrap {
      background: var(--lx-surface); border: 1px solid var(--lx-border-faint); border-radius: var(--lx-radius);
      overflow-x: auto; position: relative; container-type: inline-size; container-name: tw;
    }
    .lie-explorer .results { width: 100%; min-width: 1230px; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
    .lie-explorer .results > thead > tr > th {
      text-align: left; font-size: 11.5px; font-weight: 500; color: var(--lx-text-2); padding: 8px 12px;
      border-bottom: 1px solid var(--lx-border); background: var(--lx-surface); white-space: nowrap;
    }
    .lie-explorer .results > tbody > tr > td { padding: 9px 12px; border-bottom: 1px solid var(--lx-border-faint); vertical-align: top; font-size: 12.5px; }
    .lie-explorer .results > tbody > tr:last-child > td { border-bottom: 0; }
    .lie-explorer .ref-row:hover > td { background: var(--lx-surface-2); }
    .lie-explorer .ref-row.open > td { background: var(--lx-surface-2); }
    .lie-explorer .ref-row.open > td.col-image { box-shadow: inset 2px 0 0 var(--lx-accent); }
    .lie-explorer col.col-image { width: 400px; }
    .lie-explorer col.col-pin { width: 165px; }
    .lie-explorer col.col-rid { width: 205px; }
    .lie-explorer col.col-size { width: 140px; }
    .lie-explorer col.col-cnt { width: 90px; }
    .lie-explorer col.col-ns { width: 230px; }
    .lie-explorer th.col-image, .lie-explorer td.col-image {
      position: sticky; left: 0; z-index: 1; background: var(--lx-surface); border-right: 1px solid var(--lx-border-faint);
    }
    .lie-explorer .ref-row:hover > td.col-image, .lie-explorer .ref-row.open > td.col-image { background: var(--lx-surface-2); }
    .lie-explorer th.num, .lie-explorer td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .lie-explorer .th-btn {
      font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer;
      display: inline-flex; align-items: center; gap: 4px; border-radius: 3px;
    }
    .lie-explorer .th-btn:hover, .lie-explorer .th-btn.active { color: var(--lx-text); }
    .lie-explorer .sort-ico { display: inline-flex; opacity: 0; }
    .lie-explorer .th-btn:hover .sort-ico, .lie-explorer .th-btn.active .sort-ico, .lie-explorer .th-btn:focus-visible .sort-ico { opacity: 1; }

    .lie-explorer .img-cell { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
    .lie-explorer .expander {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
      color: var(--lx-text-2); background: none; border: 0; border-radius: 3px; cursor: pointer; padding: 0;
      transition: transform 0.15s ease, background-color 0.1s ease;
    }
    .lie-explorer .expander:hover { background: var(--lx-surface-3); color: var(--lx-text); }
    .lie-explorer .expander[aria-expanded="true"] { transform: rotate(90deg); }
    .lie-explorer .reg-mark {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 18px; margin-top: 1px;
      font: 600 9px/1 var(--lx-mono); letter-spacing: 0.03em; color: var(--lx-text-2);
      background: var(--lx-surface-3); border: 1px solid var(--lx-border); border-radius: 3px;
    }
    .lie-explorer .img-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .lie-explorer .img-name { font-weight: 600; color: var(--lx-text); overflow-wrap: anywhere; line-height: 1.35; min-width: 0; }
    .lie-explorer .img-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .lie-explorer .img-host { font: 11px/1.4 var(--lx-mono); color: var(--lx-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .lie-explorer .vis {
      flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; height: 16px; padding: 0 5px;
      font-size: 10.5px; font-weight: 500; color: var(--lx-text-2); border: 1px solid var(--lx-border); border-radius: 3px;
    }
    .lie-explorer .vis-unknown { border-style: dashed; }
    .lie-explorer .img-match { font-size: 11px; color: var(--lx-accent-text); }

    .lie-explorer .mono { font-family: var(--lx-mono); font-size: 12px; }
    .lie-explorer .pin { color: var(--lx-text); }
    .lie-explorer .sub { display: block; font-size: 11px; color: var(--lx-text-3); margin-top: 2px; }
    .lie-explorer .sub.warn { color: var(--lx-warn); }
    .lie-explorer .link-btn.sub { padding: 0; margin: 2px 0 0; }
    .lie-explorer .rid-line { display: flex; align-items: center; gap: 4px; min-height: 22px; }
    .lie-explorer .rid-line .icon-btn { opacity: 0; }
    .lie-explorer .ref-row:hover .rid-line .icon-btn, .lie-explorer .ref-row:focus-within .rid-line .icon-btn, .lie-explorer .rid-line .icon-btn:focus-visible, .lie-explorer .rid-line .icon-btn.copied { opacity: 1; }
    .lie-explorer .muted { color: var(--lx-text-3); }
    .lie-explorer .small { font-size: 12px; }
    .lie-explorer .warn-text { color: var(--lx-warn); }
    .lie-explorer .ns-list { overflow-wrap: anywhere; }
    .lie-explorer .ns-more { font-size: 12px; margin-left: 6px; }

    /* expanded row */
    .lie-explorer .detail-row > td {
      background: var(--lx-bg); padding: 12px 16px 14px 44px; border-bottom: 1px solid var(--lx-border-faint);
      box-shadow: inset 2px 0 0 var(--lx-accent);
    }
    .lie-explorer .detail { position: sticky; left: 44px; width: calc(100cqw - 62px); display: flex; flex-direction: column; gap: 14px; font-size: 12.5px; }
    .lie-explorer .detail-ref { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }
    .lie-explorer .detail-label { font-size: 11px; color: var(--lx-text-2); }
    .lie-explorer code.wrap { overflow-wrap: anywhere; word-break: break-all; color: var(--lx-text); }
    .lie-explorer .detail-h { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--lx-text); display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
    .lie-explorer .h-note { font-weight: 400; font-size: 11.5px; }
    .lie-explorer .count {
      display: inline-block; min-width: 18px; padding: 0 5px; font-size: 11px; font-weight: 600; line-height: 16px;
      text-align: center; color: var(--lx-text-2); background: var(--lx-surface-3); border-radius: 8px;
    }
    .lie-explorer .rid-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .lie-explorer .rid-item { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; }
    .lie-explorer .rid-item code { flex: 1 1 460px; min-width: 0; }
    .lie-explorer .rid-meta { font-size: 11.5px; color: var(--lx-text-2); white-space: nowrap; }
    .lie-explorer .note { margin: 6px 0 0; font-size: 11.5px; }
    .lie-explorer .usages-wrap { overflow-x: auto; }
    .lie-explorer .usages { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; }
    .lie-explorer .usages th { font-size: 11px; font-weight: 500; color: var(--lx-text-2); text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--lx-border); white-space: nowrap; }
    .lie-explorer .usages td { padding: 5px 8px; border-bottom: 1px solid var(--lx-border-faint); vertical-align: top; white-space: nowrap; }
    .lie-explorer .usages tr:last-child td { border-bottom: 0; }
    .lie-explorer .usages td.mono { white-space: nowrap; }
    .lie-explorer .state { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    .lie-explorer .state i { width: 7px; height: 7px; border-radius: 50%; background: var(--lx-text-3); }
    .lie-explorer .state-running i { background: var(--lx-ok); }
    .lie-explorer .state-waiting i { background: var(--lx-warn); }
    .lie-explorer .state-terminated i { background: var(--lx-text-3); }

    /* empty state */
    .lie-explorer .empty-row > td { padding: 0; }
    .lie-explorer .empty {
      position: sticky; left: 0; width: 100cqw; padding: 40px 24px 36px;
      display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px;
    }
    .lie-explorer .empty-title { font-size: 14px; font-weight: 600; color: var(--lx-text); }
    .lie-explorer .empty-text { margin: 0; max-width: 520px; color: var(--lx-text-2); line-height: 1.5; }
    .lie-explorer .empty-relax { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 4px; }
    .lie-explorer .empty-sub { font-size: 11.5px; color: var(--lx-text-2); }
    .lie-explorer .relax-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
    .lie-explorer .relax-btn {
      display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px 0 6px;
      font: inherit; font-size: 12px; color: var(--lx-text); background: var(--lx-surface-2);
      border: 1px solid var(--lx-border); border-radius: 3px; cursor: pointer;
    }
    .lie-explorer .relax-btn:hover { background: var(--lx-surface-3); border-color: var(--lx-accent); }
    .lie-explorer .relax-btn svg { color: var(--lx-text-2); }
    .lie-explorer .relax-n { color: var(--lx-text-2); }
    .lie-explorer .empty-actions { display: flex; gap: 8px; align-items: center; margin-top: 6px; }

    /* loading */
    .lie-explorer .sk { height: 10px; border-radius: 3px; background: var(--lx-surface-3); margin: 5px 0; animation: lie-explorer-pulse 1.2s ease-in-out infinite; }
    .lie-explorer .sk-l { width: 62%; }
    .lie-explorer .sk-s { width: 44%; opacity: 0.6; }
    .lie-explorer .sk-m { width: 70%; }
    .lie-explorer .sk-xs { width: 55%; margin-left: auto; }
    .lie-explorer .sk-xxs { width: 30%; margin-left: auto; }
    .lie-explorer .skeleton-row td.col-image { padding-left: 40px; }
    @keyframes lie-explorer-pulse { 50% { opacity: 0.4; } }
    @keyframes lie-explorer-spin { to { transform: rotate(360deg); } }

    /* ---------- narrower frame ---------- */
    @container lx (max-width: 1000px) {
      .lie-explorer .f-search { flex-basis: 100%; }
      .lie-explorer .f-tq { flex: 1 1 200px; }
      .lie-explorer .f-workload { max-width: none; }
    }

    @media (prefers-reduced-motion: reduce) {
      .lie-explorer.lx, .lie-explorer .expander, .lie-explorer .btn.scope-btn .chev { transition: none; }
      .lie-explorer .sk, .lie-explorer .btn.is-loading .btn-ico svg { animation: none; }
    }

    .lie-explorer .rid-line .mono { min-width: 0; overflow-wrap: anywhere; }
    .lie-explorer .mono.pin { overflow-wrap: anywhere; }
    .lie-explorer .copy-wrap { flex-shrink: 0; }
    .lie-explorer .table-wrap { flex-shrink: 0; }
    @container lx (max-width: 500px) {
      .lie-explorer .results > thead > tr > th.col-image,
      .lie-explorer .results > tbody > tr > td.col-image { position: static; }
    }
  `,
});
