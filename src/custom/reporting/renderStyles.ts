// The look of a client report: a single self-contained stylesheet in Carlos
// Ortega's brand (ink #1a1a1a, red #f11c41, soft greys). Editorial and sober:
// a dark cover, white sheets with hairlines, big numerals and almost no
// colour besides the brand red. Good and bad news are told with a small
// arrow and coloured text, never with tinted badges. No external fonts or
// images; printing gives a clean document.
export const REPORT_CSS = `
:root{--ink:#1a1a1a;--ink2:#34343a;--red:#f11c41;--red-d:#c9102f;--bg:#ececed;--sheet:#ffffff;--line:#dcdce0;--muted:#6a6a72;--soft:#f4f4f5;--up:#157a3c;--down:#c62828;--warn:#a05a00;--shadow:0 1px 2px rgba(20,20,25,.04),0 10px 30px rgba(20,20,25,.06)}
*{box-sizing:border-box;min-width:0}
html{scroll-behavior:smooth;scroll-padding-top:70px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;overflow-x:hidden;overflow-wrap:anywhere}
a{color:var(--red);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.js .rv{opacity:0;transform:translateY(18px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.js .rv.in{opacity:1;transform:none}
.js .rv.d1{transition-delay:.07s}.js .rv.d2{transition-delay:.14s}.js .rv.d3{transition-delay:.21s}
/* deltas: arrow and coloured text, no badges */
.dl{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.dl.up{color:var(--up)}.dl.down{color:var(--down)}.dl.flat{color:var(--muted);font-weight:600}
.hero .dl.up{color:#7ee2a0}.hero .dl.down{color:#ff9d9d}.hero .dl.flat{color:rgba(246,246,246,.6)}
/* nav */
.top{position:fixed;inset:0 0 auto 0;z-index:50;transition:background .3s,box-shadow .3s}
.top.solid{background:rgba(26,26,26,.92);backdrop-filter:blur(12px);box-shadow:0 1px 0 rgba(255,255,255,.08)}
.top .wrap{display:flex;align-items:center;gap:18px;height:62px}
.top .iso{flex:none}
.top .iso svg{height:30px;width:auto;display:block}
.nav{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;flex:1}
.nav::-webkit-scrollbar{display:none}
.nav a{flex:none;padding:7px 12px;border-radius:999px;color:rgba(255,255,255,.7);font-size:13px;font-weight:600;white-space:nowrap}
.nav a:hover{color:#fff;text-decoration:none}
.nav a.on{color:#fff;background:rgba(255,255,255,.14)}
.cta{flex:none;border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;border-radius:999px;padding:7px 15px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.cta:hover{background:rgba(255,255,255,.1)}
/* hero */
.hero{position:relative;background:var(--ink);color:#f6f6f6;overflow:hidden;padding:120px 0 0}
.hero:before{content:"";position:absolute;inset:-20% -10% auto auto;width:70%;height:140%;background:radial-gradient(closest-side,rgba(241,28,65,.5),rgba(241,28,65,0) 70%)}
.hero .bgchart{position:absolute;inset:auto 0 0 0;height:46%;width:100%;opacity:.45}
.hero .wrap{position:relative;z-index:2}
.logo{height:34px;margin-bottom:48px}
.logo svg{height:100%;width:auto;display:block}
.eyebrow{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(246,246,246,.75);border-bottom:2px solid var(--red);padding-bottom:6px}
.hero h1{margin:22px 0 14px;font-size:clamp(34px,6vw,66px);line-height:1.04;letter-spacing:-.035em;font-weight:800;max-width:900px}
.hero h1 em{font-style:normal;color:var(--red)}
.hero .sub{font-size:clamp(16px,2vw,20px);color:rgba(246,246,246,.82);max-width:780px;margin:0}
.hl{display:flex;flex-wrap:wrap;gap:6px 28px;margin:28px 0 0;padding:16px 0 0;border-top:1px solid rgba(255,255,255,.16);font-size:14.5px;color:rgba(246,246,246,.9);font-weight:600}
.hl span:before{content:"→";color:var(--red);margin-right:8px;font-weight:800}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:50px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.14);border-bottom:0;border-radius:18px 18px 0 0;overflow:hidden}
.kpi{background:rgba(26,26,26,.78);backdrop-filter:blur(8px);padding:26px 24px 22px}
.kpi .l{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(246,246,246,.6)}
.kpi .v{font-size:clamp(32px,4.4vw,52px);font-weight:800;letter-spacing:-.035em;line-height:1.1;margin:6px 0 6px;font-variant-numeric:tabular-nums}
.kpi .dl{font-size:13.5px}
/* sections */
section.s{padding-top:90px;padding-bottom:0}
.kick{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--red)}
h2{margin:10px 0 12px;font-size:clamp(26px,3.6vw,40px);line-height:1.1;letter-spacing:-.028em;font-weight:800;max-width:860px}
.lead{margin:0 0 36px;color:var(--muted);font-size:17px;max-width:760px}
.sheet{background:var(--sheet);border:1px solid var(--line);border-radius:18px;padding:30px;box-shadow:var(--shadow)}
.sheet+.sheet{margin-top:18px}
.grid{display:grid;gap:18px}
.g2{grid-template-columns:repeat(2,1fr)}
.g3{grid-template-columns:repeat(3,1fr)}
h3{margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.note{margin-top:22px;padding:18px 22px;border-radius:14px;background:var(--sheet);border:1px solid var(--line);white-space:pre-line;font-size:15.5px}
.note b{display:block;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:4px}
/* message */
.msg{display:grid;grid-template-columns:auto 1fr;gap:26px;align-items:start;background:var(--ink);color:#f6f6f6;border-radius:18px;padding:34px;box-shadow:var(--shadow)}
.msg .av{width:68px;height:68px;border-radius:50%;background:#2a2a2d;display:flex;align-items:center;justify-content:center}
.msg .av svg{height:32px;width:auto}
.msg p{margin:0;font-size:clamp(17px,2.2vw,21px);line-height:1.55;white-space:pre-line}
.msg small{display:block;margin-top:14px;font-weight:700;color:rgba(246,246,246,.6);letter-spacing:.04em}
/* findings */
.ins{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.fd{background:var(--sheet);border:1px solid var(--line);border-radius:18px;padding:28px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:12px}
.fd.big{grid-column:1/-1;padding:34px}
.fd .top2{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.fd .tone{font-weight:700;letter-spacing:.08em}
.fd .tone.good{color:var(--up)}.fd .tone.warn{color:var(--warn)}.fd .tone.bad{color:var(--down)}.fd .tone.info{color:var(--muted)}
.fd .t{font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-.018em}
.fd.big .t{font-size:30px;max-width:780px}
.fd .b{margin:0;color:var(--ink2);font-size:15.5px;max-width:780px}
.fd .st{display:flex;flex-wrap:wrap;gap:6px 0;margin-top:2px;font-size:14px}
.fd .st span{padding-right:16px;margin-right:16px;border-right:1px solid var(--line);color:var(--muted)}
.fd .st span:last-child{border-right:0;margin-right:0;padding-right:0}
.fd .st b{color:var(--ink);font-variant-numeric:tabular-nums;margin-left:4px}
.fd .up2{margin-top:auto;padding-top:14px;border-top:1px solid var(--line);font-size:14.5px;color:var(--ink2)}
.fd .up2 b{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:3px}
/* chart */
.chartbox{position:relative}
#chart{width:100%;height:340px;display:block;touch-action:pan-y}
.tabs{display:inline-flex;gap:4px;background:var(--soft);border-radius:10px;padding:4px;margin-bottom:14px}
.tabs button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:13.5px;font-weight:600;padding:7px 16px;border-radius:7px;cursor:pointer}
.tabs button.on{background:var(--ink);color:#fff}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:#f6f6f6;border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.5;white-space:nowrap;box-shadow:0 12px 32px rgba(0,0,0,.3);transform:translate(-50%,-112%);opacity:0;transition:opacity .08s}
.legend{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:14px;font-size:13px;color:var(--muted)}
.legend i{display:inline-block;width:20px;height:4px;border-radius:2px;margin-right:7px;vertical-align:middle;background:var(--red)}
.legend i.prev{background:repeating-linear-gradient(90deg,var(--muted) 0 5px,transparent 5px 9px);height:3px}
.legend i.sq{width:12px;height:12px;border-radius:3px}
.uimp{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:26px;padding-top:26px;border-top:1px solid var(--line)}
.ucard .un{font-weight:800;font-size:17px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ucard .un i{display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--uc)}
.ucard .ud{font-size:13px;color:var(--muted);margin:2px 0 12px}
.ucard .trio{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:12px;border:1px solid var(--line);border-radius:12px}
.ucard .trio div{padding:10px 14px;border-right:1px solid var(--line)}
.ucard .trio div:last-child{border-right:0}
.ucard .trio small{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.ucard .trio b{font-size:22px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.ucard p{margin:0;font-size:14.5px;color:var(--ink2)}
/* ranked bars */
.brow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;align-items:center;margin-bottom:16px}
.brow .n{font-size:14.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brow .d{font-weight:800;font-variant-numeric:tabular-nums}
.brow .bar{grid-column:1/3;height:6px;border-radius:3px;background:var(--soft);overflow:hidden}
.brow .bar i{display:block;height:100%;border-radius:3px;width:0;transition:width 1s cubic-bezier(.2,.7,.2,1)}
.in .brow .bar i{width:var(--w)}
.upc{color:var(--up)}.dnc{color:var(--down)}
.upb{background:var(--ink)}.dnb{background:var(--red)}
.why{grid-column:1/3;font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;gap:2px 14px}
.why span{overflow-wrap:anywhere}
.diverge{display:grid;gap:10px}
.dv{display:grid;grid-template-columns:minmax(0,150px) 1fr;gap:12px;align-items:center;font-size:14px}
.dv .lab{font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dv .track{position:relative;height:26px;background:var(--soft);border-radius:6px}
.dv .track:before{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--muted);opacity:.5}
.dv .fill{position:absolute;top:4px;bottom:4px;border-radius:4px;width:0;transition:width 1s cubic-bezier(.2,.7,.2,1)}
.in .dv .fill{width:var(--w)}
.dv .val{white-space:nowrap;position:absolute;top:50%;transform:translateY(-50%);font-weight:800;font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink)}
/* positioning */
.stk{display:flex;height:46px;border-radius:10px;overflow:hidden;gap:3px}
.stk div{height:100%;display:flex;align-items:center;padding:0 12px;color:#fff;font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;min-width:0}
.stl{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:12px;font-size:13px;color:var(--muted)}
.stl i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.bands{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:22px}
.bcard{background:var(--sheet);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:var(--shadow)}
.bcard .bk{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.bcard .bn{font-size:48px;font-weight:800;letter-spacing:-.04em;line-height:1.05;margin:8px 0 2px;font-variant-numeric:tabular-nums}
.bcard .bs{font-size:14px;color:var(--muted)}
.bcard .bd{font-size:14px;margin:10px 0 14px}
.bcard .pair{display:grid;gap:5px}
.bcard .pair div{height:8px;border-radius:4px;background:var(--soft);overflow:hidden}
.bcard .pair i{display:block;height:100%;width:0;border-radius:4px;transition:width 1.1s cubic-bezier(.2,.7,.2,1)}
.bcard.in .pair i{width:var(--w)}
.bcard .pair .now i{background:var(--red)}
.bcard .pair .old i{background:#b9b9c1}
.bcard .bm{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink2)}
.bcard .bm b{font-variant-numeric:tabular-nums}
.mvt{width:100%;border-collapse:collapse;font-size:14.5px}
.mvt td{padding:11px 0;border-top:1px solid var(--line)}
.mvt td:last-child{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
/* topics */
.topics{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}
.topic{background:var(--sheet);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
.topic .tn{font-size:18px;font-weight:800;letter-spacing:-.01em;line-height:1.2}
.topic .tk{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.topic .tk b{font-size:34px;font-weight:800;letter-spacing:-.035em;font-variant-numeric:tabular-nums}
.topic .tk span{color:var(--muted);font-size:14px}
.topic small{color:var(--muted);font-size:13px}
.topic .tq{margin:2px 0;padding:0;list-style:none;font-size:13.5px;color:var(--ink2);display:grid;gap:2px}
.topic .tq li:before{content:"·";margin-right:8px;color:var(--red);font-weight:800}
.meter{height:6px;border-radius:3px;background:var(--soft);overflow:hidden;margin-top:4px}
.meter i{display:block;height:100%;background:var(--ink);border-radius:3px;width:0;transition:width 1s}
.in .meter i{width:var(--w)}
/* audience */
.aud{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.arow{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px 14px;align-items:baseline;margin-bottom:14px}
.arow .an{font-weight:600;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arow .ap{font-weight:800;font-variant-numeric:tabular-nums}
.arow .dl-slot{font-size:13px;min-width:74px;text-align:right}
.arow .ab{grid-column:1/-1;height:6px;border-radius:3px;background:var(--soft);overflow:hidden}
.arow .ab i{display:block;height:100%;background:var(--ink);border-radius:3px;width:0;transition:width 1s}
.arow.first .ab i{background:var(--red)}
.in .arow .ab i{width:var(--w)}
/* week */
.wk{display:grid;gap:12px}
.wkr{display:grid;grid-template-columns:110px 1fr 56px;gap:14px;align-items:center;font-size:14.5px}
.wkr .wl{font-weight:600}
.wkr .wb{height:14px;border-radius:7px;background:var(--soft);overflow:hidden}
.wkr .wb i{display:block;height:100%;border-radius:7px;background:#b9b9c1;width:0;transition:width 1s}
.wkr.best .wb i{background:var(--red)}
.wkr.best .wl{color:var(--red);font-weight:800}
.in .wkr .wb i{width:var(--w)}
.wkr b{text-align:right;font-variant-numeric:tabular-nums}
/* opportunities */
.opp{padding:22px 0;border-top:1px solid var(--line)}
.opp:first-child{border-top:0;padding-top:4px}
.oh{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:16px;align-items:start}
.rk{width:40px;height:40px;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
.opp .q{font-weight:800;font-size:18px;letter-spacing:-.01em}
.opp .m{font-size:13.5px;color:var(--muted);margin-top:3px}
.opp .g{text-align:right;font-weight:800;font-size:26px;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1}
.opp .g small{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:4px}
.oai{margin:14px 0 0 60px;padding:16px 20px;background:var(--soft);border-radius:12px;font-size:14.5px;color:var(--ink2)}
.oai p{margin:0 0 8px}
.oai ul{margin:0;padding-left:18px;display:grid;gap:4px}
.oai b{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--red);display:block;margin-bottom:4px}
.ideas{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-top:22px;padding-top:22px;border-top:1px solid var(--line)}
.idea{border:1px solid var(--line);border-radius:14px;padding:18px 20px;background:var(--sheet)}
.idea b{display:block;font-size:16px;line-height:1.3;margin-bottom:6px}
.idea p{margin:0;font-size:14px;color:var(--ink2)}
/* diagnosis and titles */
.dg{display:grid;gap:18px}
.dgc{background:var(--sheet);border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:var(--shadow)}
.dgc .u{font-weight:800;font-size:18px}
.dgc .meta{font-size:13.5px;color:var(--muted);margin:4px 0 12px}
.dgc p{margin:0 0 14px;font-size:15.5px;color:var(--ink2)}
.fix{margin:0;padding:0;list-style:none;display:grid;gap:6px;font-size:14.5px}
.fix li{padding-left:22px;position:relative}
.fix li:before{content:"→";position:absolute;left:0;color:var(--red);font-weight:800}
.tid{display:grid;gap:18px}
.tic{background:var(--sheet);border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:var(--shadow)}
.tic .tq2{font-weight:800;font-size:18px}
.tic .cur{font-size:13px;color:var(--muted);margin:4px 0 12px}
.serp{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-top:10px}
.serp .su{font-size:12.5px;color:#188038}
.serp .st2{font-size:19px;line-height:1.3;color:#1a0dab;margin:2px 0}
.serp .sd{font-size:14px;color:#4d5156}
/* health */
.hlt{display:grid;grid-template-columns:auto 1fr;gap:36px;align-items:center}
.ring{position:relative;width:170px;height:170px}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:3.4}
.ring .ct{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring .ct b{font-size:38px;font-weight:800;letter-spacing:-.03em}
.ring .ct small{font-size:12px;font-weight:600;color:var(--muted)}
.hs{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0}
.hs div{padding:12px 18px;border-left:1px solid var(--line)}
.hs b{display:block;font-size:28px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hs small{color:var(--muted);font-size:13px}
/* queries table */
table.qt{width:100%;border-collapse:collapse;font-size:14.5px}
.qt th{font-size:11.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;text-align:left;padding:8px 10px;border-bottom:1px solid var(--ink)}
.qt td{padding:12px 10px;border-bottom:1px solid var(--line)}
.qt tr:last-child td{border-bottom:0}
.qt .r{text-align:right;font-variant-numeric:tabular-nums}
/* updates */
.tl{display:grid;gap:12px}
.upd{display:flex;gap:16px;align-items:center;padding:16px 20px;border:1px solid var(--line);border-radius:14px;background:var(--sheet)}
.upd .sw{width:12px;height:12px;border-radius:3px;flex:none}
.upd .dt{font-variant-numeric:tabular-nums;font-size:13.5px;color:var(--muted);min-width:170px}
/* closing */
.end{background:var(--ink);color:#f6f6f6;margin-top:90px;padding:90px 0 0;position:relative;overflow:hidden}
.end:before{content:"";position:absolute;inset:-40% -10% auto auto;width:60%;height:120%;background:radial-gradient(closest-side,rgba(241,28,65,.35),rgba(241,28,65,0) 70%)}
.end .wrap{position:relative}
.end h2{color:#fff}
.steps{margin:0;padding:0;list-style:none;display:grid;gap:0;counter-reset:s;max-width:820px}
.steps li{counter-increment:s;display:flex;gap:20px;align-items:baseline;padding:18px 0;border-top:1px solid rgba(255,255,255,.16);font-size:18px}
.steps li:before{content:counter(s,decimal-leading-zero);flex:none;color:var(--red);font-weight:800;font-variant-numeric:tabular-nums}
.big-cta{display:inline-block;margin-top:34px;background:var(--red);color:#fff;border-radius:999px;padding:14px 30px;font-weight:700;font-size:16px}
.big-cta:hover{background:var(--red-d);text-decoration:none}
.foot{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;margin-top:70px;padding:28px 0 36px;border-top:1px solid rgba(255,255,255,.14);color:rgba(246,246,246,.6);font-size:13px}
.fm svg{height:28px;width:auto;display:block}
.empty{color:var(--muted)}
/* back to top */
.totop{position:fixed;right:22px;bottom:22px;z-index:60;width:46px;height:46px;border-radius:50%;border:0;background:var(--ink);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transform:translateY(10px);transition:opacity .25s,transform .25s,background .2s}
.totop.show{opacity:1;pointer-events:auto;transform:none}
.totop:hover{background:var(--red)}
.totop svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.ins,.aud,.g2,.g3{grid-template-columns:1fr}.bands{grid-template-columns:repeat(2,1fr)}.msg{grid-template-columns:1fr}.hlt{grid-template-columns:1fr}.dv{grid-template-columns:minmax(0,100px) 1fr}.cta{display:none}.oai{margin-left:0}.hs div{border-left:0;border-top:1px solid var(--line)}}
@media (max-width:560px){.wrap{padding:0 16px}.hero{padding-top:96px}.kpi{padding:18px 16px}.sheet,.fd{padding:20px}.fd.big{padding:22px}.fd .t,.fd.big .t{font-size:21px}section.s{padding-top:64px}.upd{flex-direction:column;align-items:flex-start;gap:4px}.oh{grid-template-columns:36px minmax(0,1fr)}.opp .g{grid-column:2;text-align:left}.wkr{grid-template-columns:92px 1fr 48px}.bands{grid-template-columns:1fr}.totop{right:14px;bottom:14px}}
@media print{.top,.tabs,.cta,.big-cta,.totop{display:none!important}body{background:#fff}.js .rv{opacity:1!important;transform:none!important}.hero,.end,.msg{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet,.fd,.kpi,.topic,.ucard,.upd,.bcard,.dgc,.tic{break-inside:avoid;box-shadow:none}.hero{padding-top:30px}.brow .bar i,.bcard .pair i,.dv .fill,.meter i,.arow .ab i,.wkr .wb i{transition:none;width:var(--w)}section.s{padding-top:36px}}
`;
