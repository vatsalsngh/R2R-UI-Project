/* Flow Diagram Module
 * Responsibilities: fetch layout JSON, compute dynamic lane sizing, render nodes & edges, build minimap, manage pan/zoom & persistence, icon menu, accessibility.
 */
(function(){
  const CFG = Object.freeze({
    // Slightly larger again for improved readability (incremental)
    node:{ width:260, height:142, paddingV:18, wrapChars:30, lineGap:20, maxLines:5 },
  lane:{ baseHeight:190, left:130, top:50, right:3000 },
  zoom:{ min:1, max:1, step:0, storageKey:'r2rDiagramTransform' },
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
  // Zoom persistence removed

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

  // Smart pixel-based wrapping: if a single-line label nearly touches box edges, wrap by measuring text width.
  const measureCtx = document.createElement('canvas').getContext('2d');
  // Node font styling (keep in sync with CSS .node text { font-size / font-weight })
  const NODE_FONT = '600 18px "Plus Jakarta Sans", system-ui, "Segoe UI", Arial, sans-serif';
  measureCtx.font = NODE_FONT;
  function wrapLabelSmart(label, boxWidth, maxLines){
    const safePadding = 40; // leave at least 20px per side visually
    const safeWidth = boxWidth - safePadding;
    const full = String(label).trim();
    const fullWidth = measureCtx.measureText(full).width;
    // If it comfortably fits, keep single line
    if(fullWidth <= safeWidth) return [full];
    const words = full.split(/\s+/);
    const lines=[]; let current='';
    for(const w of words){
      const tentative = current ? current + ' ' + w : w;
      const wWidth = measureCtx.measureText(tentative).width;
      if(wWidth <= safeWidth || !current){
        current = tentative;
      } else {
        lines.push(current);
        current = w;
        if(lines.length === maxLines) break; // safety
      }
      if(lines.length === maxLines) break;
    }
    if(current && lines.length < maxLines) lines.push(current);
    return lines.slice(0,maxLines);
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
    // Center column labels horizontally over their columns
    const colLabels=[...svg.querySelectorAll('.column-label')];
    if(colLabels.length===phases.length){
      colLabels.forEach((el,i)=>{
        el.setAttribute('x', (left + colWidth*(i+0.5)).toFixed(1));
        el.setAttribute('text-anchor','middle');
        // keep existing y if present; ensure it's slightly above lane top
        const y = Number(el.getAttribute('y')) || (top-10);
        el.setAttribute('y', y);
      });
    }
    // Right-aligned lane labels: vertically center each multi-line label within its lane
    const laneLabels=[...svg.querySelectorAll('.lane-label-text')];
    if(laneLabels.length===lanes.length){
      laneLabels.forEach((el,i)=>{
        const laneName=lanes[i];
        const center = laneY[laneName] + laneHeights[i]/2;
        const tspans=[...el.querySelectorAll('tspan')];
        // Determine available horizontal space (label area is from 0 to CFG.lane.left)
        const maxWidth = left - 10; // leave 10px padding from left edge
        // Re-wrap if current label width exceeds available area
        let bb = null;
        try { bb = el.getBBox(); } catch(_){ bb=null; }
        if(bb && bb.width > maxWidth){
          // Build full label text from existing tspans
          const full = tspans.map(t=>t.textContent.trim()).join(' ');
          const words = full.split(/\s+/).filter(Boolean);
          // Clear existing tspans and rebuild one word per line (compact words if very short)
          el.innerHTML='';
          const rebuilt=[];
          for(let w of words){
            // If last added word is very short and current word is short, merge for efficiency
            if(rebuilt.length && rebuilt.at(-1).length<=3 && w.length<=4){
              rebuilt[rebuilt.length-1] = rebuilt.at(-1)+" "+w;
            } else {
              rebuilt.push(w);
            }
          }
          rebuilt.forEach(txt=>{
            const ts=document.createElementNS('http://www.w3.org/2000/svg','tspan');
            ts.textContent=txt;
            el.appendChild(ts);
          });
        }
        const tspans2=[...el.querySelectorAll('tspan')];
        const gap = tspans2.length>4 ? 16 : (tspans2.length>2 ? 18 : 19);
        const totalHeight = (tspans2.length-1)*gap;
        const startY = center - totalHeight/2;
        tspans2.forEach((ts,j)=>{
          ts.removeAttribute('dy');
            ts.setAttribute('x','115');
            ts.setAttribute('y', String(startY + j*gap));
        });
        // After positioning, ensure label isn't clipped at left edge (font size increases widened text)
        try {
          const bb2 = el.getBBox();
          if(bb2.x < 4){
            const shift = 4 - bb2.x + 2;
            el.querySelectorAll('tspan').forEach(ts=>{
              const currentX = Number(ts.getAttribute('x')) || 115;
              ts.setAttribute('x', String(currentX + shift));
            });
          }
        } catch(_) { /* ignore if not rendered yet */ }
      });
    }

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
        const cx=cellX+24, cy=nodeY+height/2, r=24; const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',cx); c.setAttribute('cy',cy); c.setAttribute('r',r); g.classList.add('event'); g.appendChild(c); pos[n.id]={left:cx-r,right:cx+r,y:cy,type:'event',x:cx+r};
        const t=document.createElementNS('http://www.w3.org/2000/svg','text'); t.setAttribute('x', cx+32); t.setAttribute('y', cy+6); t.textContent=n.label; g.appendChild(t);
      } else if(n.type==='gateway'){
        const size=48, cx=cellX+24, cy=nodeY+height/2; const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon'); const pts=[[cx,cy-size/2],[cx+size/2,cy],[cx,cy+size/2],[cx-size/2,cy]].map(p=>p.join(',')).join(' '); poly.setAttribute('points',pts); g.classList.add('gateway'); g.appendChild(poly); pos[n.id]={left:cx-size/2,right:cx+size/2,y:cy,type:'gateway',x:cx+size/2}; const t=document.createElementNS('http://www.w3.org/2000/svg','text'); t.setAttribute('x', cx+size/2+8); t.setAttribute('y', cy+6); t.textContent=n.label; g.appendChild(t);
  } else {
        const rect=document.createElementNS('http://www.w3.org/2000/svg','rect'); rect.setAttribute('x',cellX); rect.setAttribute('y',nodeY); rect.setAttribute('width',width); rect.setAttribute('height',height); rect.setAttribute('rx',6); rect.setAttribute('ry',6); g.appendChild(rect);
        // Prefer pixel-based smart wrapping; fallback to char wrapper if needed
        let lines = wrapLabelSmart(n.label, width, maxLines);
        if(lines.length === 1){
          // If still one line but extremely long (char length criterion) use legacy char wrapping for a softer break
            if(n.label.length > wrapChars){
              lines = wrapWords(n.label, Math.max(12, Math.round(wrapChars*0.8)), maxLines);
            }
        }
        const firstY = nodeY + height/2 - ((lines.length-1)*CFG.node.lineGap/2);
        const text=document.createElementNS('http://www.w3.org/2000/svg','text'); text.setAttribute('text-anchor','middle');
        lines.forEach((ln,i)=>{ const tspan=document.createElementNS('http://www.w3.org/2000/svg','tspan'); tspan.setAttribute('x', cellX+width/2); tspan.setAttribute('y', firstY + i*CFG.node.lineGap+4); tspan.textContent=ln; text.appendChild(tspan); });
        g.appendChild(text); const title=document.createElementNS('http://www.w3.org/2000/svg','title'); title.textContent=n.label; g.appendChild(title);
        // Notes icon (top-right)
        (function(){
          const ICON_W = 26, ICON_H = 22, PAD = 8;
          const ig = document.createElementNS('http://www.w3.org/2000/svg','g');
          ig.classList.add('note-icon-svg');
          ig.setAttribute('transform', `translate(${cellX + width - ICON_W - PAD}, ${nodeY + PAD})`);
          ig.setAttribute('tabindex','0');
          ig.setAttribute('role','button');
          ig.setAttribute('aria-label', `Notes for ${n.label}`);
          const rr = document.createElementNS('http://www.w3.org/2000/svg','rect');
          rr.setAttribute('width', String(ICON_W)); rr.setAttribute('height', String(ICON_H)); rr.setAttribute('rx','6'); rr.setAttribute('ry','6'); rr.setAttribute('aria-hidden','true');
          ig.appendChild(rr);
          const tx = document.createElementNS('http://www.w3.org/2000/svg','text');
          tx.setAttribute('x', String(ICON_W/2)); tx.setAttribute('y', String(Math.round(ICON_H/2)+1)); tx.setAttribute('dominant-baseline','middle'); tx.setAttribute('text-anchor','middle'); tx.textContent='📝';
          ig.appendChild(tx);
          // Badge dot if note exists (from shared notes cache)
          try {
            const notes = window.__R2R_API__?.getCurrentNotes?.() || {};
            if (notes[n.id] && String(notes[n.id]).trim()) {
              const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
              dot.setAttribute('class','note-icon-badge');
              dot.setAttribute('cx', String(ICON_W - 2));
              dot.setAttribute('cy', '2');
              dot.setAttribute('r', '3');
              ig.appendChild(dot);
            }
          } catch(_) {}
          ig.addEventListener('click', (e)=>{ e.stopPropagation(); openNoteModal(n.id, n.label); });
          ig.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); ig.dispatchEvent(new Event('click', {bubbles:true})); }});
          g.appendChild(ig);
        })();

        // Icons row (data links) – bottom-left aligned & individually interactive (further scaled up)
        if(n.icons){
          const spacing=6; // horizontal gap between icons
          const horizontalPad = 10; // left padding inside task box
          const bottomPad = 10; // gap from bottom edge of task box
          const ICON_H = 30; // enlarged again
          const widthFor=ic=> (ic==='kpis'||ic==='persona-models'||ic==='activity-placement'?54:52);
          let iconX = cellX + horizontalPad;
          const iconY = nodeY + CFG.node.height - ICON_H - bottomPad;
          n.icons.forEach((ic,idx)=>{
            const w = widthFor(ic);
            const ig=document.createElementNS('http://www.w3.org/2000/svg','g');
            ig.classList.add('mini-icon-svg');
            ig.dataset.type=ic;
            ig.setAttribute('transform',`translate(${iconX},${iconY})`);
            ig.setAttribute('tabindex','0');
            ig.setAttribute('role','button');
            const labelMap={ 'leading-practices':'Leading Practices', 'kpis':'KPIs', 'persona-models':'Persona Models', 'activity-placement':'Activity Placement' };
            ig.setAttribute('aria-label', `${labelMap[ic]||'Data'} for ${n.label}`);
            const rr=document.createElementNS('http://www.w3.org/2000/svg','rect');
            rr.setAttribute('width', w);
            rr.setAttribute('height',ICON_H);
            rr.setAttribute('rx',10); rr.setAttribute('ry',10); rr.setAttribute('aria-hidden','true');
            ig.appendChild(rr);
            const tx=document.createElementNS('http://www.w3.org/2000/svg','text');
            tx.setAttribute('x', w/2);
            tx.setAttribute('y', Math.round(ICON_H/2));
            tx.setAttribute('dominant-baseline','middle');
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
    function segPath(sx,sy,tx,ty){
      // Straight line if nearly horizontal
      if(Math.abs(sy-ty)<4) return `M${sx},${sy} H${tx}`;
      const mid=allocateBusX((sx+tx)/2);
      let r=18; const verticalDist=Math.abs(ty-sy); if(verticalDist < (r*2+8)) r=Math.max(6, (verticalDist-4)/2);
      const dir = ty>sy ? 1 : -1;
      // Path: horizontal -> curve -> vertical -> curve -> horizontal
      // First corner ends at (mid, sy + dir*r)
      // Second corner starts at (mid, ty - dir*r)
      return `M${sx},${sy} H${mid-r} Q${mid},${sy} ${mid},${sy+dir*r} V${ty - dir*r} Q${mid},${ty} ${mid+r},${ty} H${tx}`;
    }
    flows.forEach(([a,b])=>{ const A=pos[a], B=pos[b]; if(!A||!B) return; let sx=A.right+CFG.edge.startGap, sy=A.y, tx=B.left-CFG.edge.endGap, ty=B.y; if(tx<sx){ sx=A.right+CFG.edge.startGap; tx=B.right+CFG.edge.startGap; } const d=segPath(sx,sy,tx,ty); const p=document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('class','edge'); p.setAttribute('d',d); edgesLayer.appendChild(p); });

  // Minimap removed
  updateViewport=function(){};
    window.R2R_LAYOUT={phases,lanes,nodes,flows,pos};
  }

  function applyTransform(){ svg.style.transform=`translate(${panX}px,${panY}px) scale(1)`; svg.style.transformOrigin='0 0'; updateViewport(); }

  // Zoom controls
  function setZoom(){ /* zoom disabled */ }

  host.addEventListener('wheel',e=>{ if(e.ctrlKey){ e.preventDefault(); } }, { passive:false });
  // Drag pan (middle or shift+left)
  let dragging=false,lastX=0,lastY=0; host.addEventListener('mousedown',e=>{ if(e.button===1||e.shiftKey){ dragging=true; lastX=e.clientX; lastY=e.clientY; e.preventDefault(); } });
  window.addEventListener('mousemove',e=>{ if(dragging){ panX+=e.clientX-lastX; panY+=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; applyTransform(); } }); window.addEventListener('mouseup',()=>dragging=false);
  // Keyboard shortcuts
  window.addEventListener('keydown',e=>{ if(e.target.closest('input,textarea,select,button,[contenteditable]')) return; if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){ const d=60; if(e.key==='ArrowLeft') panX+=d; if(e.key==='ArrowRight') panX-=d; if(e.key==='ArrowUp') panY+=d; if(e.key==='ArrowDown') panY-=d; applyTransform(); }});

  // Zoom buttons
  // Zoom controls removed from DOM

  // Minimap interactions
  // Minimap interactions removed

  // Icon menu (context / dblclick)
  function showIconMenu(nodeEl,node){ if(!node.icons?.length) return; iconMenu.innerHTML=''; iconMenu.setAttribute('role','menu'); node.icons.forEach(ic=>{ const b=document.createElement('button'); b.type='button'; b.setAttribute('role','menuitem'); b.textContent = ic==='leading-practices'?'Leading Practices': ic==='kpis'?'KPIs': ic==='persona-models'?'Persona Models':'Activity Placement'; b.addEventListener('click',()=>{ handleIconClick(ic,node.label); hideMenu(); }); iconMenu.appendChild(b); }); const r=nodeEl.getBoundingClientRect(); iconMenu.style.left=(r.right+4+window.scrollX)+'px'; iconMenu.style.top=(r.top+window.scrollY)+'px'; iconMenu.style.display='flex'; iconMenu.firstChild?.focus(); }
  function hideMenu(){ iconMenu.style.display='none'; }
  document.addEventListener('click',e=>{ if(!iconMenu.contains(e.target)) hideMenu(); }); window.addEventListener('keydown',e=>{ if(e.key==='Escape') hideMenu(); });

  // Fetch + render
  // Notes modal setup (created once per page)
  function ensureNoteModal(){
    if(document.getElementById('noteModalBackdrop')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'noteModalBackdrop';
    backdrop.className = 'note-modal-backdrop';
    backdrop.innerHTML = `
      <div class="note-modal" role="dialog" aria-modal="true" aria-labelledby="noteModalTitle">
        <header>
          <h3 id="noteModalTitle">Notes</h3>
          <div class="note-actions">
            <button type="button" class="btn secondary" id="noteCancelBtn">Close</button>
            <button type="button" class="btn" id="noteSaveBtn">Save</button>
          </div>
        </header>
        <textarea id="noteTextarea" placeholder="Type your notes here..."></textarea>
        <div class="status" id="noteStatus" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) hideNoteModal(); });
    window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && backdrop.style.display==='flex') hideNoteModal(); });
    document.getElementById('noteCancelBtn').addEventListener('click', hideNoteModal);
    document.getElementById('noteSaveBtn').addEventListener('click', saveNoteFromModal);
  }

  let CURRENT_NOTE_ID = null;
  function openNoteModal(nodeId, nodeLabel){
    ensureNoteModal();
    CURRENT_NOTE_ID = nodeId;
    const backdrop = document.getElementById('noteModalBackdrop');
    const title = document.getElementById('noteModalTitle');
    const textarea = document.getElementById('noteTextarea');
    const status = document.getElementById('noteStatus');
    title.textContent = `Notes – ${nodeLabel}`;
    const wsId = window.__R2R_API__?.getWorkspaceId?.();
    if(!wsId){ textarea.value=''; status.textContent='Select a workspace first (top bar).'; }
    else {
      try {
        const notes = window.__R2R_API__?.getCurrentNotes?.() || {};
        textarea.value = notes[nodeId] || '';
        status.textContent = textarea.value.trim() ? 'Loaded saved note.' : '';
      } catch(_) { textarea.value=''; status.textContent=''; }
    }
    backdrop.style.display = 'flex';
    setTimeout(()=> textarea.focus(), 0);
  }
  function hideNoteModal(){ const backdrop = document.getElementById('noteModalBackdrop'); if(backdrop) backdrop.style.display='none'; CURRENT_NOTE_ID=null; }
  function saveNoteFromModal(){
    const textarea = document.getElementById('noteTextarea');
    const status = document.getElementById('noteStatus');
    if(!CURRENT_NOTE_ID) return;
    const wsId = window.__R2R_API__?.getWorkspaceId?.();
    if(!wsId){ status.textContent = 'Select a workspace first (top bar).'; return; }
    const val = textarea.value || '';
    window.__R2R_API__?.setNote?.(CURRENT_NOTE_ID, val).then(()=>{
      status.textContent = 'Saved.';
      // Update local cache and badges
      if(window.__R2R_API__?.reloadNotesAndBadges){ window.__R2R_API__.reloadNotesAndBadges(); }
    }).catch(()=>{
      status.textContent = 'Save failed. Is the API running?';
    });
  }

  fetchLayout().then(layout=>{ render(layout); applyTransform(); ensureNoteModal(); layout.nodes.forEach(n=>{ const el=document.getElementById(n.id); if(el){ el.addEventListener('contextmenu',e=>{ e.preventDefault(); showIconMenu(el,n); }); el.addEventListener('dblclick',()=>showIconMenu(el,n)); }}); announce('Diagram loaded'); }).catch(()=>{});
})();
