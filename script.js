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
});
