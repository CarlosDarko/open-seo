// The browser half of a client report: scroll reveals, count-up numbers, the
// interactive trend chart (with each Google update drawn as a coloured,
// labelled band), the menu that follows the reading and the solid top bar.
// Plain JavaScript, no libraries. Written without template strings or
// backslashes, because it travels inside one.
export const REPORT_SCRIPT = `
(function(){
  var D=JSON.parse(document.getElementById("report-data").textContent);
  var NS="http://www.w3.org/2000/svg";
  var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function grp(n){var s=String(Math.round(Math.abs(n))),o="",i;for(i=0;i<s.length;i++){if(i>0&&(s.length-i)%3===0)o+=".";o+=s.charAt(i);}return (n<0?"-":"")+o;}
  function dec(n){return (Math.round(n*10)/10).toFixed(1).replace(".",",");}
  function dayText(iso){var p=iso.split("-");var m=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];return parseInt(p[2],10)+" "+m[parseInt(p[1],10)-1]+" "+p[0];}
  function el(name,attrs){var e=document.createElementNS(NS,name);for(var k in attrs){e.setAttribute(k,attrs[k]);}return e;}
  function each(list,fn){Array.prototype.forEach.call(list,fn);}

  /* ---------- scroll reveal and count-up ---------- */
  function countUp(node){
    var target=parseFloat(node.getAttribute("data-count"));var kind=node.getAttribute("data-kind");
    var decimals=kind==="dec"?1:0;
    function show(v){node.textContent=kind==="pct"?dec(v)+" %":(decimals?dec(v):grp(v));}
    if(reduce||isNaN(target)){show(target);return;}
    var t0=null,dur=1300;
    function step(ts){if(t0===null)t0=ts;var p=Math.min(1,(ts-t0)/dur);var e=1-Math.pow(1-p,3);show(target*e);if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }
  var seen=function(node){node.classList.add("in");each(node.querySelectorAll("[data-count]"),countUp);if(node.hasAttribute("data-count"))countUp(node);};
  if("IntersectionObserver" in window){
    var io=new IntersectionObserver(function(entries){entries.forEach(function(en){if(en.isIntersecting){seen(en.target);io.unobserve(en.target);}});},{threshold:0.12});
    each(document.querySelectorAll(".rv"),function(n){io.observe(n);});
  }else{each(document.querySelectorAll(".rv"),seen);}

  /* ---------- trend chart ---------- */
  var metric="clicks";
  var svg=document.getElementById("chart");
  var tip=document.getElementById("tip");
  var METRICS={
    clicks:{label:"Clics",key:"clicks",prev:"prevClicks",fmt:grp,invert:false},
    impressions:{label:"Impresiones",key:"impressions",prev:"prevImpressions",fmt:grp,invert:false},
    position:{label:"Posición media",key:"position",prev:"prevPosition",fmt:dec,invert:true}
  };
  var geo=null;
  var printing=false;
  function draw(){
    if(!svg||!D.daily.length)return;
    var m=METRICS[metric];
    var box=svg.getBoundingClientRect();
    var W=printing?700:Math.max(320,box.width),H=printing?290:340;
    svg.setAttribute("viewBox","0 0 "+W+" "+H);
    while(svg.firstChild)svg.removeChild(svg.firstChild);
    var padL=50,padR=14,padT=34,padB=30;
    var pts=D.daily;var showPrev=D.comparable;var vals=[];
    pts.forEach(function(p){vals.push(p[m.key]);if(showPrev&&p[m.prev]!==null)vals.push(p[m.prev]);});
    var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals);
    if(metric!=="position"){lo=0;}
    if(hi===lo){hi=lo+1;}
    var span=hi-lo;hi+=span*0.08;if(metric==="position"){lo=Math.max(0,lo-span*0.08);}
    function X(i){return padL+(pts.length===1?0:i*(W-padL-padR)/(pts.length-1));}
    function Y(v){var t=(v-lo)/(hi-lo);if(m.invert)t=1-t;return padT+(1-t)*(H-padT-padB);}
    var ticks=4,i;
    for(i=0;i<=ticks;i++){
      var v=lo+(hi-lo)*i/ticks;var y=Y(v);
      svg.appendChild(el("line",{x1:padL,x2:W-padR,y1:y,y2:y,stroke:"#d9d9db","stroke-width":1}));
      var t=el("text",{x:padL-8,y:y+4,"text-anchor":"end","font-size":11.5,fill:"#6a6a72"});t.textContent=m.fmt(v);svg.appendChild(t);
    }
    var every=Math.max(1,Math.ceil(pts.length/Math.max(2,Math.floor((W-padL-padR)/78))));
    pts.forEach(function(p,idx){if(idx%every===0){var tx=el("text",{x:X(idx),y:H-9,"text-anchor":idx===0?"start":"middle","font-size":11.5,fill:"#6a6a72"});tx.textContent=dayText(p.date).slice(0,-5);svg.appendChild(tx);}});
    /* Google updates: coloured band, edge lines and a label chip */
    D.updates.forEach(function(u){
      var a=0,b=pts.length-1,k;
      for(k=0;k<pts.length;k++){if(pts[k].date>=u.begin){a=k;break;}}
      var endDay=u.end||pts[pts.length-1].date;
      for(k=pts.length-1;k>=0;k--){if(pts[k].date<=endDay){b=k;break;}}
      if(b<a)return;
      var x1=X(a),x2=Math.max(x1+4,X(b));
      svg.appendChild(el("rect",{x:x1,y:padT,width:x2-x1,height:H-padT-padB,fill:u.color,opacity:0.13}));
      svg.appendChild(el("line",{x1:x1,x2:x1,y1:padT,y2:H-padB,stroke:u.color,"stroke-width":1.6}));
      svg.appendChild(el("line",{x1:x2,x2:x2,y1:padT,y2:H-padB,stroke:u.color,"stroke-width":1.6,"stroke-dasharray":"4 4"}));
      var label=u.short+(u.end?"":" (en curso)");var cw=label.length*7.2+22;
      var cx=Math.min(Math.max(x1,padL),W-padR-cw);
      svg.appendChild(el("rect",{x:cx,y:8,width:cw,height:20,rx:10,fill:u.color}));
      var lt=el("text",{x:cx+cw/2,y:22,"text-anchor":"middle","font-size":11.5,"font-weight":700,fill:"#fff"});lt.textContent=label;svg.appendChild(lt);
    });
    function path(key){var d="",open=false;pts.forEach(function(p,idx){var val=p[key];if(val===null||val===undefined){open=false;return;}d+=(open?"L":"M")+X(idx).toFixed(1)+" "+Y(val).toFixed(1);open=true;});return d;}
    if(showPrev){svg.appendChild(el("path",{d:path(m.prev),fill:"none",stroke:"#6a6a72","stroke-width":1.8,"stroke-dasharray":"5 5",opacity:0.8}));}
    var line=path(m.key);
    var defs=el("defs",{});var grad=el("linearGradient",{id:"fillg",x1:0,y1:0,x2:0,y2:1});
    grad.appendChild(el("stop",{offset:"0%","stop-color":"#f11c41","stop-opacity":0.28}));grad.appendChild(el("stop",{offset:"100%","stop-color":"#f11c41","stop-opacity":0}));defs.appendChild(grad);svg.appendChild(defs);
    if(metric!=="position"){svg.appendChild(el("path",{d:line+"L"+X(pts.length-1).toFixed(1)+" "+Y(lo)+"L"+X(0).toFixed(1)+" "+Y(lo)+"Z",fill:"url(#fillg)"}));}
    svg.appendChild(el("path",{d:line,fill:"none",stroke:"#f11c41","stroke-width":2.8,"stroke-linejoin":"round","stroke-linecap":"round"}));
    var cur=el("line",{x1:0,x2:0,y1:padT,y2:H-padB,stroke:"#1a1a1a","stroke-width":1,opacity:0});svg.appendChild(cur);
    var dot=el("circle",{r:5.5,fill:"#f11c41",stroke:"#fff","stroke-width":2.5,opacity:0});svg.appendChild(dot);
    geo={X:X,Y:Y,cur:cur,dot:dot};
  }
  function hover(ev){
    if(!geo)return;var m=METRICS[metric];
    var box=svg.getBoundingClientRect();
    var cx=(ev.touches?ev.touches[0].clientX:ev.clientX)-box.left;
    var pts=D.daily;var best=0,bd=1e9,i;
    for(i=0;i<pts.length;i++){var dd=Math.abs(geo.X(i)-cx);if(dd<bd){bd=dd;best=i;}}
    var p=pts[best];
    geo.cur.setAttribute("x1",geo.X(best));geo.cur.setAttribute("x2",geo.X(best));geo.cur.setAttribute("opacity",0.35);
    geo.dot.setAttribute("cx",geo.X(best));geo.dot.setAttribute("cy",geo.Y(p[m.key]));geo.dot.setAttribute("opacity",1);
    var html="<b>"+dayText(p.date)+"</b><br>"+m.label+": <b>"+m.fmt(p[m.key])+"</b>";
    if(D.comparable&&p[m.prev]!==null){html+="<br>Antes: "+m.fmt(p[m.prev]);}
    D.updates.forEach(function(u){if(u.begin<=p.date&&(u.end||p.date)>=p.date){html+="<br><span style=color:#fff;background:"+u.color+";border-radius:6px;padding:0 6px;font-size:11.5px>"+u.short+"</span> "+u.label;}});
    tip.innerHTML=html;
    var left=Math.min(Math.max(geo.X(best),90),box.width-90);
    tip.style.left=left+"px";tip.style.top=geo.Y(p[m.key])+"px";tip.style.opacity=1;
  }
  function leave(){if(!geo)return;geo.cur.setAttribute("opacity",0);geo.dot.setAttribute("opacity",0);tip.style.opacity=0;}
  if(svg){
    svg.addEventListener("mousemove",hover);svg.addEventListener("touchmove",hover);
    svg.addEventListener("mouseleave",leave);svg.addEventListener("touchend",leave);
    var tabs=document.querySelectorAll("[data-metric]");
    each(tabs,function(b){b.addEventListener("click",function(){metric=b.getAttribute("data-metric");each(tabs,function(o){o.className=o===b?"on":"";});draw();});});
    window.addEventListener("resize",draw);draw();
  }

  /* ---------- tabs, sub-tabs and links between them ---------- */
  var tabBtns=document.querySelectorAll("[data-tab]");
  var tabPanels=document.querySelectorAll("[data-panel]");
  function openTab(id,scroll){
    each(tabBtns,function(b){b.className=b.getAttribute("data-tab")===id?"on":"";});
    each(tabPanels,function(p){p.className="panel"+(p.getAttribute("data-panel")===id?" on":"");});
    if(id==="trafico")draw();
    try{history.replaceState(null,"","#"+id);}catch(e){}
    if(scroll){var pan=document.querySelector(".panels");if(pan)window.scrollTo({top:Math.max(0,pan.getBoundingClientRect().top+window.scrollY-150),behavior:reduce?"auto":"smooth"});}
  }
  each(tabBtns,function(b){b.addEventListener("click",function(){openTab(b.getAttribute("data-tab"),true);});});
  each(document.querySelectorAll("[data-go]"),function(a){
    var has=false;each(tabBtns,function(b){if(b.getAttribute("data-tab")===a.getAttribute("data-go"))has=true;});
    if(!has)a.style.display="none";a.addEventListener("click",function(ev){ev.preventDefault();openTab(a.getAttribute("data-go"),true);});});
  document.addEventListener("click",function(ev){
    var b=ev.target.closest?ev.target.closest("[data-sub]"):null;if(!b)return;
    var group=b.closest(".stg");if(!group)return;
    var id=b.getAttribute("data-sub");
    each(group.querySelectorAll("[data-sub]"),function(o){o.className=o===b?"on":"";});
    each(group.querySelectorAll("[data-sp]"),function(p){p.className="sp"+(p.getAttribute("data-sp")===id?" on":"");});
  });
  var first=window.location.hash.slice(1);
  if(first){var exists=false;each(tabBtns,function(b){if(b.getAttribute("data-tab")===first)exists=true;});if(exists)openTab(first,false);}

  /* ---------- sortable and filterable tables ---------- */
  function cellValue(row,idx,numeric){
    var c=row.cells[idx];if(!c)return null;
    var raw=c.getAttribute("data-v");
    if(raw===null||raw==="")return null;
    if(numeric){var n=parseFloat(raw);return isNaN(n)?null:n;}
    return raw.toLowerCase();
  }
  function sortTable(table,idx,numeric,dir){
    var body=table.tBodies[0];var rows=Array.prototype.slice.call(body.rows);
    rows.sort(function(a,b){
      var x=cellValue(a,idx,numeric),y=cellValue(b,idx,numeric);
      if(x===null&&y===null)return 0;
      if(x===null)return 1;
      if(y===null)return -1;
      var r=numeric?(x-y):String(x).localeCompare(String(y),"es",{sensitivity:"base"});
      return dir==="asc"?r:-r;
    });
    rows.forEach(function(r,i){r.className=i>=15?"xr":"";body.appendChild(r);});
  }
  each(document.querySelectorAll("table.sortable"),function(table){
    var heads=table.tHead.rows[0].cells;
    each(heads,function(h,idx){
      var numeric=h.getAttribute("data-t")==="num";
      h.setAttribute("tabindex","0");h.setAttribute("role","button");
      function go(){
        var dir=h.classList.contains("asc")?"desc":(h.classList.contains("desc")?"asc":(h.getAttribute("data-first")==="asc"?"asc":(numeric?"desc":"asc")));
        each(heads,function(o){o.classList.remove("asc");o.classList.remove("desc");});
        h.classList.add(dir);sortTable(table,idx,numeric,dir);
      }
      h.addEventListener("click",go);
      h.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();go();}});
    });
  });
  each(document.querySelectorAll(".flt"),function(input){
    input.addEventListener("input",function(){
      var wrap=input.closest(".tw");if(!wrap)return;
      var q=input.value.trim().toLowerCase();var shown=0;
      each(wrap.querySelectorAll("tbody tr"),function(r){
        var hit=!q||r.textContent.toLowerCase().indexOf(q)>-1;
        r.style.display=hit?"":"none";if(hit)shown++;
      });
      var cnt=wrap.querySelector(".cnt");
      if(cnt)cnt.textContent=q?grp(shown)+" de "+grp(parseInt(cnt.getAttribute("data-total"),10))+" filas":grp(shown)+" filas";
    });
  });

  /* ---------- top bar and menu ---------- */
  var bar=document.getElementById("top");
  var totop=document.getElementById("totop");
  if(totop)totop.addEventListener("click",function(){window.scrollTo({top:0,behavior:reduce?"auto":"smooth"});});
  function onScroll(){
    if(bar)bar.className=window.scrollY>40?"top solid":"top";
    if(totop)totop.className=window.scrollY>700?"totop show":"totop";
  }
  window.addEventListener("scroll",onScroll,{passive:true});onScroll();
  window.addEventListener("beforeprint",function(){
    each(document.querySelectorAll(".rv"),function(n){n.classList.add("in");});
    each(document.querySelectorAll("[data-count]"),function(n){
      var t=parseFloat(n.getAttribute("data-count"));var k=n.getAttribute("data-kind");
      if(!isNaN(t))n.textContent=k==="pct"?dec(t)+" %":(k==="dec"?dec(t):grp(t));
    });
    each(document.querySelectorAll("details"),function(d){d.open=true;});
    printing=true;draw();
  });
  window.addEventListener("afterprint",function(){printing=false;draw();});
})();
`;
