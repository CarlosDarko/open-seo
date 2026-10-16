// The look of a client report: one self-contained stylesheet (light and dark
// follow the reader's system, printing gives a clean A4). No external fonts or
// images, so the page never calls anything but its own address.
export const REPORT_CSS = `
:root{color-scheme:light dark;--bg:#f3f3f4;--card:#ffffff;--line:#e4e4e7;--text:#18181b;--muted:#6b6b76;--soft:#f6f6f7;--accent:#b3173a;--accent-soft:#fbe9ee;--good:#15803d;--good-soft:#e4f4ea;--bad:#b91c1c;--bad-soft:#fbe8e8;--warn:#a15c07;--warn-soft:#fdf1dc;--bar:#d4d4d8}
@media (prefers-color-scheme:dark){:root{--bg:#121214;--card:#1b1b1e;--line:#2c2c31;--text:#ececef;--muted:#9c9ca7;--soft:#232327;--accent:#ee5b7e;--accent-soft:#3a1a23;--good:#4ade80;--good-soft:#14301f;--bad:#f87171;--bad-soft:#3b1b1b;--warn:#fbbf24;--warn-soft:#37290c;--bar:#3f3f46}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:64px}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:16px;height:52px}
.brand{font-weight:800;letter-spacing:-.01em;white-space:nowrap}
.brand b{color:var(--accent)}
.nav{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;flex:1}
.nav::-webkit-scrollbar{display:none}
.nav a{padding:6px 11px;border-radius:999px;color:var(--muted);font-size:13px;font-weight:600;white-space:nowrap}
.nav a:hover,.nav a.on{background:var(--card);color:var(--text);text-decoration:none}
.printbtn{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.hero{padding:44px 0 18px}
.eyebrow{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
h1{margin:8px 0 6px;font-size:clamp(26px,4vw,38px);line-height:1.12;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:14px}
.sub b{color:var(--text)}
section{margin:22px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px}
.card+.card{margin-top:14px}
h2{margin:0 0 4px;font-size:20px;letter-spacing:-.01em}
.lead{margin:0 0 16px;color:var(--muted);font-size:14px}
h3{margin:0 0 10px;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.verdict{border-left:5px solid var(--bar);padding:16px 20px;border-radius:14px;background:var(--card);border-top:1px solid var(--line);border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.verdict.good{border-left-color:var(--good)}
.verdict.bad{border-left-color:var(--bad)}
.verdict.warn{border-left-color:var(--warn)}
.verdict p{margin:0;font-size:19px;font-weight:700;line-height:1.4;letter-spacing:-.01em}
.msg{margin-top:14px;padding:16px 20px;background:var(--accent-soft);border-radius:14px;white-space:pre-line}
.msg small{display:block;margin-top:8px;color:var(--muted);font-weight:700}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 16px 12px;overflow:hidden}
.kpi .l{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.kpi .v{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.2;margin:2px 0 4px;font-variant-numeric:tabular-nums}
.pill{display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums}
.pill.good{background:var(--good-soft);color:var(--good)}
.pill.bad{background:var(--bad-soft);color:var(--bad)}
.pill.warn{background:var(--warn-soft);color:var(--warn)}
.pill.flat{background:var(--soft);color:var(--muted)}
.pill.acc{background:var(--accent-soft);color:var(--accent)}
.kpi svg{display:block;width:100%;height:34px;margin-top:8px}
.points{margin:16px 0 0;padding:0;list-style:none;display:grid;gap:8px}
.points li{display:flex;gap:10px;align-items:flex-start}
.points li:before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:8px}
.first{margin-top:16px;display:flex;gap:12px;align-items:center;padding:14px 16px;background:var(--soft);border-radius:12px}
.first b{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.note{margin-top:16px;padding:12px 16px;border-radius:12px;background:var(--accent-soft);white-space:pre-line;font-size:14px}
.note b{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:2px}
.tabs{display:inline-flex;gap:4px;background:var(--soft);border-radius:10px;padding:4px;margin-bottom:12px}
.tabs button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:700;padding:6px 14px;border-radius:7px;cursor:pointer}
.tabs button.on{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.chartbox{position:relative}
#chart{width:100%;height:300px;display:block;touch-action:pan-y}
.tip{position:absolute;pointer-events:none;background:var(--text);color:var(--bg);border-radius:10px;padding:8px 12px;font-size:12.5px;line-height:1.45;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.25);transform:translate(-50%,-110%);opacity:0;transition:opacity .08s}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:12.5px;color:var(--muted)}
.legend i{display:inline-block;width:18px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle;background:var(--accent)}
.legend i.prev{background:repeating-linear-gradient(90deg,var(--muted) 0 4px,transparent 4px 7px)}
.legend i.upd{width:10px;height:10px;border-radius:50%;background:var(--warn)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.blist{display:grid;gap:10px}
.brow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;align-items:center}
.brow .n{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brow .d{font-weight:800;font-variant-numeric:tabular-nums;font-size:13.5px}
.brow .bar{grid-column:1/3;height:6px;border-radius:3px;background:var(--soft);overflow:hidden}
.brow .bar i{display:block;height:100%;border-radius:3px}
.up{color:var(--good)}
.down{color:var(--bad)}
.up-bg{background:var(--good)}
.down-bg{background:var(--bad)}
.band{display:grid;grid-template-columns:130px 1fr 110px;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
.band:last-child{border-bottom:0}
.band .bl{font-weight:700;font-size:14px}
.band .tracks{display:grid;gap:4px}
.band .tr{height:10px;border-radius:5px;background:var(--soft);overflow:hidden}
.band .tr i{display:block;height:100%;border-radius:5px;background:var(--accent)}
.band .tr.old i{background:var(--bar)}
.band .bn{text-align:right;font-variant-numeric:tabular-nums;font-size:13px}
.band .bn small{display:block;color:var(--muted)}
.seg{margin-bottom:20px}
.stack{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--soft);gap:2px}
.stack i{display:block;height:100%}
.slegend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:13px}
.slegend span b{font-variant-numeric:tabular-nums}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:800;text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
.r{text-align:right;font-variant-numeric:tabular-nums}
.path{color:var(--muted);font-size:12px;word-break:break-all}
.progress{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.pbar{flex:1;height:12px;border-radius:6px;background:var(--soft);overflow:hidden}
.pbar i{display:block;height:100%;background:var(--good);border-radius:6px;transition:width .3s}
.pnum{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.chips{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.chips button{border:1px solid var(--line);background:var(--card);color:var(--muted);border-radius:999px;font:inherit;font-size:12.5px;font-weight:700;padding:4px 12px;cursor:pointer}
.chips button.on{background:var(--text);color:var(--bg);border-color:var(--text)}
.tasks{display:grid;gap:10px}
.task{border:1px solid var(--line);border-radius:14px;background:var(--card);overflow:hidden}
.task.done{background:var(--soft)}
.task.done .tt{text-decoration:line-through;color:var(--muted)}
.task>.head{display:flex;gap:14px;align-items:flex-start;padding:14px 16px}
.task input[type=checkbox]{flex:none;width:22px;height:22px;margin-top:2px;accent-color:var(--good);cursor:pointer}
.task .tb{flex:1;min-width:0}
.task .tt{font-weight:700;font-size:15px;line-height:1.35}
.task .ts{color:var(--muted);font-size:13px;margin-top:2px}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
details{border-top:1px solid var(--line)}
details summary{cursor:pointer;padding:10px 16px;font-size:13px;font-weight:700;color:var(--accent);list-style:none}
details summary::-webkit-details-marker{display:none}
details summary:before{content:"+ "}
details[open] summary:before{content:"− "}
.dbody{padding:0 16px 16px;display:grid;gap:12px}
.dbody ul,.dbody ol{margin:0;padding-left:20px;display:grid;gap:5px;font-size:14px}
.dbody h4{margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.when{color:var(--muted);font-size:12px;margin-top:6px}
.upds{display:grid;gap:10px}
.upd{display:flex;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:12px}
.upd .dt{font-variant-numeric:tabular-nums;font-size:13px;color:var(--muted);min-width:150px}
.steps{margin:0;padding-left:22px;display:grid;gap:8px}
.foot{margin:34px 0 60px;color:var(--muted);font-size:12.5px;text-align:center}
.empty{color:var(--muted);font-size:14px;padding:6px 0}
@media (max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}.cols{grid-template-columns:1fr}.band{grid-template-columns:1fr}.band .bn{text-align:left}.wrap{padding:0 14px}.card{padding:16px}.upd{flex-direction:column;align-items:flex-start;gap:4px}.brand span{display:none}}
@media print{.top,.chips,.printbtn,.tabs{display:none!important}body{background:#fff;color:#000;font-size:12.5px}.card,.kpi,.task,.verdict{break-inside:avoid;border-color:#ccc}details{display:block}details>*{display:block!important}.hero{padding-top:0}section{margin:14px 0}#chart{height:240px}}
`;
