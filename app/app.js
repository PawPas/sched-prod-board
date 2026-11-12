import { fetchIncidents, ack } from './api.js';

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');

// Acked rows, kept across the 2s re-renders so an ack sticks (R2).
const ackedIds = new Set();
let loaded = false;

// R5: show each incident's time in the viewer's own zone and locale. EU locales
// render dd/mm; the full UTC value stays in the <time datetime> attribute.
const fmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const localTime = (iso) => fmt.format(new Date(iso));

function rowHtml(i) {
  const action = ackedIds.has(i.id)
    ? `<span class="acked" data-testid="acked">acked</span>`
    : `<button class="ack" data-testid="ack" data-id="${i.id}">Ack</button>`;
  return `<li data-testid="incident-row" data-id="${i.id}" class="row ${i.severity}">
      <span class="id">${i.id}</span>
      <span class="sev">${i.severity}</span>
      <span class="what">${i.service} · ${i.region} · ${i.summary}</span>
      <time datetime="${i.openedAt}">${localTime(i.openedAt)}</time>
      ${action}
    </li>`;
}

// R1: the API hands back the full current list, newest first — render it each poll.
function render(incidents) {
  loaded = true;
  loader.hidden = true;
  empty.hidden = incidents.length > 0;
  list.innerHTML = incidents.map(rowHtml).join('');
}

// R2: Ack a row. Rows are re-rendered every 2s, so delegate the click.
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const id = btn.dataset.id;
  btn.disabled = true;
  try {
    await ack(id);
    ackedIds.add(id);
    btn.outerHTML = `<span class="acked" data-testid="acked">acked</span>`;
  } catch (err) {
    btn.disabled = false;
    console.error('ack failed', err);
  }
});

async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
  } catch (err) {
    console.error('refresh failed', err);
    if (!loaded) loader.textContent = 'Could not load incidents — retrying…';
  }
}

await refresh(); // R3: loader shows until the first answer lands
setInterval(refresh, 2000); // R4: keeps the board current without a reload
