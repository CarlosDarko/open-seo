// The browser half of a client report: the interactive trend chart, the
// ticking of the checklist (saved on the server), the task filters and the
// highlighted section in the menu. Plain JavaScript, no libraries. Written
// without template strings or backslashes, because it travels inside one.
export const REPORT_SCRIPT = `
(function(){
  var D=JSON.parse(document.getElementById("report-data").textContent);
  var CFG=D.cfg;
  var NS="http://www.w3.org/2000/svg";
  function grp(n){var s=String(Math.round(Math.abs(n))),o="",i;for(i=0;i<s.length;i++){if(i>0&&(s.length-i)%3===0)o+=".";o+=s.charAt(i);}return (n<0?"-":"")+o;}
  function dec(n){return (Math.round(n*10)/10).toFixed(1).replace(".",",");}
  function dayText(iso){var p=iso.split("-");var m=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];return parseInt(p[2],10)+" "+m[parseInt(p[1],10)-1]+" "+p[0];}
  function el(name,attrs){var e=document.createElementNS(NS,name);for(var k in attrs){e.setAttribute(k,attrs[k]);}return e;}

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
  function draw(){
    if(!svg||!D.daily.length)return;
    var m=METRICS[metric];
    var box=svg.getBoundingClientRect();
    var W=Math.max(320,box.width),H=300;
    svg.setAttribute("viewBox","0 0 "+W+" "+H);
    while(svg.firstChild)svg.removeChild(svg.firstChild);
    var padL=48,padR=14,padT=14,padB=28;
    var pts=D.daily;
    var showPrev=D.comparable;
    var vals=[];
    pts.forEach(function(p){vals.push(p[m.key]);if(showPrev&&p[m.prev]!==null)vals.push(p[m.prev]);});
    var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals);
    if(metric!=="position"){lo=0;}
    if(hi===lo){hi=lo+1;}
    var span=hi-lo;hi+=span*0.08;if(metric==="position"){lo=Math.max(0,lo-span*0.08);}
    function X(i){return padL+(pts.length===1?0:i*(W-padL-padR)/(pts.length-1));}
    function Y(v){var t=(v-lo)/(hi-lo);if(m.invert)t=1-t;return padT+(1-t)*(H-padT-padB);}
    var g;var ticks=4,i;
    for(i=0;i<=ticks;i++){
      var v=lo+(hi-lo)*i/ticks;var y=Y(v);
      svg.appendChild(el("line",{x1:padL,x2:W-padR,y1:y,y2:y,stroke:"var(--line)","stroke-width":1}));
      var t=el("text",{x:padL-8,y:y+4,"text-anchor":"end","font-size":11,fill:"var(--muted)"});t.textContent=m.fmt(v);svg.appendChild(t);
    }
    var every=Math.max(1,Math.round(pts.length/6));
    pts.forEach(function(p,idx){if(idx%every===0||idx===pts.length-1){var tx=el("text",{x:X(idx),y:H-8,"text-anchor":idx===0?"start":(idx===pts.length-1?"end":"middle"),"font-size":11,fill:"var(--muted)"});tx.textContent=dayText(p.date).slice(0,-5);svg.appendChild(tx);}});
    /* Google updates as shaded bands */
    var dateIdx={};pts.forEach(function(p,idx){dateIdx[p.date]=idx;});
    D.updates.forEach(function(u){
      var a=0,b=pts.length-1,k;
      for(k=0;k<pts.length;k++){if(pts[k].date>=u.begin){a=k;break;}}
      var endDay=u.end||pts[pts.length-1].date;
      for(k=pts.length-1;k>=0;k--){if(pts[k].date<=endDay){b=k;break;}}
      if(b<a)return;
      svg.appendChild(el("rect",{x:X(a),y:padT,width:Math.max(3,X(b)-X(a)),height:H-padT-padB,fill:"var(--warn)",opacity:0.13}));
      svg.appendChild(el("line",{x1:X(a),x2:X(a),y1:padT,y2:H-padB,stroke:"var(--warn)","stroke-width":1.5,"stroke-dasharray":"3 3"}));
    });
    function path(key){var d="",open=false;pts.forEach(function(p,idx){var val=p[key];if(val===null||val===undefined){open=false;return;}d+=(open?"L":"M")+X(idx).toFixed(1)+" "+Y(val).toFixed(1);open=true;});return d;}
    if(showPrev){svg.appendChild(el("path",{d:path(m.prev),fill:"none",stroke:"var(--muted)","stroke-width":1.8,"stroke-dasharray":"5 4",opacity:0.8}));}
    var line=path(m.key);
    if(metric!=="position"){svg.appendChild(el("path",{d:line+"L"+X(pts.length-1).toFixed(1)+" "+Y(lo)+"L"+X(0).toFixed(1)+" "+Y(lo)+"Z",fill:"var(--accent)",opacity:0.1}));}
    svg.appendChild(el("path",{d:line,fill:"none",stroke:"var(--accent)","stroke-width":2.4,"stroke-linejoin":"round","stroke-linecap":"round"}));
    var cur=el("line",{x1:0,x2:0,y1:padT,y2:H-padB,stroke:"var(--text)","stroke-width":1,opacity:0});svg.appendChild(cur);
    var dot=el("circle",{r:5,fill:"var(--accent)",stroke:"var(--card)","stroke-width":2,opacity:0});svg.appendChild(dot);
    geo={X:X,Y:Y,cur:cur,dot:dot,padL:padL,padR:padR,W:W};
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
    D.updates.forEach(function(u){if(u.begin<=p.date&&(u.end||p.date)>=p.date){html+="<br><span style=color:#fbbf24>&#9679; "+u.label+"</span>";}});
    tip.innerHTML=html;
    var left=Math.min(Math.max(geo.X(best),70),box.width-70);
    tip.style.left=left+"px";tip.style.top=geo.Y(p[m.key])+"px";tip.style.opacity=1;
  }
  function leave(){if(!geo)return;geo.cur.setAttribute("opacity",0);geo.dot.setAttribute("opacity",0);tip.style.opacity=0;}
  if(svg){
    svg.addEventListener("mousemove",hover);svg.addEventListener("touchmove",hover);
    svg.addEventListener("mouseleave",leave);svg.addEventListener("touchend",leave);
    var tabs=document.querySelectorAll("[data-metric]");
    Array.prototype.forEach.call(tabs,function(b){b.addEventListener("click",function(){metric=b.getAttribute("data-metric");Array.prototype.forEach.call(tabs,function(o){o.className=o===b?"on":"";});draw();});});
    window.addEventListener("resize",draw);draw();
  }

  /* ---------- checklist ---------- */
  var checks=D.checks;
  function counts(){var boxes=document.querySelectorAll(".task input[type=checkbox]");var done=0;Array.prototype.forEach.call(boxes,function(b){if(b.checked)done++;});return [done,boxes.length];}
  function refresh(){
    var c=counts();var bar=document.getElementById("pbar");var num=document.getElementById("pnum");
    if(bar)bar.style.width=(c[1]?c[0]*100/c[1]:0)+"%";
    if(num)num.textContent=c[0]+" de "+c[1]+" hechas";
    applyFilter();
  }
  Array.prototype.forEach.call(document.querySelectorAll(".task input[type=checkbox]"),function(b){
    b.addEventListener("change",function(){
      var card=b.closest(".task");var id=card.getAttribute("data-id");var done=b.checked;
      card.className=card.className.replace(" done","")+(done?" done":"");
      var w=card.querySelector(".when");if(w)w.textContent=done?"Marcada ahora":"";
      refresh();
      var xhr=new XMLHttpRequest();xhr.open("POST",CFG.checkUrl);xhr.setRequestHeader("content-type","application/json");
      xhr.onerror=function(){b.checked=!done;card.className=card.className.replace(" done","")+(b.checked?" done":"");refresh();};
      xhr.onload=function(){if(xhr.status>=400){b.checked=!done;card.className=card.className.replace(" done","")+(b.checked?" done":"");refresh();}};
      xhr.send(JSON.stringify({task:id,done:done,by:CFG.by}));
    });
  });
  var filter="all";
  function applyFilter(){
    Array.prototype.forEach.call(document.querySelectorAll(".task"),function(t){
      var show=true;var box=t.querySelector("input");
      if(filter==="easy")show=t.getAttribute("data-effort")==="bajo";
      if(filter==="todo")show=!box.checked;
      t.style.display=show?"":"none";
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-filter]"),function(b){b.addEventListener("click",function(){filter=b.getAttribute("data-filter");Array.prototype.forEach.call(document.querySelectorAll("[data-filter]"),function(o){o.className=o===b?"on":"";});applyFilter();});});
  refresh();

  /* ---------- menu highlight and printing ---------- */
  var links=document.querySelectorAll(".nav a");
  function spy(){
    var cur=null;Array.prototype.forEach.call(links,function(a){var s=document.getElementById(a.getAttribute("href").slice(1));if(s&&s.getBoundingClientRect().top<120)cur=a;});
    Array.prototype.forEach.call(links,function(a){a.className=a===cur?"on":"";});
  }
  window.addEventListener("scroll",spy,{passive:true});spy();
  window.addEventListener("beforeprint",function(){Array.prototype.forEach.call(document.querySelectorAll("details"),function(d){d.open=true;});draw();});
  var pb=document.getElementById("print");if(pb)pb.addEventListener("click",function(){window.print();});
})();
`;
