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
  `,
});
