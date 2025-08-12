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

function handleIconClick(type, pageName) {
    const fileMap = {
        kpi: 'data/kpi.csv',
        analysis: 'data/analysis.csv',
        data: 'data/data.csv',
        others: 'data/others.csv'
    };
    const headingMap = {
        kpi: 'KPI',
        analysis: 'Analysis',
        data: 'Data',
        others: 'Others'
    };
    const file = fileMap[type];
    const heading = headingMap[type];
    if (!file) return;
    fetch(file)
        .then(resp => resp.text())
        .then(text => {
            const data = parseCSV(text);
            const container = document.getElementById('table-container');
            renderTable(container, heading, data, pageName);
        });
}

document.addEventListener('DOMContentLoaded', function() {
    const iconBtns = document.querySelectorAll('.icon-btn');
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
                handleIconClick(btn.getAttribute('data-type'), pageName);
            });
        });
    }
});
