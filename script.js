// Simple form handler for the contact page
const form = document.getElementById('contact-form');
if (form) {
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        document.getElementById('form-message').textContent = 'Thank you for contacting us! (This is a demo.)';
        form.reset();
    });
}

// Table display for third-level pages
function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map(line => line.split(','));
    return { headers, rows };
}

function renderTable(container, heading, data, filterValue) {
    if (!data) return;
    const { headers, rows } = data;
    const filterNorm = filterValue.trim().toLowerCase();
    const filtered = rows.filter(row => (row[0] || '').trim().toLowerCase() === filterNorm);
    if (filtered.length === 0) {
        container.innerHTML = `<h2 class="table-heading">${heading}</h2><p class="empty-state">No data found.</p>`;
        return;
    }
    let html = `<h2 class="table-heading">${heading}</h2><div class="table-responsive"><table class="data-table"><thead><tr>`;
    headers.forEach(h => { html += `<th>${h}</th>`; });
    html += `</tr></thead><tbody>`;
    filtered.forEach(row => {
        html += '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Output escape to avoid XSS via CSV content
function esc(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Cache for CSV datasets keyed by file path
const CSV_CACHE = new Map();

function handleIconClick(type, pageName) {
    const fileMap = {
        'leading-practices': 'data/leading-practices.csv',
        'kpis': 'data/kpis.csv',
        'persona-models': 'data/persona-models.csv',
        'activity-placement': 'data/activity-placement.csv'
    };
    const headingMap = {
        'leading-practices': 'Leading Practices',
        'kpis': 'KPIs',
        'persona-models': 'Persona Models',
        'activity-placement': 'Activity Placement'
    };
    const file = fileMap[type];
    const heading = headingMap[type];
    if (!file) return;
    const container = document.getElementById('table-container');
    container.innerHTML = `<p style="color:var(--muted);font-size:0.9em;">Loading ${heading}…</p>`;
    (async () => {
        try {
            let dataObj;
            if (CSV_CACHE.has(file)) {
                dataObj = CSV_CACHE.get(file);
            } else {
                const resp = await fetch(file);
                if(!resp.ok) throw new Error(`Failed to load ${file}`);
                const text = await resp.text();
                dataObj = parseCSV(text);
                CSV_CACHE.set(file, dataObj);
            }
            // Escape cells on render
            const safe = { headers: dataObj.headers.map(esc), rows: dataObj.rows.map(r => r.map(esc)) };
            renderTable(container, heading, safe, pageName);
        } catch(err) {
            container.innerHTML = `<div style="color:#f87171;font-weight:600;">Error loading data: ${esc(err.message)}</div>`;
        }
    })();
}

document.addEventListener('DOMContentLoaded', function() {
    // Smooth scroll for internal nav links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const target = document.querySelector(a.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Default to dark theme (no toggle)
    document.documentElement.setAttribute('data-theme', 'dark');

    // Animated reveal for cards
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });
    document.querySelectorAll('.option-card').forEach(card => observer.observe(card));

    const iconBtns = document.querySelectorAll('.icon-btn, .mini-icon, .mini-icon-svg');
    if (iconBtns.length > 0) {
        // Determine current page name from common heading locations, fallback to document title
        const headingEl =
            document.querySelector('.hero-header h1') ||
            document.querySelector('header h1') ||
            document.querySelector('main h1') ||
            document.querySelector('h1');
        const pageName = (headingEl?.textContent || document.title || '').trim();
        iconBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const t = btn.getAttribute('data-type');
                if (t) handleIconClick(t, pageName);
            });
        });
    }

        // Wide-screen layout class injection (debounced)
        const setWideScreenFlag = () => {
            const physicalWidth = Math.round(window.innerWidth * (window.devicePixelRatio || 1));
            if (physicalWidth >= 1880 || window.innerWidth >= 1600) {
                document.body.classList.add('wide-screen');
            } else {
                document.body.classList.remove('wide-screen');
            }
            document.documentElement.dataset.physicalWidth = String(physicalWidth);
        };
        setWideScreenFlag();
        let resizeTO;
        window.addEventListener('resize', ()=>{ clearTimeout(resizeTO); resizeTO=setTimeout(setWideScreenFlag,120); }, { passive: true });
        window.addEventListener('orientationchange', setWideScreenFlag);

    // Workspace selector in top nav and API client (site-wide)
    (function(){
            const API_BASE = (window.R2R_API_BASE || 'http://localhost:5050');
            // Minimal client
            const api = {
                async getWorkspaces(){ const r = await fetch(`${API_BASE}/api/workspaces`); if(!r.ok) throw new Error('Failed to load workspaces'); return r.json(); },
                async createWorkspace(name){ const r = await fetch(`${API_BASE}/api/workspaces`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})}); if(!r.ok) throw new Error((await r.json()).error||'Create failed'); return r.json(); },
                async renameWorkspace(id, name){ const r = await fetch(`${API_BASE}/api/workspaces/${id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})}); if(!r.ok) throw new Error((await r.json()).error||'Rename failed'); return r.json(); },
                async deleteWorkspace(id){ const r = await fetch(`${API_BASE}/api/workspaces/${id}`, {method:'DELETE'}); if(!r.ok) throw new Error((await r.json()).error||'Delete failed'); return r.json(); },
                async getNotes(id){ const r = await fetch(`${API_BASE}/api/workspaces/${id}/notes`); if(!r.ok) throw new Error('Failed to load notes'); return r.json(); },
                async setNote(id, nodeId, text){ const r = await fetch(`${API_BASE}/api/workspaces/${id}/notes/${encodeURIComponent(nodeId)}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text})}); if(!r.ok) throw new Error('Save failed'); return r.json(); },
            };

                        // Simplify top-right nav to only Home, then inject Workspace control next to it
                        function setupNavShell(){
                                const nav = document.querySelector('nav.site-nav');
                                if(!nav) return;
                                const ul = nav.querySelector('ul');
                                if(ul){
                                        // Keep only the Home link
                                        [...ul.querySelectorAll('li')].forEach((li, idx)=>{
                                                const a = li.querySelector('a');
                                                const isHome = a && /index\.html(#.*)?$/.test(a.getAttribute('href')||'');
                                                if(!(idx===0 && isHome)) li.remove();
                                        });
                                }
                        }

                        // Workspace UI (nav button + dropdown panel)
                        function ensureWorkspaceNav(){
                                if(document.getElementById('wsNavBtn')) return;
                                const nav = document.querySelector('nav.site-nav');
                                const ul = nav?.querySelector('ul');
                                if(!nav || !ul) return;
                                const li = document.createElement('li');
                                li.className = 'ws-nav';
                                li.innerHTML = `
                                    <button id="wsNavBtn" class="ws-btn" aria-haspopup="true" aria-expanded="false" aria-controls="wsMenu">
                                        <span class="ws-icon" aria-hidden="true">🗂️</span>
                                        <span class="ws-label">Workspace:</span>
                                        <span id="wsCurrentName" class="ws-current">None</span>
                                        <span class="ws-caret" aria-hidden="true">▾</span>
                                    </button>
                                    <div id="wsMenu" class="ws-dropdown" role="menu" aria-hidden="true">
                                        <div class="ws-row">
                                            <label for="wsSelect" class="ws-select-label">Select workspace</label>
                                            <select id="wsSelect" class="ws-select"></select>
                                        </div>
                                        <div class="ws-actions">
                                            <button id="wsCreate" class="btn">Create</button>
                                            <button id="wsRename" class="btn">Rename</button>
                                            <button id="wsDelete" class="btn secondary">Delete</button>
                                        </div>
                                    </div>`;
                                ul.appendChild(li);

                                // Toggle dropdown
                                const btn = li.querySelector('#wsNavBtn');
                                const menu = li.querySelector('#wsMenu');
                                const closeMenu = ()=>{ menu.setAttribute('aria-hidden','true'); btn.setAttribute('aria-expanded','false'); };
                                const openMenu = ()=>{ menu.setAttribute('aria-hidden','false'); btn.setAttribute('aria-expanded','true'); };
                                btn.addEventListener('click', (e)=>{
                                        e.preventDefault();
                                        const isOpen = menu.getAttribute('aria-hidden')==='false';
                                        if(isOpen) closeMenu(); else openMenu();
                                });
                                document.addEventListener('click', (e)=>{
                                        if(!li.contains(e.target)) closeMenu();
                                });
                                window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeMenu(); });
                        }

            // Generic app modal
            function ensureAppModal(){
                if(document.getElementById('appModalBackdrop')) return;
                const backdrop = document.createElement('div');
                backdrop.id = 'appModalBackdrop'; backdrop.className='app-modal-backdrop';
                backdrop.innerHTML = `<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="appModalTitle"><header><h3 id="appModalTitle">Dialog</h3><div class="actions"><button type="button" class="btn secondary" id="appCancel">Close</button><button type="button" class="btn" id="appPrimary">OK</button></div></header><div id="appModalBody"></div><div class="message" id="appModalMsg"></div></div>`;
                document.body.appendChild(backdrop);
                backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) hideAppModal(); });
                document.getElementById('appCancel').addEventListener('click', hideAppModal);
                window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && backdrop.style.display==='flex') hideAppModal(); });
            }
            function showAppModal({ title, bodyHTML, primaryText, onPrimary }){
                ensureAppModal();
                const backdrop = document.getElementById('appModalBackdrop');
                document.getElementById('appModalTitle').textContent = title || 'Dialog';
                document.getElementById('appModalBody').innerHTML = bodyHTML || '';
                const primary = document.getElementById('appPrimary');
                primary.textContent = primaryText || 'OK';
                primary.onclick = async ()=>{ try{ await onPrimary?.(); } catch(e){ document.getElementById('appModalMsg').textContent = (e?.message)||'Action failed'; return; } };
                document.getElementById('appModalMsg').textContent = '';
                backdrop.style.display='flex';
            }
            function hideAppModal(){ const backdrop = document.getElementById('appModalBackdrop'); if(backdrop) backdrop.style.display='none'; }

            const LOCAL_KEY = 'r2r_selected_workspace';
            let currentWorkspaceId = null;
            let currentNotes = {};
            const PAGE_NOTES_KEY = 'page:maintain-finance-master-data-process-flows';

            // Ensure a page-level notes button exists on the Process Flows page (outside the diagram)
            function ensurePageNotesButton(){
                const isProcessFlows = !!document.querySelector('main.flow-page') && /Maintain Finance Master Data/i.test(document.title);
                if(!isProcessFlows) return;
                const host = document.querySelector('.diagram-wrapper');
                if(!host) return;
                // Create toolbar above diagram
                let bar = document.getElementById('flowToolbar');
                if(!bar){
                    bar = document.createElement('div');
                    bar.id = 'flowToolbar';
                    bar.className = 'flow-toolbar';
                    host.parentNode.insertBefore(bar, host);
                }
                // If a button already exists elsewhere, move it into the toolbar
                let btn = document.getElementById('pageNotesBtn');
                if(!btn){
                    btn = document.createElement('button');
                    btn.id = 'pageNotesBtn';
                    btn.className = 'page-notes-btn';
                    btn.type = 'button';
                    btn.setAttribute('title','General Notes');
                    btn.innerHTML = `<span class=\"emoji\" aria-hidden=\"true\">📝</span><span class=\"label\">Notes</span>`;
                    btn.addEventListener('click', ()=>{
                        if(!currentWorkspaceId) return; // guarded by CSS hidden state too
                        const existing = (currentNotes && currentNotes[PAGE_NOTES_KEY]) || '';
                        showAppModal({
                            title: 'General Notes',
                            bodyHTML: `<div><textarea id=\"pageNotesText\" placeholder=\"Capture feedback, discussions, pain points, decisions, etc.\">${existing.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea></div>`,
                            primaryText: 'Save',
                            onPrimary: async ()=>{
                                const text = document.getElementById('pageNotesText').value;
                                await api.setNote(currentWorkspaceId, PAGE_NOTES_KEY, text);
                                // refresh local cache & badge
                                currentNotes[PAGE_NOTES_KEY] = text;
                                updatePageNotesBadge();
                                hideAppModal();
                            }
                        });
                    });
                }
                // Ensure button is in the toolbar
                if(btn.parentElement !== bar){ bar.appendChild(btn); }
                updatePageNotesBadge();
            }

            // Ensure a Notes Summary button sits to the right of Notes
            function ensureNotesSummaryButton(){
                const isProcessFlows = !!document.querySelector('main.flow-page') && /Maintain Finance Master Data/i.test(document.title);
                if(!isProcessFlows) return;
                const bar = document.getElementById('flowToolbar');
                if(!bar) return; // created by ensurePageNotesButton
                let sBtn = document.getElementById('notesSummaryBtn');
                if(!sBtn){
                    sBtn = document.createElement('button');
                    sBtn.id = 'notesSummaryBtn';
                    sBtn.className = 'summary-btn';
                    sBtn.type = 'button';
                    sBtn.setAttribute('title','Notes Summary');
                    sBtn.innerHTML = `<span class=\"emoji\" aria-hidden=\"true\">📄</span><span class=\"label\">Summary</span>`;
                    sBtn.addEventListener('click', async ()=>{
                        if(!currentWorkspaceId) return;
                        // Load fresh notes
                        let notes = {};
                        try { notes = await api.getNotes(currentWorkspaceId); } catch { notes = currentNotes || {}; }
                        const general = (notes && notes[PAGE_NOTES_KEY]) ? String(notes[PAGE_NOTES_KEY]).trim() : '';
                        const entries = Object.entries(notes||{})
                            .filter(([k,v])=> k !== PAGE_NOTES_KEY && v && String(v).trim());
                        // Map IDs to titles using the layout if available
                        const getTitle = (id)=>{
                            const layout = window.R2R_LAYOUT;
                            if(layout && Array.isArray(layout.nodes)){
                                const n = layout.nodes.find(x=> String(x.id) === String(id));
                                return n?.title || n?.label || n?.name || n?.text || String(id);
                            }
                            return String(id);
                        };
                        const nodeNotes = entries.map(([id, text])=> ({ id, title: getTitle(id), text: String(text) }));
                        nodeNotes.sort((a,b)=> a.title.localeCompare(b.title));
                        const hasAny = !!general || nodeNotes.length>0;
                        // Build HTML (escaped)
                        const escHtml = (s)=> String(s).replace(/[&<>]/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
                        const nl2br = (s)=> escHtml(s).replace(/\n/g,'<br>');
                        let html = `<div class=\"summary-content\">`;
                        if(general){ html += `<section class=\"sum-section\"><h4>General Notes</h4><div class=\"sum-text\">${nl2br(general)}</div></section>`; }
                        if(nodeNotes.length){
                            html += `<section class=\"sum-section\"><h4>Task Notes</h4>`;
                            nodeNotes.forEach(n=>{ html += `<div class=\"sum-item\"><div class=\"sum-title\">${escHtml(n.title)}</div><div class=\"sum-text\">${nl2br(n.text)}</div></div>`; });
                            html += `</section>`;
                        }
                        if(!hasAny){ html += `<div class=\"sum-empty\">No notes found for this workspace.</div>`; }
                        html += `</div>`;
                        // Build plain text for copy
                        let plain = '';
                        if(general){ plain += `General Notes:\n${general}\n\n`; }
                        if(nodeNotes.length){
                            plain += `Task Notes:\n`;
                            nodeNotes.forEach(n=>{ plain += `- ${n.title}\n${n.text}\n\n`; });
                        }
                        showAppModal({
                            title: 'Notes Summary',
                            bodyHTML: html,
                            primaryText: 'Copy',
                            onPrimary: async ()=>{
                                try {
                                    await navigator.clipboard.writeText(plain || '');
                                    const msgEl = document.getElementById('appModalMsg');
                                    if(msgEl) msgEl.textContent = 'Summary copied to clipboard.';
                                } catch(e){
                                    throw new Error('Copy failed');
                                }
                            }
                        });
                    });
                }
                if(sBtn.parentElement !== bar){ bar.appendChild(sBtn); }
                updateSummaryButtonVisibility();
            }

            function updateSummaryButtonVisibility(){
                const btn = document.getElementById('notesSummaryBtn');
                if(!btn) return;
                if(!currentWorkspaceId) btn.classList.add('hidden'); else btn.classList.remove('hidden');
            }

            function updatePageNotesBadge(){
                const btn = document.getElementById('pageNotesBtn');
                if(!btn) return;
                // Hide when no workspace selected (CSS also hides)
                if(!currentWorkspaceId){ btn.classList.add('hidden'); return; } else { btn.classList.remove('hidden'); }
                // Badge indicator
                const has = !!(currentNotes && currentNotes[PAGE_NOTES_KEY] && String(currentNotes[PAGE_NOTES_KEY]).trim());
                let badge = btn.querySelector('.page-notes-badge');
                if(has){
                    if(!badge){
                        badge = document.createElement('span');
                        badge.className = 'page-notes-badge';
                        badge.setAttribute('aria-hidden','true');
                        btn.appendChild(badge);
                    }
                } else {
                    if(badge) badge.remove();
                }
            }

            async function loadWorkspacesAndInit(){
                setupNavShell();
                ensureWorkspaceNav();
                ensurePageNotesButton();
                const select = document.getElementById('wsSelect');
                const currentNameEl = document.getElementById('wsCurrentName');
                try {
                    const ws = await api.getWorkspaces();
                    select.innerHTML = ws.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
                    const saved = localStorage.getItem(LOCAL_KEY);
                    if(saved && ws.some(w=>String(w.id)===String(saved))){
                        select.value = String(saved); currentWorkspaceId = String(saved); const match = ws.find(w=>String(w.id)===String(saved)); currentNameEl.textContent = match?.name || 'Unnamed';
                        document.body.classList.remove('no-ws');
                        updatePageNotesBadge(); updateSummaryButtonVisibility();
                    } else if(ws.length === 0) {
                        // No workspace: show create modal
                        showAppModal({
                            title: 'Create your first workspace',
                            bodyHTML: '<form><input id="wsNameInput" placeholder="Workspace name" /></form>',
                            primaryText: 'Create',
                            onPrimary: async ()=>{
                                const name = document.getElementById('wsNameInput').value.trim();
                                if(!name) throw new Error('Please enter a name');
                                const created = await api.createWorkspace(name);
                                const newId = String(created?.id ?? '');
                                if(newId){ localStorage.setItem(LOCAL_KEY, newId); currentWorkspaceId = newId; }
                                hideAppModal();
                                await loadWorkspacesAndInit();
                            }
                        });
                        select.innerHTML = '<option value="" disabled selected>Create a workspace to begin</option>';
                        currentWorkspaceId = null; currentNameEl.textContent = 'None';
                        document.body.classList.add('no-ws');
                        updatePageNotesBadge(); updateSummaryButtonVisibility();
                    } else {
                        // Add placeholder and prompt via message (non-blocking)
                        select.insertAdjacentHTML('afterbegin','<option value="" disabled selected>Select a workspace…</option>');
                        currentWorkspaceId = null; currentNameEl.textContent = 'None';
                        document.body.classList.add('no-ws');
                        updatePageNotesBadge(); updateSummaryButtonVisibility();
                    }
                    await reloadNotesAndBadges();
                } catch(err){
                    // API offline – still wire UI and show disabled placeholder
                    select.innerHTML = '<option value="" disabled selected>API offline</option>';
                    currentWorkspaceId = null; if(currentNameEl) currentNameEl.textContent='Offline';
                    document.body.classList.add('no-ws');
                    updatePageNotesBadge(); updateSummaryButtonVisibility();
                }
                wireWorkspaceEvents();
                // Ensure summary button exists after toolbar established
                ensureNotesSummaryButton();
            }

            function wireWorkspaceEvents(){
                const select = document.getElementById('wsSelect');
                const createBtn = document.getElementById('wsCreate');
                const renameBtn = document.getElementById('wsRename');
                const deleteBtn = document.getElementById('wsDelete');
                const currentNameEl = document.getElementById('wsCurrentName');
                select.onchange = async ()=>{
                    currentWorkspaceId = select.value;
                    if(currentWorkspaceId){ document.body.classList.remove('no-ws'); }
                    else { document.body.classList.add('no-ws'); }
                    localStorage.setItem(LOCAL_KEY, currentWorkspaceId);
                    const opt = select.options[select.selectedIndex];
                    if(opt) currentNameEl.textContent = opt.textContent;
                    updatePageNotesBadge(); updateSummaryButtonVisibility();
                    await reloadNotesAndBadges();
                };
                createBtn.onclick = ()=> showAppModal({
                    title: 'Create workspace',
                    bodyHTML: '<form><input id="wsNameInput" placeholder="Workspace name" /></form>',
                    primaryText: 'Create',
                    onPrimary: async ()=>{
                        const name = document.getElementById('wsNameInput').value.trim();
                        if(!name) throw new Error('Please enter a name');
                        const created = await api.createWorkspace(name);
                        const newId = String(created?.id ?? '');
                        if(newId){ localStorage.setItem(LOCAL_KEY, newId); currentWorkspaceId = newId; }
                        hideAppModal();
                        await loadWorkspacesAndInit();
                    }
                });
                renameBtn.onclick = ()=>{ if(!currentWorkspaceId) return; const current = select.options[select.selectedIndex]?.text||''; showAppModal({ title:'Rename workspace', bodyHTML:`<form><input id="wsNameInput" value="${current.replace(/"/g,'&quot;')}" /></form>`, primaryText:'Rename', onPrimary: async ()=>{ const name = document.getElementById('wsNameInput').value.trim(); if(!name) throw new Error('Please enter a name'); await api.renameWorkspace(currentWorkspaceId, name); hideAppModal(); await loadWorkspacesAndInit(); } }); };
                deleteBtn.onclick = ()=>{
                    if(!currentWorkspaceId) return;
                    const wsName = select.options[select.selectedIndex]?.text || 'this workspace';
                    showAppModal({
                        title:'Delete workspace',
                        bodyHTML:`<p>Are you sure you want to delete <strong>${esc(wsName)}</strong> and all its notes?</p>`,
                        primaryText:'Delete',
                        onPrimary: async ()=>{ await api.deleteWorkspace(currentWorkspaceId); hideAppModal(); localStorage.removeItem(LOCAL_KEY); document.body.classList.add('no-ws'); updatePageNotesBadge(); updateSummaryButtonVisibility(); await loadWorkspacesAndInit(); }
                    });
                };
            }

            async function reloadNotesAndBadges(){
                if(!currentWorkspaceId) return;
                try { currentNotes = await api.getNotes(currentWorkspaceId); } catch { currentNotes = {}; }
                // Update badges for all nodes (if diagram already rendered)
                if(window.R2R_LAYOUT){
                    window.R2R_LAYOUT.nodes.forEach(n=>{
                        const g = document.getElementById(n.id);
                        if(!g) return;
                        const icon = g.querySelector('.note-icon-svg');
                        if(!icon) return;
                        icon.querySelectorAll('.note-icon-badge').forEach(d=>d.remove());
                        if(currentNotes && currentNotes[n.id] && String(currentNotes[n.id]).trim()){
                            const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
                            dot.setAttribute('class','note-icon-badge'); dot.setAttribute('cx','24'); dot.setAttribute('cy','2'); dot.setAttribute('r','3'); icon.appendChild(dot);
                        }
                    });
                }
                // Update page-level notes badge and summary button visibility
                updatePageNotesBadge();
                updateSummaryButtonVisibility();
            }

            // Expose API to flow-diagram.js
            window.__R2R_API__ = { api, getWorkspaceId: ()=>currentWorkspaceId, getCurrentNotes: ()=>currentNotes, reloadNotesAndBadges, setNote: (nodeId, text)=> api.setNote(currentWorkspaceId, nodeId, text) };

            // Initialize on all pages
            loadWorkspacesAndInit().catch(()=>{});

            // Auth features intentionally removed for now
        })();

        // Lazy load flow-diagram module only when diagram host approaches viewport
        const diagramHost = document.getElementById('diagramHost');
        if (diagramHost && !window.__FLOW_DIAGRAM_LAZY__) {
            if ('IntersectionObserver' in window) {
                const io = new IntersectionObserver((entries)=>{
                    if(entries[0].isIntersecting){
                        window.__FLOW_DIAGRAM_LAZY__ = true;
                        const s=document.createElement('script');
                        s.src='flow-diagram.js';
                        s.defer=true;
                        document.head.appendChild(s);
                        io.disconnect();
                    }
                }, { rootMargin: '300px' });
                io.observe(diagramHost);
            } else {
                // Fallback: load immediately
                const s=document.createElement('script'); s.src='flow-diagram.js'; s.defer=true; document.head.appendChild(s);
            }
        }
});
