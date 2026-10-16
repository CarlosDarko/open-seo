// The look of a client report: a single self-contained stylesheet in Carlos
// Ortega's brand (ink #1a1a1a, red #f11c41, soft greys). It reads like a small
// website: a dark cover, full-width bands, cards with depth and scroll
// reveals. No external fonts or images; printing gives a clean document.
export const REPORT_CSS = `
:root{--ink:#1a1a1a;--ink2:#2a2a2d;--red:#f11c41;--red-d:#c9102f;--red-soft:#fdeaee;--bg:#ebebeb;--card:#f8f8f8;--line:#d9d9db;--muted:#6a6a72;--soft:#efeff0;--good:#15803d;--good-soft:#e1f3e8;--bad:#b42318;--bad-soft:#fbe7e4;--warn:#9a5b06;--warn-soft:#fdf0d8;--shadow:0 1px 2px rgba(20,20,25,.05),0 8px 28px rgba(20,20,25,.07)}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:70px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;overflow-x:hidden}
a{color:var(--red);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.js .rv{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.js .rv.in{opacity:1;transform:none}
.js .rv.d1{transition-delay:.08s}.js .rv.d2{transition-delay:.16s}.js .rv.d3{transition-delay:.24s}
/* nav */
.top{position:fixed;inset:0 0 auto 0;z-index:50;transition:background .3s,box-shadow .3s,backdrop-filter .3s}
.top.solid{background:rgba(26,26,26,.88);backdrop-filter:blur(12px);box-shadow:0 1px 0 rgba(255,255,255,.08)}
.top .wrap{display:flex;align-items:center;gap:18px;height:62px}
.top .iso{flex:none}
.nav{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;flex:1}
.nav::-webkit-scrollbar{display:none}
.nav a{padding:7px 12px;border-radius:999px;color:rgba(255,255,255,.72);font-size:13px;font-weight:600;white-space:nowrap}
.nav a:hover{color:#fff;background:rgba(255,255,255,.1);text-decoration:none}
.nav a.on{color:#fff;background:var(--red)}
.cta{flex:none;border:0;background:var(--red);color:#fff;border-radius:999px;padding:8px 16px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.cta:hover{background:var(--red-d);text-decoration:none}
/* hero */
.hero{position:relative;background:var(--ink);color:#f6f6f6;overflow:hidden;padding:120px 0 0}
.hero:before{content:"";position:absolute;inset:-20% -10% auto auto;width:70%;height:140%;background:radial-gradient(closest-side,rgba(241,28,65,.55),rgba(241,28,65,0) 70%);filter:blur(10px)}
.hero:after{content:"";position:absolute;inset:auto auto -30% -15%;width:60%;height:90%;background:radial-gradient(closest-side,rgba(241,28,65,.22),rgba(241,28,65,0) 70%)}
.hero .bgchart{position:absolute;inset:auto 0 0 0;height:46%;width:100%;opacity:.5}
.hero .wrap{position:relative;z-index:2}
.logo{height:34px;margin-bottom:46px}
.logo svg{height:100%;width:auto;display:block}
.top .iso svg{height:30px;width:auto;display:block}
.msg .av svg{height:34px;width:auto}
.fm svg{height:28px;width:auto;display:block}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#ffb3c0;background:rgba(241,28,65,.16);border:1px solid rgba(241,28,65,.35);border-radius:999px;padding:6px 14px}
.hero h1{margin:20px 0 14px;font-size:clamp(34px,6vw,68px);line-height:1.04;letter-spacing:-.035em;font-weight:800;max-width:900px}
.hero h1 em{font-style:normal;color:var(--red)}
.hero .sub{font-size:clamp(16px,2vw,20px);color:rgba(246,246,246,.8);max-width:760px;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin:26px 0 0}
.chip{display:inline-flex;align-items:center;gap:8px;background:rgba(74,222,128,.13);border:1px solid rgba(74,222,128,.38);color:#bff0cf;border-radius:999px;padding:7px 15px;font-size:14px;font-weight:700}
.chip:before{content:"";width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 4px rgba(74,222,128,.2)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:54px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.12);border-radius:20px 20px 0 0;overflow:hidden}
.kpi{background:rgba(26,26,26,.72);backdrop-filter:blur(8px);padding:26px 24px 24px}
.kpi .l{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(246,246,246,.6)}
.kpi .v{font-size:clamp(34px,4.6vw,54px);font-weight:800;letter-spacing:-.035em;line-height:1.1;margin:6px 0 8px;font-variant-numeric:tabular-nums}
.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}
.pill.good{background:var(--good-soft);color:var(--good)}
.pill.bad{background:var(--bad-soft);color:var(--bad)}
.pill.warn{background:var(--warn-soft);color:var(--warn)}
.pill.flat{background:rgba(255,255,255,.12);color:rgba(246,246,246,.75)}
.pill.red{background:var(--red-soft);color:var(--red-d)}
/* sections */
section.s{padding:84px 0 0}
section.s:last-of-type{padding-bottom:84px}
.kick{font-size:12.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--red)}
h2{margin:8px 0 10px;font-size:clamp(28px,4vw,44px);line-height:1.08;letter-spacing:-.03em;font-weight:800}
.lead{margin:0 0 34px;color:var(--muted);font-size:17px;max-width:720px}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:26px;box-shadow:var(--shadow)}
.grid{display:grid;gap:18px}
.g2{grid-template-columns:repeat(2,1fr)}
.g3{grid-template-columns:repeat(3,1fr)}
h3{margin:0 0 12px;font-size:12.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.note{margin-top:22px;padding:16px 20px;border-radius:16px;background:var(--red-soft);border-left:4px solid var(--red);white-space:pre-line;font-size:15.5px}
.note b{display:block;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--red-d);margin-bottom:3px}
/* message */
.msg{display:grid;grid-template-columns:auto 1fr;gap:26px;align-items:start;background:var(--ink);color:#f6f6f6;border-radius:26px;padding:34px;box-shadow:var(--shadow);margin-top:-1px}
.msg .av{width:72px;height:72px;border-radius:50%;background:#2a2a2d;display:flex;align-items:center;justify-content:center;border:2px solid var(--red)}
.msg .av svg{height:36px}
.msg p{margin:0;font-size:clamp(17px,2.2vw,21px);line-height:1.55;white-space:pre-line}
.msg small{display:block;margin-top:14px;font-weight:800;color:#ffb3c0;letter-spacing:.04em}
/* insights */
.ins{display:grid;grid-template-columns:repeat(6,1fr);gap:18px}
.in-card{grid-column:span 2;position:relative;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:12px;overflow:hidden}
.in-card.big{grid-column:span 4}
.in-card:before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:var(--bar,var(--line))}
.in-card.good{--bar:#22a755}.in-card.warn{--bar:#e8a21c}.in-card.bad{--bar:var(--red)}.in-card.info{--bar:#8a8a93}
.ic{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:var(--soft)}
.in-card.good .ic{background:var(--good-soft);color:var(--good)}.in-card.warn .ic{background:var(--warn-soft);color:var(--warn)}.in-card.bad .ic{background:var(--bad-soft);color:var(--bad)}.in-card.info .ic{background:var(--soft);color:var(--ink2)}
.ic svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.in-card .t{font-size:19px;line-height:1.28;font-weight:800;letter-spacing:-.015em}
.in-card.big .t{font-size:24px}
.in-card .b{margin:0;color:#3a3a40;font-size:15px}
.st{display:flex;flex-wrap:wrap;gap:8px}
.st span{background:var(--soft);border-radius:10px;padding:5px 11px;font-size:13px;color:var(--muted)}
.st b{color:var(--ink);font-variant-numeric:tabular-nums}
.up{margin-top:auto;display:flex;gap:10px;align-items:flex-start;background:var(--good-soft);color:#14532d;border-radius:14px;padding:11px 14px;font-size:14px;font-weight:600}
.up svg{flex:none;width:18px;height:18px;margin-top:2px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
/* chart */
.chartbox{position:relative}
#chart{width:100%;height:340px;display:block;touch-action:pan-y}
.tabs{display:inline-flex;gap:4px;background:var(--soft);border-radius:12px;padding:4px;margin-bottom:14px}
.tabs button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:13.5px;font-weight:700;padding:7px 16px;border-radius:9px;cursor:pointer}
.tabs button.on{background:var(--ink);color:#fff}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:#f6f6f6;border-radius:12px;padding:10px 14px;font-size:13px;line-height:1.5;white-space:nowrap;box-shadow:0 12px 32px rgba(0,0,0,.3);transform:translate(-50%,-112%);opacity:0;transition:opacity .08s}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:14px;font-size:13px;color:var(--muted)}
.legend i{display:inline-block;width:20px;height:4px;border-radius:2px;margin-right:7px;vertical-align:middle;background:var(--red)}
.legend i.prev{background:repeating-linear-gradient(90deg,var(--muted) 0 5px,transparent 5px 9px);height:3px}
.legend i.sq{width:12px;height:12px;border-radius:4px}
.uimp{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:22px}
.ucard{border:1px solid var(--line);border-radius:18px;padding:18px;background:#fff;border-top:4px solid var(--uc,#7c3aed)}
.ucard .un{font-weight:800;font-size:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ucard .ud{font-size:12.5px;color:var(--muted);margin:2px 0 12px}
.ucard .trio{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
.ucard .trio div{background:var(--soft);border-radius:12px;padding:8px 10px}
.ucard .trio small{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.ucard .trio b{font-size:18px;font-variant-numeric:tabular-nums}
.ucard p{margin:0;font-size:14px;color:#3a3a40}
/* bars */
.brow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;align-items:center;margin-bottom:12px}
.brow .n{font-size:14.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brow .d{font-weight:800;font-variant-numeric:tabular-nums}
.brow .bar{grid-column:1/3;height:8px;border-radius:4px;background:var(--soft);overflow:hidden}
.brow .bar i{display:block;height:100%;border-radius:4px;width:0;transition:width 1s cubic-bezier(.2,.7,.2,1)}
.in .brow .bar i{width:var(--w)}
.upc{color:var(--good)}.dnc{color:var(--bad)}
.upb{background:linear-gradient(90deg,#22a755,#16a34a)}.dnb{background:linear-gradient(90deg,#f87171,var(--red))}
.why{font-size:12.5px;color:var(--muted);grid-column:1/3;margin-top:-2px}
.why em{font-style:normal;background:var(--soft);border-radius:8px;padding:1px 8px;margin-right:6px;white-space:nowrap}
.diverge{display:grid;gap:10px}
.dv{display:grid;grid-template-columns:140px 1fr;gap:12px;align-items:center;font-size:14px}
.dv .lab{font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dv .track{position:relative;height:26px;background:var(--soft);border-radius:8px}
.dv .track:before{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;background:var(--line)}
.dv .fill{position:absolute;top:3px;bottom:3px;border-radius:6px;width:0;transition:width 1s cubic-bezier(.2,.7,.2,1)}
.in .dv .fill{width:var(--w)}
.dv .val{position:absolute;top:50%;transform:translateY(-50%);font-weight:800;font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink)}
/* bands */
.band{display:grid;grid-template-columns:150px 1fr 190px;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}
.band:last-child{border-bottom:0}
.band .bl{font-weight:800}
.band .tr{height:12px;border-radius:6px;background:var(--soft);overflow:hidden;margin:3px 0}
.band .tr i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--red),#ff6b84);width:0;transition:width 1.1s cubic-bezier(.2,.7,.2,1)}
.band .tr.old i{background:#b9b9c0}
.in .band .tr i{width:var(--w)}
.band .bn{text-align:right;font-variant-numeric:tabular-nums;font-size:14px}
.band .bn small{display:block;color:var(--muted)}
.movers{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.mv{background:var(--good-soft);color:#14532d;border-radius:999px;padding:5px 13px;font-size:13px;font-weight:600}
.mv b{font-variant-numeric:tabular-nums}
/* topics */
.topics{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.topic{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
.topic .tn{font-size:18px;font-weight:800;letter-spacing:-.01em;line-height:1.2}
.topic .tk{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.topic .tk b{font-size:32px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.topic .tq{display:flex;flex-wrap:wrap;gap:6px}
.topic .tq span{background:var(--soft);border-radius:8px;padding:2px 9px;font-size:12.5px;color:#3a3a40}
.meter{height:7px;border-radius:4px;background:var(--soft);overflow:hidden}
.meter i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#22a755);border-radius:4px;width:0;transition:width 1s}
.in .meter i{width:var(--w)}
.topic small{color:var(--muted);font-size:12.5px}
/* donuts */
.donuts{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.dn{display:flex;gap:20px;align-items:center}
.dn svg{width:132px;height:132px;flex:none;transform:rotate(-90deg)}
.dn circle{fill:none;stroke-width:5.2}
.dn .lg{display:grid;gap:7px;font-size:13.5px}
.dn .lg span{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}
/* week */
.week{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;align-items:end;height:230px;padding-top:10px}
.wd{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:8px;height:100%}
.wd .col{width:100%;max-width:64px;border-radius:12px 12px 6px 6px;background:#c8c8ce;height:0;transition:height 1s cubic-bezier(.2,.7,.2,1)}
.wd.best .col{background:linear-gradient(180deg,#ff6b84,var(--red))}
.in .wd .col{height:var(--h)}
.wd b{font-size:14px;font-variant-numeric:tabular-nums}
.wd span{font-size:13px;font-weight:700;color:var(--muted)}
/* opportunities */
.opp{display:grid;grid-template-columns:44px 1fr auto;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)}
.opp:last-child{border-bottom:0}
.opp .rk{width:44px;height:44px;border-radius:14px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}
.opp .q{font-weight:800;font-size:16.5px}
.opp .m{font-size:13px;color:var(--muted);margin-top:2px}
.opp .m em{font-style:normal;background:var(--soft);border-radius:7px;padding:1px 8px;margin-right:6px}
.opp .g{text-align:right;font-weight:800;font-size:22px;color:var(--good);font-variant-numeric:tabular-nums;line-height:1}
.opp .g small{display:block;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-top:3px}
.obar{grid-column:2/4;height:6px;border-radius:3px;background:var(--soft);overflow:hidden;margin-top:-6px}
.obar i{display:block;height:100%;background:linear-gradient(90deg,#22a755,#86efac);width:0;transition:width 1s}
.in .obar i{width:var(--w)}
/* health */
.hl{display:grid;grid-template-columns:auto 1fr;gap:34px;align-items:center}
.ring{position:relative;width:170px;height:170px}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:3.4}
.ring .ct{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring .ct b{font-size:38px;font-weight:800;letter-spacing:-.03em}
.ring .ct small{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.hs{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.hs div{background:var(--soft);border-radius:16px;padding:14px 16px}
.hs b{display:block;font-size:26px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hs small{color:var(--muted);font-size:13px}
/* queries table */
table{width:100%;border-collapse:collapse;font-size:14.5px}
th{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:800;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:11px 10px;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:0}
.r{text-align:right;font-variant-numeric:tabular-nums}
/* updates */
.tl{display:grid;gap:14px}
.upd{display:flex;gap:16px;align-items:center;padding:16px 18px;border:1px solid var(--line);border-radius:16px;background:#fff;border-left:5px solid var(--uc,#7c3aed)}
.upd .dt{font-variant-numeric:tabular-nums;font-size:13.5px;color:var(--muted);min-width:170px}
/* closing */
.end{background:var(--ink);color:#f6f6f6;margin-top:84px;padding:84px 0 0;position:relative;overflow:hidden}
.end:before{content:"";position:absolute;inset:-40% -10% auto auto;width:60%;height:120%;background:radial-gradient(closest-side,rgba(241,28,65,.4),rgba(241,28,65,0) 70%)}
.end .wrap{position:relative}
.end h2{color:#fff}
.steps{margin:0;padding:0;list-style:none;display:grid;gap:12px;counter-reset:s}
.steps li{counter-increment:s;display:flex;gap:16px;align-items:flex-start;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px 20px;font-size:17px}
.steps li:before{content:counter(s);flex:none;width:32px;height:32px;border-radius:50%;background:var(--red);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center}
.big-cta{display:inline-block;margin-top:30px;background:var(--red);color:#fff;border-radius:999px;padding:14px 30px;font-weight:800;font-size:16px}
.big-cta:hover{background:var(--red-d);text-decoration:none}
.foot{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;margin-top:70px;padding:28px 0 36px;border-top:1px solid rgba(255,255,255,.14);color:rgba(246,246,246,.6);font-size:13px}
.foot svg{height:26px}
.empty{color:var(--muted)}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.ins{grid-template-columns:1fr 1fr}.in-card,.in-card.big{grid-column:span 2}.g2,.g3{grid-template-columns:1fr}.band{grid-template-columns:1fr}.band .bn{text-align:left}.msg{grid-template-columns:1fr}.hl{grid-template-columns:1fr}.dv{grid-template-columns:100px 1fr}.cta{display:none}}
@media (max-width:560px){.wrap{padding:0 16px}.ins{grid-template-columns:1fr}.in-card,.in-card.big{grid-column:span 1}.hero{padding-top:96px}.kpi{padding:18px 16px}.card{padding:18px}section.s{padding-top:60px}.upd{flex-direction:column;align-items:flex-start;gap:4px}.opp{grid-template-columns:36px 1fr}.opp .g{grid-column:2;text-align:left}.obar{grid-column:1/3}.dn{flex-direction:column;align-items:flex-start}}
@media print{.top,.tabs,.cta,.big-cta{display:none!important}body{background:#fff}.js .rv{opacity:1!important;transform:none!important}.hero,.end,.msg{-webkit-print-color-adjust:exact;print-color-adjust:exact}.card,.in-card,.kpi,.topic,.ucard,.upd{break-inside:avoid;box-shadow:none}.hero{padding-top:30px}.brow .bar i,.band .tr i,.dv .fill,.meter i,.obar i,.wd .col{transition:none;width:var(--w)}.wd .col{height:var(--h)}section.s{padding-top:36px}}
`;
