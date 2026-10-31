import { asStylesheet } from "@k8slens/stylesheet-contracts";
export const logsExplorerStyles = asStylesheet({ id: "lens-image-explorer/logs", css: `
.lle { --ll-border:color-mix(in srgb,currentColor 16%,transparent); --ll-muted:color-mix(in srgb,currentColor 60%,transparent); --ll-accent:#a78bfa; display:flex; flex-direction:column; height:100%; min-height:0; font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; overflow:hidden; }
.lle *, .lle *:before, .lle *:after { box-sizing:border-box; }
.lle button,.lle input,.lle select { font:inherit; color:inherit; }
.lle button,.lle select { border:1px solid var(--ll-border); border-radius:4px; background:color-mix(in srgb,currentColor 4%,transparent); padding:4px 9px; cursor:pointer; }
.lle button:hover,.lle summary:hover { background:color-mix(in srgb,currentColor 8%,transparent); }
.lle .lle-load-primary { background:#218547; border-color:#279b53; color:#fff; font-weight:600; box-shadow:0 1px 3px #0003; }
.lle .lle-load-primary:hover:not(:disabled) { background:#196c39; border-color:#238847; }
.lle .lle-load-primary:focus-visible { outline:2px solid #73e49a; outline-offset:3px; }
.lle .lle-load-cta { font-size:14px; padding:10px 22px; margin:10px 0 4px; border-radius:6px; }
.lle button:disabled { opacity:.45; cursor:default; }
.lle :focus-visible { outline:2px solid var(--ll-accent); outline-offset:-2px; }
.lle select { max-width:270px; min-width:100px; height:28px; }
.lle option { background:Canvas; color:CanvasText; }
.lle-header { padding:10px 16px; border-bottom:1px solid var(--ll-border); }
.lle-crumb { font-size:11px; color:var(--ll-muted); margin-bottom:7px; }
.lle-headline { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.lle h1 { margin:0; font-size:16px; font-weight:600; }
.lle-mode { color:var(--ll-muted); font-size:11px; }
.lle-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-left:auto; }
.lle-actions label { display:flex; gap:6px; align-items:center; }
.lle [aria-pressed=true],.lle .active { border-color:var(--ll-accent); color:var(--ll-accent); background:color-mix(in srgb,var(--ll-accent) 13%,transparent); }
.lle-scope { margin-top:10px; display:flex; gap:12px; align-items:end; flex-wrap:wrap; }
.lle-scope label { display:flex; flex-direction:column; gap:3px; color:var(--ll-muted); font-size:11px; }
.lle-scope select { color:inherit; max-width:280px; }
.lle-muted { color:var(--ll-muted); font-size:11px; }
.lle-searchbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:8px 16px; border-bottom:1px solid var(--ll-border); }
.lle-search { flex:1 1 260px; min-width:180px; border:1px solid var(--ll-border); border-radius:4px; background:transparent; height:32px; padding:0 10px; font-family:ui-monospace,monospace!important; }
.lle .lle-link { color:var(--ll-accent); border:0; background:transparent; }
.lle-chips { display:flex; flex-wrap:wrap; gap:5px; flex-basis:100%; }
.lle-chips button { border-color:var(--ll-accent); max-width:350px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; font-size:11px; }
.lle-body { flex:1; display:flex; min-height:0; }
.lle-facets { flex:0 0 220px; width:220px; border-right:1px solid var(--ll-border); overflow:auto; padding:6px 0; }
.lle-facets details { border-bottom:1px solid var(--ll-border); padding:5px 10px; }
.lle-facets summary { cursor:pointer; font-weight:600; padding:5px 0; }
.lle-facets button { display:flex; align-items:center; justify-content:space-between; width:100%; border:0; text-align:left; padding:4px; gap:8px; }
.lle-facets button span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lle-facets small { color:var(--ll-muted); }
.lle-facets p { padding:0 10px; }
.lle-main { flex:1; min-width:0; display:flex; flex-direction:column; min-height:0; }
.lle-banner { border-bottom:1px solid var(--ll-border); border-left:3px solid #e6b450; background:color-mix(in srgb,#e6b450 8%,transparent); padding:9px 14px; font-size:11px; }
.lle-banner button { margin-left:12px; }
.lle-notice { padding:6px 14px; color:var(--ll-accent); }
.lle-timeline { padding:10px 16px 6px; border-bottom:1px solid var(--ll-border); }
.lle-timeline>div:first-child { display:flex; justify-content:space-between; gap:10px; }
.lle-bars { display:flex; align-items:end; gap:3px; height:65px; margin-top:8px; }
.lle-bars button { height:100%; flex:1; border:0; background:transparent; padding:0; display:flex; align-items:end; min-width:0; }
.lle-bars i { position:relative; width:100%; background:#7197b9; display:block; min-height:2px; }
.lle-bars em { position:absolute; bottom:0; width:100%; background:#ef6f67; left:0; }
.lle-timeline-foot { display:flex; justify-content:space-between; color:var(--ll-muted); font:10px ui-monospace,monospace; margin-top:4px; }
.lle-results { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 14px; border-bottom:1px solid var(--ll-border); flex-wrap:wrap; }
.lle-results>div { display:flex; align-items:center; gap:6px; }
.lle-columns,.lle-coverage { position:relative; }
.lle summary { cursor:pointer; }
.lle-coverage>summary { border:1px solid var(--ll-border); border-radius:20px; padding:4px 10px; }
.lle-popover { position:absolute; top:calc(100% + 6px); left:0; width:360px; max-width:70vw; max-height:350px; overflow:auto; background:Canvas; color:CanvasText; border:1px solid var(--ll-border); border-radius:6px; padding:12px; box-shadow:0 8px 25px #0004; z-index:10; }
.lle-columns .lle-popover { right:0; left:auto; width:180px; }
.lle-popover label { display:block; padding:5px; }
.lle-popover ul { padding:0; list-style:none; }
.lle-popover li { padding:6px 0; border-bottom:1px solid var(--ll-border); }
.lle-popover li span { display:block; overflow-wrap:anywhere; }
.lle-popover p { font-size:11px; }
.lle-logscroll { flex:1; min-height:0; overflow:auto; }
.lle-row { display:grid!important; grid-template-columns:var(--log-columns); gap:12px; min-width:1000px; width:100%; align-items:center; padding:7px 14px!important; }
.lle-tablehead { position:sticky; top:0; z-index:1; background:Canvas; color:CanvasText; font-size:11px; border-bottom:1px solid var(--ll-border); }
.lle .lle-logrow { text-align:left; border:0; border-bottom:1px solid var(--ll-border); border-radius:0; background:transparent; }
.lle-row>span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.lle-row small { display:block; color:var(--ll-muted); font-size:10px; }
.lle-mono,.lle-message { font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:11px; }
.lle-row .lle-message { max-width:100%; }
.lle-row.wrap .lle-message { white-space:pre-wrap; overflow-wrap:anywhere; }
.lle .lle-logrow.selected { background:color-mix(in srgb,var(--ll-accent) 13%,transparent); box-shadow:inset 3px 0 var(--ll-accent); }
.lle-severity { text-transform:uppercase; font:10px ui-monospace,monospace; display:inline-block; }
.lle-severity.error { color:#ef6f67; }.lle-severity.warn { color:#d7a539; }.lle-severity.info { color:#609fdb; }.lle-severity.debug,.lle-severity.unknown { color:var(--ll-muted); }
.lle-empty { max-width:620px; text-align:center; padding:65px 24px; margin:auto; color:var(--ll-muted); }
.lle-empty h2 { font-size:15px; color:inherit; }
.lle-footer { display:flex; justify-content:space-between; align-items:center; padding:7px 14px; border-top:1px solid var(--ll-border); gap:10px; color:var(--ll-muted); font-size:11px; flex-wrap:wrap; }
.lle-footer>div { display:flex; align-items:center; gap:10px; }
.lle-drawer { width:390px; flex:0 0 390px; max-width:45%; border-left:1px solid var(--ll-border); display:flex; flex-direction:column; min-width:0; }
.lle-drawerhead { padding:10px 14px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--ll-border); }
.lle-drawerbody { overflow:auto; padding:14px; }
.lle-drawer pre { font:11px/1.6 ui-monospace,monospace; white-space:pre-wrap; overflow-wrap:anywhere; padding:10px; background:color-mix(in srgb,currentColor 4%,transparent); border:1px solid var(--ll-border); border-radius:4px; }
.lle-drawer h3 { font-size:12px; margin:20px 0 6px; }
.lle-drawer dt { color:var(--ll-muted); font-size:11px; margin-top:7px; }
.lle-drawer dd { margin:0; overflow-wrap:anywhere; }
.lle-drawer dd button { max-width:100%; text-align:left; overflow-wrap:anywhere; color:var(--ll-accent); background:transparent; border:0; padding:3px 0; }
.lle .lle-context { display:block; width:100%; border:0; border-bottom:1px solid var(--ll-border); text-align:left; font:10px/1.5 ui-monospace,monospace; overflow-wrap:anywhere; padding:7px 0; }
@media(max-width:1000px) { .lle-facets { flex-basis:170px; width:170px; }.lle-drawer { position:absolute; right:0; top:0; bottom:0; max-width:85%; background:Canvas; color:CanvasText; z-index:5; }.lle { position:relative; } }
` });
