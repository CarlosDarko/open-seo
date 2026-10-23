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
@media screen and (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.ins,.aud,.g2,.g3{grid-template-columns:1fr}.bands{grid-template-columns:repeat(2,1fr)}.msg{grid-template-columns:1fr}.hlt{grid-template-columns:1fr}.dv{grid-template-columns:minmax(0,100px) 1fr}.cta{display:none}.oai{margin-left:0}.hs div{border-left:0;border-top:1px solid var(--line)}}
@media screen and (max-width:560px){.wrap{padding:0 16px}.hero{padding-top:96px}.kpi{padding:18px 16px}.sheet,.fd{padding:20px}.fd.big{padding:22px}.fd .t,.fd.big .t{font-size:21px}section.s{padding-top:64px}.upd{flex-direction:column;align-items:flex-start;gap:4px}.oh{grid-template-columns:36px minmax(0,1fr)}.opp .g{grid-column:2;text-align:left}.wkr{grid-template-columns:92px 1fr 48px}.bands{grid-template-columns:1fr}.totop{right:14px;bottom:14px}}
@media print{.top,.tabs,.cta,.big-cta,.totop{display:none!important}body{background:#fff}.js .rv{opacity:1!important;transform:none!important}.hero,.end,.msg{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet,.fd,.kpi,.topic,.ucard,.upd,.bcard,.dgc,.tic{break-inside:avoid;box-shadow:none}.hero{padding-top:30px}.brow .bar i,.bcard .pair i,.dv .fill,.meter i,.arow .ab i,.wkr .wb i{transition:none;width:var(--w)}section.s{padding-top:36px}}
/* ---- v4: summary, tabs, columns, lists ---- */
.top .ttl{flex:1;color:rgba(255,255,255,.78);font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero{padding-top:104px}
.logo{margin-bottom:34px}
.hero h1{font-size:clamp(30px,5vw,54px);margin:18px 0 10px}
.hero .sub{font-size:15.5px;color:rgba(246,246,246,.72)}
.kpis{margin-top:34px}
.tone{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.tone.good{color:var(--up)}.tone.warn{color:var(--warn)}.tone.bad{color:var(--down)}.tone.info{color:var(--muted)}
section#resumen{padding-top:54px}
.ex{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:30px;align-items:start}
.ex.solo{grid-template-columns:1fr}
.exh{font-size:clamp(22px,2.7vw,31px);line-height:1.25;font-weight:800;letter-spacing:-.02em;margin:10px 0 16px;max-width:760px}
.exp{margin:0 0 22px;font-size:16.5px;color:var(--ink2);max-width:760px}
.exp b{display:block;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:3px}
.keys{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.keys li{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:14px;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--line)}
.keys .kt{font-weight:600;font-size:15.5px}
.go{font-size:13px;font-weight:700;white-space:nowrap}
.msgc{background:var(--ink);color:#f6f6f6;border-radius:18px;padding:30px;box-shadow:var(--shadow)}
.msgc .av{width:56px;height:56px;border-radius:50%;background:#2a2a2d;display:flex;align-items:center;justify-content:center;margin-bottom:16px}
.msgc .av svg{height:26px;width:auto}
.msgc p{margin:0;font-size:16.5px;line-height:1.6;white-space:pre-line}
.msgc small{display:block;margin-top:14px;font-weight:700;color:rgba(246,246,246,.6);letter-spacing:.04em}
.tabsbar{position:sticky;top:62px;z-index:40;background:rgba(236,236,237,.95);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);border-top:1px solid var(--line);margin-top:54px}
.tabs2{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none}
.tabs2::-webkit-scrollbar{display:none}
.tabs2 button{flex:none;border:0;background:transparent;padding:16px 18px 13px;font:inherit;font-size:14.5px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:3px solid transparent}
.tabs2 button:hover{color:var(--ink)}
.tabs2 button.on{color:var(--ink);border-bottom-color:var(--red)}
.panels{padding-top:34px;padding-bottom:30px}
.js .panel{display:none}.js .panel.on{display:block}
.ptitle{display:none}
.blk{margin-bottom:38px}
.bh h2{font-size:clamp(21px,2.5vw,29px);margin:0 0 6px}
.bh .lead{margin:0 0 20px;font-size:15.5px}
.cols2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px;align-items:start}
.cols2>.blk{margin-bottom:0}
.stg .subtabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px;padding:4px;background:var(--soft);border-radius:10px;width:fit-content;max-width:100%}
.subtabs button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:13.5px;font-weight:600;padding:7px 14px;border-radius:7px;cursor:pointer}
.subtabs button small{font-weight:700;opacity:.7;margin-left:4px}
.subtabs button.on{background:var(--ink);color:#fff}
.js .sp{display:none}.js .sp.on{display:block}
.tbox{max-height:380px;overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
.qt.sm{font-size:14px}
.qt.sm th{position:sticky;top:0;background:#fff;z-index:1;padding:10px 12px}
.qt.sm td{padding:9px 12px;vertical-align:top}
.qt .r{white-space:nowrap}
.lk{color:var(--ink);font-weight:600;border-bottom:1px solid rgba(26,26,26,.25);overflow-wrap:anywhere}
.lk:hover{color:var(--red);border-bottom-color:var(--red);text-decoration:none}
.qt .why{grid-column:auto;display:flex;flex-wrap:wrap;gap:2px 12px;font-size:12.5px;color:var(--muted);margin-top:3px;font-weight:500}
.qt .why .lk{font-weight:500;color:var(--muted)}
.opp .m .lk{font-weight:500;color:var(--muted)}
.endgrid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:30px;align-items:end}
.endcta{padding-bottom:6px}
.big-cta{margin-top:0}
.fd{break-inside:avoid}
.ins{grid-template-columns:repeat(2,minmax(0,1fr))}
.topics{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
@media screen and (max-width:900px){.ex{grid-template-columns:1fr}.cols2{grid-template-columns:1fr}.keys li{grid-template-columns:84px minmax(0,1fr)}.keys .go{grid-column:2}.endgrid{grid-template-columns:1fr}}
@media print{.tabsbar{display:none!important}.js .panel,.js .sp{display:block!important}.ptitle{display:block;margin:30px 0 14px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--red)}.tbox{max-height:none;overflow:visible}.stg .subtabs{display:none}.sp{margin-bottom:14px}}
.brow .bar i,.bcard .pair i,.dv .fill,.meter i,.arow .ab i,.wkr .wb i{width:var(--w)}
/* ---- v5: period, summary, analysis, sortable tables, mixes, print ---- */
.pfoot{display:none}
.grid{align-items:start}
.grid>.sheet,.grid>.sheet+.sheet{margin-top:0}
.v,.bn,.chip b,.tk b,.opp .g,.mt b,.wc b,.hs b{overflow-wrap:normal;word-break:keep-all}
.kpi .v{font-size:clamp(26px,3.5vw,46px);white-space:nowrap}
.top .per{flex:none;color:rgba(255,255,255,.72);font-size:12.5px;font-weight:600;white-space:nowrap}
.hero .sub{margin-top:0}
.period{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.pi{display:flex;align-items:center;gap:14px;padding:14px 22px;border:1px solid rgba(255,255,255,.22);border-radius:14px;background:rgba(255,255,255,.07)}
.pi.main{background:#fff;color:var(--ink);border-color:#fff}
.pi svg{width:32px;height:32px;fill:none;stroke:var(--red);stroke-width:1.7;stroke-linecap:round;flex:none}
.pi small{display:block;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.66}
.pi b{display:block;font-size:clamp(18px,2.5vw,27px);font-weight:800;letter-spacing:-.02em;line-height:1.2;overflow-wrap:normal}
.pi span{display:block;font-size:13px;opacity:.72}
section#resumen{padding-top:54px}
.sum{max-width:880px}
.sumh{font-size:clamp(22px,2.7vw,31px);line-height:1.25;margin:8px 0 18px;letter-spacing:-.02em}
.sumt p{margin:0 0 14px;font-size:17px;line-height:1.7;color:var(--ink2)}
.sig{display:flex;align-items:center;gap:12px;margin-top:22px;font-size:14px;color:var(--muted)}
.sig .av{width:44px;height:44px;border-radius:50%;background:var(--ink);display:flex;align-items:center;justify-content:center;flex:none}
.sig .av svg{height:20px;width:auto}
.sig b{display:block;color:var(--ink);font-size:15px}
.an{background:var(--sheet);border:1px solid var(--line);border-radius:18px;padding:26px 30px;margin-bottom:28px;box-shadow:var(--shadow)}
.ak{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--red);margin-bottom:8px}
.an p{margin:0 0 10px;font-size:16.5px;line-height:1.7;color:var(--ink2);max-width:900px}
.an p:last-child{margin-bottom:0}
.chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}
.chip{background:var(--sheet);border:1px solid var(--line);border-radius:14px;padding:14px 18px;display:flex;flex-direction:column;gap:2px}
.chip b{font-size:28px;font-weight:800;letter-spacing:-.03em;line-height:1.1;font-variant-numeric:tabular-nums}
.chip span{font-size:13px;color:var(--muted)}
.chip .dl{font-size:13px}
.tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.flt{flex:1;max-width:320px;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font:inherit;font-size:14px;background:#fff;color:var(--ink)}
.flt:focus{outline:2px solid var(--red);outline-offset:1px}
.cnt{font-size:13px;color:var(--muted);white-space:nowrap}
.tbox{max-height:520px}
.qt.sm th{cursor:pointer;user-select:none;white-space:nowrap}
.qt.sm th span:after{content:"\\2195";opacity:.28;margin-left:6px;font-size:11px}
.qt.sm th.asc span:after{content:"\\25B2";opacity:1;color:var(--red)}
.qt.sm th.desc span:after{content:"\\25BC";opacity:1;color:var(--red)}
.qt td small{display:block;font-size:12px;color:var(--muted);font-weight:500}
.qt td.r{white-space:nowrap;overflow-wrap:normal}
.qt td.pg{min-width:260px;width:42%}
.qt td .dl{display:inline-block}
.tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:middle}
.sb{height:4px;border-radius:2px;background:var(--soft);margin-top:7px;overflow:hidden}
.sb i{display:block;height:100%;width:var(--w);background:var(--ink);border-radius:2px}
.why i{font-style:normal;font-weight:700}
.sph,.onlyprint{display:none}
.mix{padding:24px 26px}
.mh{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}
.mh h3{margin:0}
.mr{padding:13px 0;border-top:1px solid var(--line)}
.mt{display:flex;justify-content:space-between;gap:14px;align-items:baseline}
.mn{font-weight:600;font-size:15px;min-width:0}
.mt b{font-size:19px;font-variant-numeric:tabular-nums;white-space:nowrap}
.mb{height:6px;border-radius:3px;background:var(--soft);margin:8px 0 6px;overflow:hidden}
.mb i{display:block;height:100%;width:var(--w);background:var(--ink);border-radius:3px}
.mr.first .mb i{background:var(--red)}
.mm{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 10px;font-size:13px;color:var(--muted)}
.mm .dl{font-size:13px}
.mm .dl i{font-style:normal;font-weight:600;opacity:.8}
.wkc{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;align-items:end;height:220px}
.wc{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:100%}
.wc b{font-size:15px;font-variant-numeric:tabular-nums}
.wcb{width:100%;max-width:70px;flex:1 1 auto;display:flex;align-items:flex-end;background:var(--soft);border-radius:8px;overflow:hidden;min-height:0}
.wcb i{display:block;width:100%;height:var(--h);background:#b9b9c1;border-radius:8px 8px 0 0}
.wc.best .wcb i{background:var(--red)}
.wc span{font-size:12.5px;font-weight:600;overflow-wrap:normal}
.wc.best span{color:var(--red);font-weight:800}
.bcard .bs{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline}
@media screen and (max-width:900px){.top .per{display:none}.wkc{height:190px;gap:6px}.wc span{font-size:11px}.period{gap:8px}}
@media screen and (max-width:560px){.pi{padding:12px 16px}.chip b{font-size:23px}}
@page{size:A4;margin:0}
@media print{
html{scroll-behavior:auto}
body{background:#fff;font-size:10.5pt;line-height:1.5;overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.top,.tabsbar,.cta,.big-cta,.totop,.tools,.subtabs,.tabs{display:none!important}
.pfoot{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-between;padding:0 14mm 6mm;font-size:8pt;color:#8a8a92}
.wrap{max-width:none;padding:0 14mm}
.pgwrap{display:table;width:100%}
.pghead{display:table-header-group}
.pghead:after{content:"";display:block;height:14mm}
.pgbody{display:table-row-group}
.pgfoot{display:table-footer-group}
.pgfoot:after{content:"";display:block;height:16mm}
.hero{min-height:297mm;padding:26mm 0 0;break-after:page;display:flex;flex-direction:column}
.hero .wrap{display:flex;flex-direction:column;flex:1;padding-bottom:22mm}
.hero .kpis{margin-top:auto}
.hero h1{font-size:34pt}
.period{margin-top:14mm}
.pi b{font-size:16pt}
section#resumen{padding-top:0;break-after:page}
.sumh{font-size:18pt}
.sumt p{font-size:11.5pt}
.js .panel{display:block!important;break-before:page}
.ptitle{display:block;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid var(--ink);font-size:10.5pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--red)}
.panels{padding:0}
.blk{margin-bottom:16px}
.bh{break-after:avoid;break-inside:avoid}
.bh h2{font-size:14pt;break-after:avoid}
.bh .lead{break-after:avoid}
.mix,.chip,.bcard{break-inside:avoid}
.grid>*{break-inside:avoid}
.lead{font-size:9.5pt;margin-bottom:10px}
.sheet,.fd,.topic,.ucard,.bcard,.dgc,.tic,.mix,.chip,.opp,.an,.idea,.serp,.note,.hlt{break-inside:avoid;box-shadow:none}
.sheet{padding:14px 16px;border-radius:10px}
.an{padding:14px 18px;margin-bottom:14px}
.an p{font-size:10.5pt}
.cols2{grid-template-columns:1fr}
.bands{grid-template-columns:repeat(4,1fr);gap:8px}
.bcard{padding:12px}
.bcard .bn{font-size:24pt}
.topics{grid-template-columns:repeat(2,1fr)}
.ins{grid-template-columns:1fr 1fr}
.chips{grid-template-columns:repeat(4,1fr)}
.chip{padding:10px 12px}
.chip b{font-size:17pt}
.tbox{max-height:none!important;overflow:visible;border:0}
.qt.sm{font-size:8.5pt}
.qt.sm th{position:static;border-bottom:1.5px solid var(--ink)}
.qt.sm th span:after{content:none!important}
.qt.sm td{padding:5px 8px}
.qt thead{display:table-header-group}
.qt tr{break-inside:avoid}
.xr{display:none}
.onlyprint{display:block;font-size:8pt;color:var(--muted);margin:6px 0 0}
.js .sp{display:block!important;margin-bottom:14px}
.sph{display:block;margin:0 0 6px;font-size:9pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.lk{border-bottom:0}
#chart{height:250px}
.wkc{height:150px}
.end{break-before:page;margin-top:0;padding:14mm 0 0;min-height:200mm}
.endgrid{grid-template-columns:1fr}
.mb i,.sb i,.wcb i,.brow .bar i,.bcard .pair i,.meter i{transition:none}
}
.mb i,.wcb i{transition:none}

.scv{display:inline-block;width:104px;text-align:right}
.scv b{font-size:16px;font-variant-numeric:tabular-nums}
.scv b.up,.asc.up{color:var(--up)}
.scv b.mid,.asc.mid{color:var(--warn)}
.scv b.down,.asc.down{color:var(--down)}
.sn{color:var(--muted)}
.acards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-top:18px}
.acard{background:var(--sheet);border:1px solid var(--line);border-radius:18px;padding:22px 24px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
.acard .at{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.acard .atype{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.acard .asc{font-size:38px;font-weight:800;letter-spacing:-.03em;line-height:1}
.acard .au{font-size:14px;overflow-wrap:anywhere}
.acard .ar{font-size:13px;color:var(--muted)}
.ai{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:10px;font-size:14px}
.ai li small{display:block;font-size:12px;color:var(--muted)}
.ai .k{display:inline-block;margin-right:8px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.ai .k.fail{color:var(--down)}.ai .k.warn{color:var(--muted)}
.qt td b{font-weight:700}
@media print{.acard{break-inside:avoid;box-shadow:none;padding:12px 14px}.acards{grid-template-columns:repeat(2,1fr);gap:8px}.acard .asc{font-size:22pt}}

span.dl.up{color:var(--up)}
span.dl.down{color:var(--down)}
.topic .tk span.dl.up,.chip span.dl.up{color:var(--up)}
.topic .tk span.dl.down,.chip span.dl.down{color:var(--down)}
.period{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:12px;margin-top:30px}
.pi b{font-size:clamp(16px,2vw,23px)}
.pi.main b{font-size:clamp(17px,2.2vw,25px)}
.mixcols{columns:2;column-gap:18px}
.mixcols .mix{break-inside:avoid;display:inline-block;width:100%;margin:0 0 18px;padding:20px 24px}
.mr{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(70px,.9fr) 124px;gap:16px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}
.ml{display:flex;flex-direction:column;min-width:0}
.mp{font-size:12px;color:var(--muted)}
.mb{margin:0}
.mv{display:flex;flex-direction:column;align-items:flex-end;text-align:right}
.mv b{font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.mv .dl{font-size:12.5px}
.mv .dl i{font-style:normal;font-weight:600;opacity:.8}
.ext{font-size:13px}
.steps li{display:block;padding:20px 0}
.steps li:before{display:inline-block;margin-right:16px}
.steps li b{font-weight:700;color:#fff}
.steps li span{display:block;margin:6px 0 0 36px;font-size:15.5px;color:rgba(246,246,246,.72)}
.end .foot{margin-top:50px}
@media screen and (max-width:900px){.period{grid-template-columns:1fr}.mixcols{columns:1}}
@media screen and (max-width:560px){.mr{grid-template-columns:minmax(0,1fr) auto}.mr .mb{grid-column:1/-1;order:3}}
@media print{.period{grid-template-columns:1.25fr 1fr}.mixcols{columns:2}.steps li{padding:10px 0}}

.of{font-style:normal;font-size:.55em;font-weight:600;color:var(--muted);margin-left:2px;letter-spacing:0}
.scv{display:inline-block;width:112px;text-align:right}
.scv b{font-size:17px}
.scv b.up,.cs b.up,.tps b.up{color:var(--up)}
.scv b.mid,.cs b.mid,.tps b.mid{color:var(--warn)}
.scv b.down,.cs b.down,.tps b.down{color:var(--down)}
.tp{display:grid;gap:22px;margin-top:6px}
.tph{display:flex;flex-wrap:wrap;align-items:center;gap:18px 40px;padding:20px 24px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}
.tps b{font-size:54px;font-weight:800;letter-spacing:-.04em;line-height:1}
.tps .of{font-size:20px}
.tps small{display:block;font-size:13px;color:var(--muted);margin-top:4px;max-width:260px}
.tpl{list-style:none;margin:0;padding:0;display:grid;gap:5px;font-size:14px}
.tpl .pn{color:var(--muted);font-size:12.5px;margin-left:6px}
.crs{display:grid;gap:2px 40px;grid-template-columns:repeat(2,minmax(0,1fr))}
.cr{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(60px,.7fr) 76px;gap:14px;align-items:center;padding:9px 0;border-top:1px solid var(--line)}
.cn{font-size:14.5px;font-weight:600;display:flex;flex-direction:column}
.cn small{font-size:12px;color:var(--muted);font-weight:500}
.cs{text-align:right;font-variant-numeric:tabular-nums}
.cs b{font-size:16px}
.cr .sb{margin:0}
.ih{margin:6px 0 -6px}
.isl{display:grid;gap:14px}
.is{border:1px solid var(--line);border-radius:14px;padding:18px 20px;background:#fff}
.ish{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px}
.ish h4{margin:0;font-size:16.5px;line-height:1.3;flex:1 1 280px;letter-spacing:-.01em}
.ik{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.ik.fail{color:var(--down)}.ik.warn{color:var(--warn)}
.ip{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap}
.im{font-size:12.5px;color:var(--muted);margin:3px 0 8px}
.is p{margin:0 0 8px;font-size:14.5px;color:var(--ink2);line-height:1.6}
.is p.ev{font-size:12.5px;color:var(--muted)}
.el{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-wrap:wrap;gap:5px}
.el li{font-size:12px;background:var(--soft);border-radius:6px;padding:2px 8px;color:var(--ink2);overflow-wrap:anywhere}
.src{font-size:13px;color:var(--muted)}
.src .lk{font-weight:500}
@media screen and (max-width:900px){.crs{grid-template-columns:1fr}.tps b{font-size:44px}}
@media print{.crs{grid-template-columns:1fr 1fr;gap:0 24px}.is{break-inside:avoid;padding:10px 12px}.tph{padding:12px 16px}.tps b{font-size:30pt}.ih{break-after:avoid}}

.scv .of,.cs .of{font-size:11px}
.chip b .of{font-size:15px}
/* ---- v6: rich text, bars in tables, topic bands, pills, roadmap, signature ---- */
mark.hl{background:none;color:var(--red);font-weight:700}
.an strong,.sumt strong,.is strong{color:var(--ink);font-weight:700}
.rl{margin:0 0 12px;padding-left:22px;font-size:16.5px;line-height:1.7;color:var(--ink2)}
.rl li{margin:4px 0}
.rl li::marker{color:var(--red)}
.nb{display:inline-flex;align-items:center;gap:10px;justify-content:flex-end}
.nv{display:flex;flex-direction:column;align-items:flex-end}
.tr{display:block;width:64px;height:6px;border-radius:3px;background:var(--soft);overflow:hidden;flex:none}
.tr i{display:block;height:100%;width:var(--w);background:var(--red);border-radius:3px}
.topics{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.tbh{margin-top:6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.tbs{display:grid;gap:7px}
.tbr{display:grid;grid-template-columns:42px minmax(0,1fr) 54px 64px;gap:8px;align-items:center;font-size:12.5px}
.tbr .tl{color:var(--muted);font-weight:600}
.tbr.max .tl{color:var(--red);font-weight:800}
.tbar{display:block;height:8px;background:var(--soft);border-radius:4px;overflow:hidden}
.tbar i{display:block;height:100%;width:var(--w);background:#b9b9c1;border-radius:4px}
.tbr.max .tbar i{background:var(--red)}
.tbr .tv{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.tbr .td{text-align:right}
.tbr .td .dl{font-size:11.5px}
.pills{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px}
.pill{font-size:11.5px;font-weight:700;letter-spacing:.03em;border:1px solid var(--red);color:var(--red);border-radius:999px;padding:1px 10px}
.els{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 8px}
.els .el,.el{display:inline-block;margin:0;padding:2px 8px;font-size:12px;background:var(--soft);border-radius:6px;color:var(--ink2);overflow-wrap:anywhere}
a.el{color:var(--ink);font-weight:600;border:0}
a.el:hover{color:var(--red);background:#fde8ec;text-decoration:none}
.exs{font-size:13px;color:var(--muted);margin:0 0 6px}
.exs span{font-weight:600}
.tabl{margin:0 0 14px}
.steps{max-width:920px}
.steps li.st{display:grid;grid-template-columns:52px minmax(0,1fr);gap:0;padding:26px 0;border-top:1px solid rgba(255,255,255,.16);font-size:16px;counter-increment:none}
.steps li:before{content:none}
.steps li .sn{display:block;margin:0;font-size:18px;font-weight:800;color:var(--red);font-variant-numeric:tabular-nums;line-height:1.5}
.steps li .sc{min-width:0}
.steps .stt{display:block;font-size:19px;line-height:1.4;color:#fff;font-weight:700}
.steps .sw{margin:8px 0 0;font-size:15.5px;line-height:1.6;color:rgba(246,246,246,.8)}
.steps .sh{margin:10px 0 0;padding-left:18px;font-size:15px;line-height:1.55;color:rgba(246,246,246,.8)}
.steps .sh li{display:list-item;padding:0;border:0;margin:3px 0;font-size:15px;counter-increment:none}
.steps .sh li::marker{color:var(--red)}
.steps .si{margin:12px 0 0;font-size:15px;color:#fff}
.steps .si b{display:block;margin-bottom:2px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#ff8da1}
.steps mark.hl{color:#ff8da1}
.steps strong{color:#fff}
.sig .av{width:54px;height:54px;padding:3px;background:var(--red);overflow:hidden}
.sig .av img{display:block;width:100%;height:100%;border-radius:50%;object-fit:cover}
@media screen and (max-width:560px){.steps li.st{grid-template-columns:38px minmax(0,1fr)}.tbr{grid-template-columns:38px minmax(0,1fr) 48px 56px}}
@media print{
.panels{padding-top:0;padding-bottom:0}
.js .panel{break-before:auto;margin-top:9mm}
.js .panel:first-of-type{margin-top:0}
section#resumen{break-after:auto;margin-bottom:8mm}
.sheet{break-inside:auto}
.chartbox,.uimp,.ucard,.wkc,.mix,.topic,.is,.acard,.tph{break-inside:avoid}
#chart{height:auto}
.topics{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.topic{padding:12px 14px}
.tbr{grid-template-columns:36px minmax(0,1fr) 44px 54px;font-size:8pt}
.tr{width:44px}
.mixcols{columns:2;column-gap:10px}
.mixcols .mix{padding:10px 14px;margin-bottom:10px}
.mr{padding:6px 0}
.steps li.st{padding:12px 0;break-inside:avoid}
.steps .stt{font-size:12pt}
.steps .sw,.steps .sh,.steps .si{font-size:9.5pt}
.rl{font-size:10.5pt}
.end{min-height:0;padding:10mm 0 0}
.is{padding:10px 12px}
.pill{font-size:8pt;padding:0 7px}
}
/* ---- v7: real page margins in print (a table repeats its header and footer
   on every page, so each page keeps its top and bottom space) ---- */
.pgwrap,.pgwrap>tbody,.pgwrap>tbody>tr,.pgwrap>tbody>tr>td{display:block;padding:0;border:0;width:auto}
.pgwrap>thead,.pgwrap>tfoot{display:none}
@media print{
.pgwrap{display:table;width:100%;border-collapse:collapse}
.pgwrap>thead{display:table-header-group}
.pgwrap>tfoot{display:table-footer-group}
.pgwrap>tbody{display:table-row-group}
.pgwrap>thead>tr,.pgwrap>tfoot>tr,.pgwrap>tbody>tr{display:table-row}
.pgwrap>thead>tr>td,.pgwrap>tfoot>tr>td,.pgwrap>tbody>tr>td{display:table-cell}
.pgsp.h{height:15mm}
.pgsp.f{height:19mm}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.panels{padding:0 14mm}
.ptitle{break-after:avoid}
.bh{break-after:avoid}
.tw{break-inside:avoid}
.noprint{display:none}
.end{min-height:297mm;break-before:page;margin-top:0;padding:16mm 0 0}
}

a.pill{text-decoration:none;cursor:pointer}
a.pill:hover{background:var(--red);color:#fff;text-decoration:none}
.elk{display:flex;flex-wrap:wrap;gap:4px 14px;margin:2px 0 6px;font-size:12px;color:var(--muted)}
.elk .kp{color:var(--up);font-weight:600}
.elk .kf{color:var(--down);font-weight:600}
.el .m{font-style:normal;font-weight:800;margin-right:5px}
.el.pass .m{color:var(--up)}
.el.fail .m{color:var(--down)}
.el.warn .m{color:var(--warn)}
.el.fail{background:#fbe9e9;color:var(--ink)}
.el.pass{color:var(--muted)}
@media print{.elk{font-size:8pt}}
/* ---- v8: opportunities, conclusions, related checks ---- */
.how2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.hw p{margin:8px 0 0;font-size:14.5px;line-height:1.6;color:var(--ink2)}
.hwn{margin:16px 0 0;font-size:13px;line-height:1.6;color:var(--muted)}
.kd{display:inline-block;width:fit-content;font-size:11.5px;font-weight:700;letter-spacing:.03em;border:1px solid var(--line);border-radius:999px;padding:1px 10px;color:var(--ink2);background:#fff}
.kd.push{border-color:var(--red);color:var(--red)}
.kd.snippet{border-color:var(--ink);color:var(--ink)}
.eff{display:inline-flex;gap:3px;vertical-align:middle}
.eff i{width:9px;height:9px;border-radius:50%;background:var(--line);display:block}
.eff i.on{background:var(--red)}
.ops{display:grid;gap:12px}
details.op{border:1px solid var(--line);border-radius:16px;background:var(--sheet);box-shadow:var(--shadow);overflow:hidden}
details.op>summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:44px minmax(0,1fr) auto 18px;gap:14px;align-items:center;padding:16px 20px}
details.op>summary::-webkit-details-marker{display:none}
details.op>summary:after{content:"\\25BE";color:var(--muted);transition:transform .2s}
details.op[open]>summary:after{transform:rotate(180deg)}
details.op[open]>summary{border-bottom:1px solid var(--line)}
.ot{display:flex;flex-direction:column;gap:5px;min-width:0}
.ot b{font-size:17px;letter-spacing:-.01em}
.om{display:flex;gap:24px;align-items:center}
.om>span{display:flex;flex-direction:column;gap:2px;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.om small{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.om .og{color:var(--red);font-size:22px;letter-spacing:-.02em;text-align:right}
.ob{padding:6px 24px 24px}
.ob.two{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:30px}
.ob h5{margin:18px 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--red)}
.rich p{margin:0 0 8px;font-size:15px;line-height:1.65;color:var(--ink2)}
.rich .rl{font-size:15px}
.oa{margin:0;padding-left:22px;display:grid;gap:7px;font-size:15px;line-height:1.6;color:var(--ink2)}
.oa li::marker{color:var(--red);font-weight:700}
.opg{margin-top:16px;font-size:13px;color:var(--muted)}
.os .sl{margin:10px 0 4px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.ideas2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.idea2{border:1px solid var(--line);border-radius:16px;padding:20px 22px;background:var(--sheet);box-shadow:var(--shadow)}
.ik2{margin-bottom:6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--red)}
.idea2 b{display:block;margin-bottom:6px;font-size:17px;line-height:1.3}
.itg{margin-bottom:8px;font-size:13px;color:var(--muted)}
.idea2 p{margin:0;font-size:14.5px;line-height:1.6;color:var(--ink2)}
.cv{margin-bottom:28px;padding:26px 30px;border-radius:18px;background:var(--ink);color:#f6f6f6}
.cvk{margin-bottom:6px;font-size:11.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ff8da1}
.cv p{margin:0;font-size:clamp(19px,2.3vw,26px);line-height:1.35;font-weight:700;letter-spacing:-.015em}
h3.cs{margin:0 0 12px}
.ctop{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-bottom:36px}
.cf{display:flex;flex-direction:column;gap:10px;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--sheet);box-shadow:var(--shadow)}
.cft{display:flex;justify-content:space-between;align-items:center;gap:10px}
.no{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--ink);color:#fff;font-size:14px;font-weight:800}
.tp2,.crk{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.dot{display:inline-block;width:9px;height:9px;margin-right:7px;border-radius:50%;background:var(--muted)}
.dot.good{background:var(--up)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--down)}
.cfm b{display:block;font-size:34px;font-weight:800;letter-spacing:-.035em;line-height:1.05;font-variant-numeric:tabular-nums}
.cfm span{font-size:13px;color:var(--muted)}
.cf.bad .cfm b{color:var(--down)}.cf.good .cfm b{color:var(--up)}.cf.warn .cfm b{color:var(--warn)}
.cf h4{margin:2px 0 0;font-size:17px;line-height:1.3}
.cf p{margin:0;font-size:14.5px;line-height:1.6;color:var(--ink2)}
.cfs{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--muted)}
.sc2 b{margin-left:5px;color:var(--ink)}
.go{margin-top:auto;font-size:13.5px;font-weight:700}
.cg{margin-bottom:30px}
.cgh{display:flex;align-items:baseline;gap:10px}
.cgh h3{margin:0}
.cgh span{font-size:13px;font-weight:700;color:var(--red)}
.cgl{margin:2px 0 12px;font-size:14px;color:var(--muted)}
.crs2{overflow:hidden;border:1px solid var(--line);border-radius:16px;background:#fff}
.cr2{display:grid;grid-template-columns:130px minmax(0,1fr) auto;gap:20px;align-items:start;padding:18px 22px;border-top:1px solid var(--line)}
.cr2:first-child{border-top:0}
.crm b{display:block;font-size:22px;font-weight:800;letter-spacing:-.03em;line-height:1.1;font-variant-numeric:tabular-nums}
.crm span{font-size:12px;color:var(--muted)}
.cr2 h4{margin:3px 0 4px;font-size:16.5px;line-height:1.3}
.cr2 p{margin:0 0 6px;font-size:14.5px;line-height:1.6;color:var(--ink2)}
.rel{margin:8px 0;padding:12px 14px;border-radius:10px;background:var(--soft);font-size:13.5px;line-height:1.55;color:var(--ink2)}
.rel>b{display:block;margin-bottom:4px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.rel div+div{margin-top:6px}
@media screen and (max-width:900px){.how2,.ctop{grid-template-columns:1fr}.ob.two{grid-template-columns:1fr}.om>span:not(.og){display:none}details.op>summary{grid-template-columns:44px minmax(0,1fr) auto 18px}.cr2{grid-template-columns:1fr;gap:6px}.cr2 .go{margin-top:4px}}
@media print{
details.op{break-inside:avoid;box-shadow:none}
details.op>summary{padding:10px 14px;grid-template-columns:36px minmax(0,1fr) auto}
details.op>summary:after{content:none}
.ob{padding:2px 16px 14px}
.ob.two{gap:18px}
.rich p,.oa,.rich .rl{font-size:9.5pt}
.ctop{grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.cf{padding:12px 14px;box-shadow:none}
.cfm b{font-size:20pt}
.cf h4{font-size:10.5pt}.cf p{font-size:9pt}
.cv{padding:14px 18px;margin-bottom:14px}
.cv p{font-size:14pt}
.cr2{grid-template-columns:90px minmax(0,1fr);padding:10px 14px;break-inside:avoid}
.cr2 .go{display:none}
.cr2 h4{font-size:10.5pt}.cr2 p{font-size:9pt}
.cg{margin-bottom:14px}
.ideas2{grid-template-columns:repeat(2,1fr);gap:10px}
.idea2{padding:12px 14px;box-shadow:none;break-inside:avoid}
.how2{gap:10px}
}

.kd{white-space:nowrap;overflow-wrap:normal}
.qt td .kd{font-size:11px;padding:1px 8px}
`;
