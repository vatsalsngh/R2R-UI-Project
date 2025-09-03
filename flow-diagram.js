/* Flow Diagram Module
 * Responsibilities: fetch layout JSON, compute dynamic lane sizing, render nodes & edges, build minimap, manage pan/zoom & persistence, icon menu, accessibility.
 */
(function(){
  const CFG = Object.freeze({
    node:{ width:150, height:72, paddingV:8, wrapChars:18, lineGap:12, maxLines:4 },
    lane:{ baseHeight:110, left:130, top:50, right:2510 },
    zoom:{ min:0.4, max:2.5, step:0.15, storageKey:'r2rDiagramTransform' },
    edge:{ startGap:6, endGap:12, tolerance:10, busSpacing:14 },
    minimap:{ pad:80, defaultScale:0.06 }
  });
  const qs = sel => document.querySelector(sel);
  const svg = qs('#mainSvg'); if(!svg) return; // not on this page
  const nodesLayer = qs('#nodes-layer');
  const edgesLayer = qs('#edges-layer');
  const iconMenu = qs('#iconMenu');
  const host = qs('#diagramHost');
  const miniMapSvg = qs('#miniMapSvg');
  let zoom=1, panX=0, panY=0, miniScale=CFG.minimap.defaultScale, updateViewport=()=>{};

  // Restore transform
  try{ const saved = JSON.parse(localStorage.getItem(CFG.zoom.storageKey)||'null'); if(saved){ zoom=+saved.zoom||1; panX=+saved.panX||0; panY=+saved.panY||0; } }catch{}

  const fetchLayout = async () => {
    try {
      const resp = await fetch('data/r2r-layout.json');
      if(!resp.ok) throw new Error('Layout fetch failed');
      return await resp.json();
    } catch(e){ console.error(e); announce('Failed to load layout'); throw e; }
  };

  // Live region for accessibility announcements
  let live = document.getElementById('diagram-live');
  if(!live){ live=document.createElement('div'); live.id='diagram-live'; live.setAttribute('aria-live','polite'); live.className='visually-hidden'; document.body.appendChild(live); }
  function announce(msg){ live.textContent=msg; }

  function wrapWords(label,maxChars,maxLines){
    const words = String(label).split(/\s+/); const lines=[]; let line='';
    words.forEach(w=>{ if(!line) line=w; else if((line+' '+w).length<=maxChars) line+=' '+w; else { lines.push(line); line=w; } });
    if(line) lines.push(line); return lines.slice(0,maxLines);
  }

  function computeLaneHeights(phases, lanes, nodes){
    const { baseHeight } = CFG.lane; const { height, paddingV } = CFG.node;
    const cellMap={}; nodes.forEach(n=>{ const k=n.phase+'__'+n.lane; (cellMap[k]||(cellMap[k]=[])).push(n); });
    return lanes.map(lane=>{
      let needed=baseHeight; phases.forEach(ph=>{ const arr=cellMap[ph+'__'+lane]; if(arr){ const h=arr.length*height + (arr.length+1)*paddingV; if(h>needed) needed=h; } });
      return needed;
    });
  }

  function render(layout){
    const { phases, lanes, nodes, flows } = layout;
    const { left, top, right } = CFG.lane; const colWidth=(right-left)/phases.length;
    const laneHeights = computeLaneHeights(phases,lanes,nodes);
    const laneY={}; let cy=top; lanes.forEach((l,i)=>{ laneY[l]=cy; cy+=laneHeights[i]; });
    // Adjust viewBox height
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number); if(vb.length===4){ const desired = Math.max(vb[3], (cy-top)+60); if(desired!==vb[3]){ vb[3]=desired; svg.setAttribute('viewBox', vb.join(' ')); }}
    // Clean static backgrounds
    svg.querySelectorAll('.lane-bg, .lane-sep, .col-sep').forEach(el=>el.remove());
    const rootGroup = svg.querySelector('g');
    // Lane backgrounds
    lanes.forEach((lane,i)=>{ const r=document.createElementNS('http://www.w3.org/2000/svg','rect'); r.setAttribute('class','lane-bg'); r.setAttribute('x',left); r.setAttribute('y',laneY[lane]); r.setAttribute('width', right-left); r.setAttribute('height', laneHeights[i]); rootGroup.insertBefore(r, rootGroup.firstChild); });
    // Lane separators
    lanes.forEach((lane,i)=>{ const y=laneY[lane]; const ln=document.createElementNS('http://www.w3.org/2000/svg','line'); ln.setAttribute('class','lane-sep'); ln.setAttribute('x1',left); ln.setAttribute('x2',right); ln.setAttribute('y1',y); ln.setAttribute('y2',y); rootGroup.appendChild(ln); if(i===lanes.length-1){ const b=document.createElementNS('http://www.w3.org/2000/svg','line'); b.setAttribute('class','lane-sep'); b.setAttribute('x1',left); b.setAttribute('x2',right); b.setAttribute('y1', y+laneHeights[i]); b.setAttribute('y2', y+laneHeights[i]); rootGroup.appendChild(b);} });
    // Column separators
    for(let c=0;c<=phases.length;c++){ const x = left + c*colWidth; const l=document.createElementNS('http://www.w3.org/2000/svg','line'); l.setAttribute('class','col-sep'); l.setAttribute('x1',x); l.setAttribute('x2',x); l.setAttribute('y1',top); l.setAttribute('y2', laneY[lanes.at(-1)]+laneHeights.at(-1)); rootGroup.appendChild(l); }
    // Align lane labels
    const labels=[...svg.querySelectorAll('.lane-label-text')]; if(labels.length===lanes.length){ labels.forEach((el,i)=>{ const center=laneY[lanes[i]]+laneHeights[i]/2; const tsp=[...el.querySelectorAll('tspan')]; const g=12; const start=center - (tsp.length-1)*g/2; tsp.forEach((ts,j)=>{ ts.removeAttribute('dy'); ts.setAttribute('x','75'); ts.setAttribute('y', start + j*g); }); }); }

    nodesLayer.innerHTML=''; edgesLayer.innerHTML='';
    const pos={};
    const cellMap={}; nodes.forEach(n=>{ const k=n.phase+'__'+n.lane; (cellMap[k]||(cellMap[k]=[])).push(n); });
    // Sort siblings deterministic
    Object.values(cellMap).forEach(arr=>arr.sort((a,b)=>a.label.localeCompare(b.label)));

    nodes.forEach(n=>{
      const pIndex=phases.indexOf(n.phase); const lIndex=lanes.indexOf(n.lane); if(pIndex<0||lIndex<0) return;
      const siblings=cellMap[n.phase+'__'+n.lane]; const idx=siblings.indexOf(n);
      const laneTop=laneY[n.lane]; const laneH=laneHeights[lIndex];
      const cellX= left + pIndex*colWidth + 20; const { width, height, paddingV, wrapChars, lineGap, maxLines } = CFG.node;
      const neededH = siblings.length*height + (siblings.length+1)*paddingV; const cellTop = laneTop + (laneH - neededH)/2; const nodeY = cellTop + paddingV + idx*(height+paddingV);
      const g=document.createElementNS('http://www.w3.org/2000/svg','g'); g.setAttribute('id',n.id); g.setAttribute('tabindex','0'); g.setAttribute('role','group'); g.setAttribute('aria-label', n.label + (n.icons?.length? ', has data links':''));
      g.classList.add('node'); if(n.highlight) g.classList.add('highlight');
      g.addEventListener('keydown',e=>{ if(e.key==='Enter') g.click(); if(e.key===' '){ e.preventDefault(); g.click(); }});
      if(n.type==='event'){
        const cx=cellX+20, cy=nodeY+height/2, r=18; const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',cx); c.setAttribute('cy',cy); c.setAttribute('r',r); g.classList.add('event'); g.appendChild(c); pos[n.id]={left:cx-r,right:cx+r,y:cy,type:'event',x:cx+r};
        const t=document.createElementNS('http://www.w3.org/2000/svg','text'); t.setAttribute('x', cx+25); t.setAttribute('y', cy+4); t.textContent=n.label; g.appendChild(t);
      } else if(n.type==='gateway'){
        const size=38, cx=cellX+20, cy=nodeY+height/2; const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon'); const pts=[[cx,cy-size/2],[cx+size/2,cy],[cx,cy+size/2],[cx-size/2,cy]].map(p=>p.join(',')).join(' '); poly.setAttribute('points',pts); g.classList.add('gateway'); g.appendChild(poly); pos[n.id]={left:cx-size/2,right:cx+size/2,y:cy,type:'gateway',x:cx+size/2}; const t=document.createElementNS('http://www.w3.org/2000/svg','text'); t.setAttribute('x', cx+size/2+5); t.setAttribute('y', cy+4); t.textContent=n.label; g.appendChild(t);
      } else {
        const rect=document.createElementNS('http://www.w3.org/2000/svg','rect'); rect.setAttribute('x',cellX); rect.setAttribute('y',nodeY); rect.setAttribute('width',width); rect.setAttribute('height',height); rect.setAttribute('rx',6); rect.setAttribute('ry',6); g.appendChild(rect);
        const lines=wrapWords(n.label,wrapChars,maxLines); const firstY = nodeY + height/2 - ((lines.length-1)*CFG.node.lineGap/2);
        const text=document.createElementNS('http://www.w3.org/2000/svg','text'); text.setAttribute('text-anchor','middle');
        lines.forEach((ln,i)=>{ const tspan=document.createElementNS('http://www.w3.org/2000/svg','tspan'); tspan.setAttribute('x', cellX+width/2); tspan.setAttribute('y', firstY + i*CFG.node.lineGap+4); tspan.textContent=ln; text.appendChild(tspan); });
        g.appendChild(text); const title=document.createElementNS('http://www.w3.org/2000/svg','title'); title.textContent=n.label; g.appendChild(title);
        // Icons row (data links) – centered & individually interactive
        if(n.icons){
          const spacing=4;
            const widthFor=ic=> (ic==='kpis'||ic==='persona-models'||ic==='activity-placement'?30:28);
            const iconWidths = n.icons.map(widthFor);
            const total = iconWidths.reduce((a,b)=>a+b,0) + spacing*(iconWidths.length-1);
            let iconX = cellX + (width - total)/2;
            n.icons.forEach((ic,idx)=>{
              const w = iconWidths[idx];
              const ig=document.createElementNS('http://www.w3.org/2000/svg','g');
              ig.classList.add('mini-icon-svg');
              ig.dataset.type=ic;
              ig.setAttribute('transform',`translate(${iconX},${nodeY+height-18})`);
              ig.setAttribute('tabindex','0');
              ig.setAttribute('role','button');
              const labelMap={ 'leading-practices':'Leading Practices', 'kpis':'KPIs', 'persona-models':'Persona Models', 'activity-placement':'Activity Placement' };
              ig.setAttribute('aria-label', `${labelMap[ic]||'Data'} for ${n.label}`);
              const rr=document.createElementNS('http://www.w3.org/2000/svg','rect');
              rr.setAttribute('width', w);
              rr.setAttribute('height',16);
              rr.setAttribute('rx',9); rr.setAttribute('ry',9); rr.setAttribute('aria-hidden','true');
              ig.appendChild(rr);
              const tx=document.createElementNS('http://www.w3.org/2000/svg','text');
              tx.setAttribute('x', w/2);
              tx.setAttribute('y',8);
              tx.setAttribute('text-anchor','middle');
              tx.textContent= ic==='leading-practices'?'LP': ic==='kpis'?'KPI': ic==='persona-models'?'PM': ic==='activity-placement'?'AP':'';
              ig.appendChild(tx);
              ig.addEventListener('click',e=>{ e.stopPropagation(); handleIconClick(ic, n.label); announce('Opened '+ic+' table for '+n.label); });
              ig.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); ig.click(); }});
              g.appendChild(ig);
              iconX += w + spacing;
            });
        }
        pos[n.id]={left:cellX,right:cellX+width,y:nodeY+height/2,type:'task',x:cellX+width};
      }
      g.addEventListener('click',()=>{ if(n.icons?.length){ handleIconClick(n.icons[0], n.label); announce('Opened '+n.icons[0]+' table for '+n.label); }});
      nodesLayer.appendChild(g);
    });

    // Edges
    const usedBusX=[]; function allocateBusX(desired){ let x=desired, i=0; while(usedBusX.some(b=>Math.abs(b-x)<CFG.edge.tolerance)){ i++; x=desired + i*CFG.edge.busSpacing; } usedBusX.push(x); return x; }
    function segPath(sx,sy,tx,ty){ if(Math.abs(sy-ty)<4) return `M${sx},${sy} H${tx}`; const mid=allocateBusX((sx+tx)/2); return `M${sx},${sy} H${mid} V${ty} H${tx}`; }
    flows.forEach(([a,b])=>{ const A=pos[a], B=pos[b]; if(!A||!B) return; let sx=A.right+CFG.edge.startGap, sy=A.y, tx=B.left-CFG.edge.endGap, ty=B.y; if(tx<sx){ sx=A.right+CFG.edge.startGap; tx=B.right+CFG.edge.startGap; } const d=segPath(sx,sy,tx,ty); const p=document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('class','edge'); p.setAttribute('d',d); edgesLayer.appendChild(p); });

    // Minimap
    miniMapSvg.innerHTML=''; const mmGroup=document.createElementNS('http://www.w3.org/2000/svg','g');
    const vb2 = svg.getAttribute('viewBox').split(/\s+/).map(Number); const fullW=vb2[2], fullH=vb2[3];
    if(miniMapSvg.clientWidth){ const mmW=miniMapSvg.clientWidth, mmH=miniMapSvg.clientHeight||120; miniScale = Math.min(mmW/(fullW+CFG.minimap.pad), mmH/(fullH+CFG.minimap.pad)); }
    mmGroup.setAttribute('transform',`scale(${miniScale})`);
    edgesLayer.querySelectorAll('path').forEach(p=>{ const c=p.cloneNode(false); c.setAttribute('stroke-width','4'); mmGroup.appendChild(c); });
    nodesLayer.querySelectorAll('rect,circle,polygon').forEach(el=>{ const c=el.cloneNode(false); c.setAttribute('fill','none'); c.setAttribute('stroke','var(--accent)'); mmGroup.appendChild(c); });
    miniMapSvg.appendChild(mmGroup);
    const viewport=document.createElementNS('http://www.w3.org/2000/svg','rect'); viewport.setAttribute('class','mini-map-viewport'); miniMapSvg.appendChild(viewport);
    updateViewport=function(){ const w= host.clientWidth/zoom * miniScale; const h= host.clientHeight/zoom * miniScale; viewport.setAttribute('x',(-panX)*miniScale/zoom); viewport.setAttribute('y',(-panY)*miniScale/zoom); viewport.setAttribute('width', w); viewport.setAttribute('height', h); };
    updateViewport();
    window.R2R_LAYOUT={phases,lanes,nodes,flows,pos};
  }

  function applyTransform(){ svg.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`; svg.style.transformOrigin='0 0'; updateViewport(); try{ localStorage.setItem(CFG.zoom.storageKey, JSON.stringify({zoom,panX,panY})); }catch{}
  }

  // Zoom controls
  function setZoom(target,cx,cy){ const prev=zoom; zoom=Math.min(CFG.zoom.max, Math.max(CFG.zoom.min, target)); if(zoom!==prev){ if(cx!=null&&cy!=null){ panX = cx - (cx-panX)*(zoom/prev); panY = cy - (cy-panY)*(zoom/prev); } applyTransform(); announce(`Zoom ${Math.round(zoom*100)} percent`); } }

  host.addEventListener('wheel',e=>{ if(e.ctrlKey){ e.preventDefault(); setZoom(zoom + (-e.deltaY*0.001), e.clientX - svg.getBoundingClientRect().left, e.clientY - svg.getBoundingClientRect().top); } }, { passive:false });
  // Drag pan (middle or shift+left)
  let dragging=false,lastX=0,lastY=0; host.addEventListener('mousedown',e=>{ if(e.button===1||e.shiftKey){ dragging=true; lastX=e.clientX; lastY=e.clientY; e.preventDefault(); } });
  window.addEventListener('mousemove',e=>{ if(dragging){ panX+=e.clientX-lastX; panY+=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; applyTransform(); } }); window.addEventListener('mouseup',()=>dragging=false);
  // Keyboard shortcuts
  window.addEventListener('keydown',e=>{ if(e.target.closest('input,textarea,select,button,[contenteditable]')) return; if(e.key==='+'|| (e.key==='='&&e.ctrlKey)) setZoom(zoom+CFG.zoom.step); else if(e.key==='-'|| (e.key==='_'&&e.ctrlKey)) setZoom(zoom-CFG.zoom.step); else if(e.key==='0'&&e.ctrlKey){ zoom=1; panX=0; panY=0; applyTransform(); } else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){ const d=60/zoom; if(e.key==='ArrowLeft') panX+=d; if(e.key==='ArrowRight') panX-=d; if(e.key==='ArrowUp') panY+=d; if(e.key==='ArrowDown') panY-=d; applyTransform(); }});

  // Zoom buttons
  host.querySelectorAll('.zoom-controls button').forEach(btn=> btn.addEventListener('click',()=>{ const act=btn.dataset.zoom; if(act==='in') setZoom(zoom+CFG.zoom.step); else if(act==='out') setZoom(zoom-CFG.zoom.step); else { zoom=1; panX=0; panY=0; applyTransform(); announce('Reset zoom'); } }));

  // Minimap interactions
  let miniDrag=false; function miniMove(evt){ const r=miniMapSvg.getBoundingClientRect(); const mx=evt.clientX-r.left, my=evt.clientY-r.top; const targetX=mx/miniScale, targetY=my/miniScale; const viewW=host.clientWidth/zoom, viewH=host.clientHeight/zoom; panX=-(targetX - viewW/2); panY=-(targetY - viewH/2); applyTransform(); }
  miniMapSvg.addEventListener('mousedown',e=>{ miniDrag=true; miniMove(e); }); window.addEventListener('mousemove',e=>{ if(miniDrag) miniMove(e); }); window.addEventListener('mouseup',()=>miniDrag=false);

  // Icon menu (context / dblclick)
  function showIconMenu(nodeEl,node){ if(!node.icons?.length) return; iconMenu.innerHTML=''; iconMenu.setAttribute('role','menu'); node.icons.forEach(ic=>{ const b=document.createElement('button'); b.type='button'; b.setAttribute('role','menuitem'); b.textContent = ic==='leading-practices'?'Leading Practices': ic==='kpis'?'KPIs': ic==='persona-models'?'Persona Models':'Activity Placement'; b.addEventListener('click',()=>{ handleIconClick(ic,node.label); hideMenu(); }); iconMenu.appendChild(b); }); const r=nodeEl.getBoundingClientRect(); iconMenu.style.left=(r.right+4+window.scrollX)+'px'; iconMenu.style.top=(r.top+window.scrollY)+'px'; iconMenu.style.display='flex'; iconMenu.firstChild?.focus(); }
  function hideMenu(){ iconMenu.style.display='none'; }
  document.addEventListener('click',e=>{ if(!iconMenu.contains(e.target)) hideMenu(); }); window.addEventListener('keydown',e=>{ if(e.key==='Escape') hideMenu(); });

  // Fetch + render
  fetchLayout().then(layout=>{ render(layout); applyTransform(); layout.nodes.forEach(n=>{ const el=document.getElementById(n.id); if(el){ el.addEventListener('contextmenu',e=>{ e.preventDefault(); showIconMenu(el,n); }); el.addEventListener('dblclick',()=>showIconMenu(el,n)); }}); announce('Diagram loaded'); }).catch(()=>{});
})();
