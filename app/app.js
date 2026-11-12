import { fetchIncidents, ack } from './api.js';

const loader = document.querySelector('[data-testid="loader"]');
const newBar = document.querySelector('[data-testid="new-bar"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');

// Acked rows, kept so an ack sticks (R2).
const ackedIds = new Set();
// Every incident id we've already placed or queued, so we only ever add new ones.
const seen = new Set();
let shown = []; // incidents on screen, in a stable order that does not change under the viewer
let pending = []; // new incidents waiting behind the "N new" bar, newest first
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

// The list holds still while it is on screen (product's decision): it is only
// rebuilt when the viewer brings new incidents in, never under their pointer.
function renderList() {
  empty.hidden = shown.length > 0;
  list.innerHTML = shown.map(rowHtml).join('');
}

// The "N new" bar: how many incidents are waiting to come in.
function renderBar() {
  const n = pending.length;
  newBar.hidden = n === 0;
  newBar.textContent = n === 0 ? '' : `${n} new`;
}

// Click the bar: bring the waiting incidents into the list, newest at the top.
newBar.addEventListener('click', () => {
  if (!pending.length) return;
  shown = [...pending, ...shown];
  pending = [];
  renderBar();
  renderList();
});

// R2: Ack a row. The list holds still, so the row you click is the row you meant.
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

// R4: still polls every 2s — but new incidents queue behind the bar instead of
// reordering the list under the viewer.
async function refresh() {
  try {
    const page = await fetchIncidents();
    if (!loaded) {
      shown = page.incidents; // R1: first load shows tonight's incidents, newest first
      page.incidents.forEach((i) => seen.add(i.id));
      loaded = true;
      loader.hidden = true;
      renderList();
      renderBar();
      return;
    }
    const fresh = page.incidents.filter((i) => !seen.has(i.id));
    if (fresh.length) {
      fresh.forEach((i) => seen.add(i.id));
      pending = [...fresh, ...pending]; // newest first, waiting behind the bar
      renderBar();
    }
  } catch (err) {
    console.error('refresh failed', err);
    if (!loaded) loader.textContent = 'Could not load incidents — retrying…';
  }
}

await refresh(); // R3: loader shows until the first answer lands
setInterval(refresh, 2000);
