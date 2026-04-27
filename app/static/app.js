/* ── State ────────────────────────────────────────────────────────────────── */

let previewData         = [];
let currentWeekOffset   = 0;
let _previewAbortCtrl   = null;
let _loadWeekTimer      = null;

/* ── Bootstrapping & Navigation ───────────────────────────────────────────── */

const settingsView = document.getElementById('settings-view');
const mainView     = document.getElementById('main-view');

function showSettings() {
  mainView.style.display     = 'none';
  settingsView.style.display = 'block';
}

function showMainView() {
  settingsView.style.display = 'none';
  mainView.style.display     = 'block';
  document.getElementById('holiday-warning').style.display =
    document.getElementById('skip_holidays').checked ? 'none' : '';
  loadWeek();
}

document.getElementById('view-settings-btn').addEventListener('click', showSettings);

document.addEventListener('DOMContentLoaded', () => {
  ['company_mapping', 'service_mapping'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      const pretty = _prettyJson(el.value);
      if (pretty !== el.value) el.value = pretty;
      _validateJsonField(el);
    });
    el.addEventListener('input', () => {
      if (el.classList.contains('input-error')) _validateJsonField(el);
    });
  });

  const local_tustena = localStorage.getItem('tustena_api_key');
  const local_ical    = localStorage.getItem('ical_url');
  const skip_holidays = localStorage.getItem('skip_holidays');
  const local_cm      = localStorage.getItem('company_mapping');
  const local_sm      = localStorage.getItem('service_mapping');

  if (local_tustena) document.getElementById('tustena_api_key').value = local_tustena;
  if (local_ical)    document.getElementById('ical_url').value = local_ical;
  if (skip_holidays) document.getElementById('skip_holidays').checked = skip_holidays === 'true';
  if (local_cm) document.getElementById('company_mapping').value = _prettyJson(local_cm);
  if (local_sm) document.getElementById('service_mapping').value = _prettyJson(local_sm);

  const tk = document.getElementById('tustena_api_key').value.trim();
  const ic = document.getElementById('ical_url').value.trim();

  if (tk && ic) {
    showMainView();
  } else {
    showSettings();
  }
});

/* ── Date Helpers ─────────────────────────────────────────────────────────── */

function toLocalDateStr(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function getWeekBoundaries(offset) {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff + (offset * 7)));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toLocalDateStr(monday), end: toLocalDateStr(sunday), monday, sunday };
}

/* ── UI Interactions ──────────────────────────────────────────────────────── */

document.getElementById('mapping-toggle').addEventListener('click', function() {
  const expanded = this.getAttribute('aria-expanded') === 'true';
  this.setAttribute('aria-expanded', String(!expanded));
  document.getElementById('mapping-fields').style.display = expanded ? 'none' : 'block';
  document.getElementById('mapping-toggle-label').textContent = expanded ? 'Mostra Mapping Nomi' : 'Nascondi Mapping Nomi';
});

document.getElementById('week-prev-btn').addEventListener('click', () => { currentWeekOffset--; scheduleLoadWeek(); });
document.getElementById('week-next-btn').addEventListener('click', () => { currentWeekOffset++; scheduleLoadWeek(); });

/* ── Theme Toggle ─────────────────────────────────────────────────────────── */

const sunIcon  = document.getElementById('theme-icon-sun');
const moonIcon = document.getElementById('theme-icon-moon');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  sunIcon.style.display  = theme === 'dark'  ? 'block' : 'none';
  moonIcon.style.display = theme === 'light' ? 'block' : 'none';
}

applyTheme(localStorage.getItem('theme') || 'light');

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('theme', next);
});

/* ── Load Week ────────────────────────────────────────────────────────────── */

function scheduleLoadWeek() {
  const bounds = getWeekBoundaries(currentWeekOffset);
  const df = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' });
  document.getElementById('week-title').textContent = `${df.format(bounds.monday)} — ${df.format(bounds.sunday)}`;
  clearTimeout(_loadWeekTimer);
  _loadWeekTimer = setTimeout(() => loadWeek(), 300);
}

async function loadWeek() {
  const bounds = getWeekBoundaries(currentWeekOffset);
  const df = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' });
  document.getElementById('week-title').textContent = `${df.format(bounds.monday)} — ${df.format(bounds.sunday)}`;
  setLoadingState();
  await fetchPreview(bounds);
}

function setLoadingState() {
  document.getElementById('voucher-list').innerHTML = `
    <div class="loading-state" style="display:flex; flex-direction:column; align-items:center; padding:3rem 0; color:var(--text-muted); gap: 1rem;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="spinner" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
      </svg>
      <span>Recupero allocazioni in corso...</span>
    </div>
  `;
}

function setListError(msg) {
  document.getElementById('voucher-list').innerHTML = `<div class="form-error" style="display:block">${msg}</div>`;
}

async function fetchPreview(bounds) {
  const tk   = document.getElementById('tustena_api_key').value.trim();
  const ic   = document.getElementById('ical_url').value.trim();
  const skip = document.getElementById('skip_holidays').checked;
  const cm   = document.getElementById('company_mapping')?.value.trim() || '{}';
  const sm   = document.getElementById('service_mapping')?.value.trim() || '{}';

  if (!ic) return setListError('URL iCal mancante nelle impostazioni.');

  if (_previewAbortCtrl) _previewAbortCtrl.abort();
  _previewAbortCtrl = new AbortController();
  const signal = _previewAbortCtrl.signal;

  try {
    const resp = await fetch('/preview_ical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tustena_api_key: tk, ical_url: ic, skip_holidays: skip, date_from: bounds.start, date_to: bounds.end, company_mapping: cm, service_mapping: sm }),
      signal,
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { return setListError(text); }
    if (!resp.ok) return setListError(resp.status < 500 ? (json.error || 'Errore') : 'Si è verificato un errore.');
    renderPreview(json.allocations);
  } catch (err) {
    if (err.name === 'AbortError') return;
    setListError('Errore di rete: ' + err.message);
  }
}

/* ── JSON Mapping Fields ─────────────────────────────────────────────────── */

function _prettyJson(raw) {
  if (!raw || !raw.trim()) return '';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch(e) { return raw; }
}

function _validateJsonField(el) {
  const errId = { company_mapping: 'err-company-mapping', service_mapping: 'err-service-mapping' }[el.id];
  const errEl = errId ? document.getElementById(errId) : null;
  const val   = el.value.trim();
  if (!val) {
    el.classList.remove('input-error');
    if (errEl) errEl.classList.remove('visible');
    return true;
  }
  try {
    JSON.parse(val);
    el.classList.remove('input-error');
    if (errEl) errEl.classList.remove('visible');
    return true;
  } catch(e) {
    el.classList.add('input-error');
    if (errEl) errEl.classList.add('visible');
    return false;
  }
}

/* ── Save Settings ────────────────────────────────────────────────────────── */

document.getElementById('settings-form').addEventListener('submit', e => {
  e.preventDefault();
  const tustenaEl = document.getElementById('tustena_api_key');
  const icalEl    = document.getElementById('ical_url');
  const companyEl = document.getElementById('company_mapping');
  const serviceEl = document.getElementById('service_mapping');
  let valid = true;

  if (!_validateJsonField(companyEl)) valid = false;
  if (!_validateJsonField(serviceEl)) valid = false;

  if (!tustenaEl.value.trim()) {
    tustenaEl.classList.add('input-error');
    document.getElementById('err-tustena-api-key')?.classList.add('visible');
    valid = false;
  } else {
    tustenaEl.classList.remove('input-error');
    document.getElementById('err-tustena-api-key')?.classList.remove('visible');
  }

  if (!icalEl.value.trim()) {
    icalEl.classList.add('input-error');
    document.getElementById('err-ical-url')?.classList.add('visible');
    valid = false;
  } else {
    icalEl.classList.remove('input-error');
    document.getElementById('err-ical-url')?.classList.remove('visible');
  }

  if (!valid) return;

  localStorage.setItem('tustena_api_key', tustenaEl.value.trim());
  localStorage.setItem('ical_url', icalEl.value.trim());
  localStorage.setItem('skip_holidays', document.getElementById('skip_holidays').checked);
  localStorage.setItem('company_mapping', companyEl.value.trim());
  localStorage.setItem('service_mapping', serviceEl.value.trim());

  showMainView();
});

/* ── Render ───────────────────────────────────────────────────────────────── */

function renderPreview(allocations) {
  previewData = allocations;
  const list  = document.getElementById('voucher-list');

  if (!allocations || allocations.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nessuna allocazione trovata per il periodo.</div>`;
    return;
  }

  const byDate = {};
  allocations.forEach((t, i) => {
    if (!byDate[t.start_date]) byDate[t.start_date] = [];
    byDate[t.start_date].push({ t, i });
  });

  const timeMap = {};
  Object.keys(byDate).sort().forEach(date => {
    let cursor = 9 * 60;
    byDate[date].forEach(({ t, i }) => {
      const end = cursor + t.hours * 60;
      timeMap[i] = { start: minsToTime(cursor), end: minsToTime(end) };
      cursor = end;
    });
  });

  list.innerHTML = '';
  Object.keys(byDate).sort().forEach(date => {
    const sep = document.createElement('div');
    sep.className = 'voucher-date-sep';
    sep.textContent = formatDate(date);
    list.appendChild(sep);

    byDate[date].forEach(({ t, i }) => {
      const { start, end } = timeMap[i];
      const row = document.createElement('div');
      row.dataset.idx = i;

      if (t.error) {
        row.className = 'voucher-row voucher-error';
        let errorAction = `<div class="voucher-error-msg">${t.error}</div>`;

        if (t.error_type === 'company') {
          const q = t.error_query ? t.error_query.replace(/"/g, '&quot;') : '';
          errorAction = `
            <div class="voucher-error-action" data-type="company" data-query="${q}">
              <div class="mi-hint">Il nome su Float non corrisponde a nessun cliente su Tustena. Cerca il nome corretto:</div>
              <div class="mi-row">
                <span class="mi-name" title="${q}">${q}</span>
                <span class="mi-arrow">→</span>
                <div class="mi-search-wrap">
                  <div class="mi-input-row">
                    <input type="text" class="inline-search-input mi-input" placeholder="Cerca su Tustena…" value="${q}" />
                    <button type="button" class="btn-inline-search mi-btn">Cerca</button>
                  </div>
                  <div class="mi-results-container" style="display:none">
                    <ul class="inline-search-results mi-results"></ul>
                    <div class="mi-mappa-row">
                      <button type="button" class="btn-mappa-confirm mi-mappa-btn" disabled>Mappa</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>`;
        } else if (t.error_type === 'service') {
          const q  = t.error_query   ? t.error_query.replace(/"/g, '&quot;')   : '';
          const co = t.company_name  ? t.company_name.replace(/"/g, '&quot;')  : '';
          const ct = t.contract_code ? t.contract_code.replace(/"/g, '&quot;') : '';
          errorAction = `
            <div class="voucher-error-action" data-type="service" data-query="${q}" data-company="${co}" data-contract="${ct}">
              <div class="mi-hint">Il servizio su Float non corrisponde a nessun servizio Tustena del contratto <strong>${ct}</strong>. Seleziona il servizio corretto:</div>
              <div class="mi-row">
                <span class="mi-name" title="${q}">${q}</span>
                <span class="mi-arrow">→</span>
                <div class="mi-search-wrap">
                  <div class="mi-input-row">
                    <button type="button" class="btn-inline-search mi-btn">Carica servizi</button>
                  </div>
                  <div class="mi-results-container" style="display:none">
                    <ul class="inline-search-results mi-results"></ul>
                    <div class="mi-mappa-row">
                      <button type="button" class="btn-mappa-confirm mi-mappa-btn" disabled>Mappa</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>`;
        }

        row.innerHTML = `
          <div class="voucher-meta" style="flex:unset; width:100%; margin-bottom:0.5rem">
            <div class="vm-primary" title="${t.project_name}">${t.project_name}</div>
            <div class="vm-secondary" title="${t.client_name}">${t.client_name}</div>
          </div>
          ${errorAction}`;

      } else if (t.exists) {
        row.className = 'voucher-row voucher-exists';
        row.innerHTML = `
          <div class="voucher-meta">
            <div class="vm-primary" title="${t.project_name}">${t.project_name}</div>
            <div class="vm-secondary" title="${t.client_name}">${t.client_name}</div>
          </div>
          <span class="voucher-badge-exists">Già presente</span>`;

      } else {
        row.className = 'voucher-row';
        row.innerHTML = `
          <div class="voucher-main">
            <div class="voucher-meta">
              <div class="vm-primary" title="${t.project_name}">${t.project_name}</div>
              <div class="vm-secondary" title="${t.client_name}">${t.client_name}</div>
            </div>
            <div class="voucher-right">
              <div class="vf">
                <span class="vf-label">Inizio</span>
                <input type="time" data-field="start" value="${start}" />
              </div>
              <div class="vf">
                <span class="vf-label">Fine</span>
                <input type="time" data-field="end" value="${end}" />
              </div>
              <div class="vf vf-summary">
                <span class="voucher-duration"></span>
                <span class="vf-expected">Previsto: ${t.hours}h</span>
              </div>
              <div class="vf-action">
                <button class="btn btn-run-row" type="button" data-idx="${i}">Crea</button>
              </div>
            </div>
          </div>
          <textarea class="voucher-description" placeholder="Contenuto Del Rapportino…" rows="1">${t.notes || ''}</textarea>`;

        row.querySelectorAll('input[type="time"]').forEach(inp => {
          inp.addEventListener('input',  () => updateDuration(row, t.hours));
          inp.addEventListener('change', () => updateDuration(row, t.hours));
        });
        updateDuration(row, t.hours);
      }
      list.appendChild(row);
    });
  });

  const existsCount = allocations.filter(t => t.exists).length;
  const toggleBtn   = document.getElementById('toggle-exists-btn');
  toggleBtn.style.display = existsCount > 0 ? '' : 'none';
  toggleBtn.dataset.hidden = 'true';
  toggleBtn.textContent = `Mostra ${existsCount} già present${existsCount === 1 ? 'e' : 'i'}`;
  document.querySelectorAll('.voucher-exists').forEach(r => r.style.display = 'none');
  updateDateSeparators();
}

function updateDateSeparators() {
  document.querySelectorAll('.voucher-date-sep').forEach(sep => {
    let next = sep.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('voucher-date-sep')) {
      if (next.style.display !== 'none') { hasVisible = true; break; }
      next = next.nextElementSibling;
    }
    sep.style.display = hasVisible ? '' : 'none';
  });
}

document.getElementById('toggle-exists-btn').addEventListener('click', () => {
  const btn    = document.getElementById('toggle-exists-btn');
  const hiding = btn.dataset.hidden === 'false';
  document.querySelectorAll('.voucher-exists').forEach(row => { row.style.display = hiding ? 'none' : ''; });
  updateDateSeparators();
  btn.dataset.hidden = hiding ? 'true' : 'false';
  const cnt = document.querySelectorAll('.voucher-exists').length;
  btn.textContent = hiding ? `Mostra ${cnt} già present${cnt === 1 ? 'e' : 'i'}` : 'Nascondi già presenti';
});

function updateDuration(row, expectedHours) {
  const startInput = row.querySelector('[data-field="start"]');
  const endInput   = row.querySelector('[data-field="end"]');
  const durEl      = row.querySelector('.voucher-duration');
  const btn        = row.querySelector('.btn-run-row');

  const startVal = startInput.value;
  const endVal   = endInput.value;

  if (!startVal || !endVal) {
    durEl.textContent = '—';
    if (btn) { btn.disabled = true; btn.title = 'Inserisci orario di inizio e fine'; }
    return;
  }

  const [sh, sm] = startVal.split(':').map(Number);
  const [eh, em] = endVal.split(':').map(Number);
  const actualMins   = (eh * 60 + em) - (sh * 60 + sm);
  const expectedMins = expectedHours * 60;

  if (actualMins <= 0) {
    startInput.classList.add('input-error');
    endInput.classList.add('input-error');
    durEl.textContent = 'Fine ≤ Inizio';
    durEl.className = 'voucher-duration voucher-hours--diff';
    if (btn) { btn.disabled = true; btn.title = 'Orario non valido: fine ≤ inizio'; }
    return;
  }

  startInput.classList.remove('input-error');
  endInput.classList.remove('input-error');

  const actualH = (actualMins / 60).toFixed(1).replace('.0', '');
  durEl.textContent = `Durata: ${actualH}h`;
  const hasDurationError = actualMins !== expectedMins;
  durEl.className = hasDurationError ? 'voucher-duration voucher-hours--diff' : 'voucher-duration';

  if (btn) {
    const descEl   = row.querySelector('.voucher-description');
    const descEmpty = !descEl || !descEl.value.trim();
    if (descEl) descEl.classList.toggle('input-error', descEmpty);
    btn.disabled = hasDurationError || descEmpty;
    if (hasDurationError) btn.title = 'La durata non corrisponde a quella prevista da Float';
    else if (descEmpty)   btn.title = 'Inserisci il contenuto del rapportino';
    else                  btn.title = 'Crea voucher';
  }
}

document.getElementById('voucher-list').addEventListener('input', e => {
  if (e.target.classList.contains('voucher-description')) {
    const row = e.target.closest('.voucher-row');
    updateDuration(row, previewData[row.dataset.idx].hours);
  }
});

/* ── Run Row Execution ────────────────────────────────────────────────────── */

document.getElementById('voucher-list').addEventListener('click', async e => {
  const btn = e.target.closest('.btn-run-row');
  if (!btn) return;

  const idx    = btn.dataset.idx;
  const row    = btn.closest('.voucher-row');
  const t      = previewData[idx];
  const descEl  = row.querySelector('.voucher-description');
  const startEl = row.querySelector('[data-field="start"]');
  const endEl   = row.querySelector('[data-field="end"]');

  const desc = descEl.value.trim();
  if (!desc) { descEl.classList.add('input-error'); return; }
  descEl.classList.remove('input-error');

  btn.disabled = true;
  btn.textContent = 'Creazione...';

  const tk = document.getElementById('tustena_api_key').value.trim();

  try {
    const resp = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tustena_api_key: tk,
        tasks: [{ ...t, start_time: startEl.value, end_time: endEl.value, description: desc }],
      }),
    });

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(text); }
    if (!resp.ok) throw new Error(json.error || 'Errore HTTP');

    const r = json.results[0];
    if (r.ok) {
      btn.textContent = 'Creato ✓';
      btn.style.background = 'var(--success)';
      startEl.disabled = true;
      endEl.disabled   = true;
      descEl.disabled  = true;
    } else {
      throw new Error(r.error);
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Riprova';
    btn.style.background = 'var(--error)';
    alert(`Errore: ${err.message}`);
  }
});

/* ── Inline Mapping Resolution ────────────────────────────────────────────── */

document.getElementById('voucher-list').addEventListener('click', async e => {
  const btn = e.target.closest('.btn-inline-search');
  if (btn) {
    const actionEl   = btn.closest('.voucher-error-action');
    const inputEl    = actionEl.querySelector('.inline-search-input');
    const results    = actionEl.querySelector('.inline-search-results');
    const container  = actionEl.querySelector('.mi-results-container');
    const mappaBtn   = actionEl.querySelector('.btn-mappa-confirm');
    const type       = actionEl.dataset.type;
    const query      = inputEl ? inputEl.value.trim() : '';
    const tustenaKey = document.getElementById('tustena_api_key').value.trim();

    if (type === 'company' && !query) return;

    results.innerHTML = '<li style="padding:0.35rem 0.6rem;color:var(--text-muted);list-style:none;font-size:0.84rem">Ricerca in corso…</li>';
    container.style.display = '';
    if (mappaBtn) mappaBtn.disabled = true;

    try {
      let resp;
      if (type === 'company') {
        resp = await fetch(`/search_company?tustena_api_key=${encodeURIComponent(tustenaKey)}&q=${encodeURIComponent(query)}`);
      } else {
        const company        = actionEl.dataset.company;
        const contract       = actionEl.dataset.contract;
        const companyMapping = localStorage.getItem('company_mapping') || '';
        resp = await fetch(`/search_services?tustena_api_key=${encodeURIComponent(tustenaKey)}&company=${encodeURIComponent(company)}&contract=${encodeURIComponent(contract)}&company_mapping=${encodeURIComponent(companyMapping)}`);
      }
      const json = await resp.json();

      if (json.error) {
        results.innerHTML = `<li style="padding:0.35rem 0.6rem;color:var(--error);list-style:none;font-size:0.84rem">${json.error}</li>`;
      } else if (type === 'company' && !json.companies.length) {
        results.innerHTML = '<li style="padding:0.35rem 0.6rem;color:var(--text-muted);list-style:none;font-size:0.84rem">Nessun risultato.</li>';
      } else if (type === 'service' && !json.services.length) {
        results.innerHTML = '<li style="padding:0.35rem 0.6rem;color:var(--text-muted);list-style:none;font-size:0.84rem">Nessun risultato.</li>';
      } else {
        const items = type === 'company' ? json.companies : json.services;
        results.innerHTML = items.map(name => `<li class="inline-result-item" data-name="${name.replace(/"/g,'&quot;')}">${name}</li>`).join('');
      }
    } catch {
      results.innerHTML = '<li style="padding:0.35rem 0.6rem;color:var(--error);list-style:none;font-size:0.84rem">Errore di rete.</li>';
    }
    return;
  }

  const li = e.target.closest('.inline-result-item');
  if (li) {
    const actionEl = li.closest('.voucher-error-action');
    const mappaBtn = actionEl.querySelector('.btn-mappa-confirm');
    actionEl.querySelectorAll('.inline-result-item').forEach(el => el.classList.remove('selected'));
    li.classList.add('selected');
    if (mappaBtn) mappaBtn.disabled = false;
    return;
  }

  const mappaBtn = e.target.closest('.btn-mappa-confirm');
  if (mappaBtn && !mappaBtn.disabled) {
    const actionEl = mappaBtn.closest('.voucher-error-action');
    const selected = actionEl.querySelector('.inline-result-item.selected');
    if (!selected) return;

    const type       = actionEl.dataset.type;
    const errorQ     = actionEl.dataset.query;
    const mapped     = selected.dataset.name;
    const storageKey = type === 'company' ? 'company_mapping' : 'service_mapping';

    let map = {};
    try { const raw = localStorage.getItem(storageKey); if (raw) map = JSON.parse(raw); } catch(err) {}
    map[errorQ] = mapped;
    const newJson = JSON.stringify(map, null, 2);
    localStorage.setItem(storageKey, newJson);
    const field = document.getElementById(storageKey);
    if (field) field.value = newJson;
    loadWeek();
  }
});

document.getElementById('voucher-list').addEventListener('keydown', e => {
  if (e.target.classList.contains('inline-search-input') && e.key === 'Enter') {
    e.preventDefault();
    e.target.closest('.voucher-error-action').querySelector('.btn-inline-search')?.click();
  }
});

/* ── Help Modal ───────────────────────────────────────────────────────────── */

const helpModal = document.getElementById('help-modal');
const helpBtn   = document.getElementById('help-btn');

if (!localStorage.getItem('helpSeen')) {
  helpBtn.classList.add('help-btn-blink');
}

helpBtn.addEventListener('click', () => {
  helpModal.classList.add('open');
  helpModal.setAttribute('aria-hidden', 'false');
  helpBtn.classList.remove('help-btn-blink');
  localStorage.setItem('helpSeen', '1');
});

document.getElementById('help-ok-btn')?.addEventListener('click', () => {
  helpModal.classList.remove('open');
  helpModal.setAttribute('aria-hidden', 'true');
});

/* ── Holiday Modal ────────────────────────────────────────────────────────── */

const holidayModal     = document.getElementById('holiday-modal');
const skipHolidaysCb   = document.getElementById('skip_holidays');

skipHolidaysCb.addEventListener('change', function() {
  if (!this.checked) {
    this.checked = true;
    holidayModal.classList.add('open');
    holidayModal.setAttribute('aria-hidden', 'false');
  }
});

document.getElementById('holiday-cancel-btn')?.addEventListener('click', () => {
  holidayModal.classList.remove('open');
  holidayModal.setAttribute('aria-hidden', 'true');
});

document.getElementById('holiday-ok-btn')?.addEventListener('click', () => {
  skipHolidaysCb.checked = false;
  document.getElementById('holiday-warning').style.display = '';
  holidayModal.classList.remove('open');
  holidayModal.setAttribute('aria-hidden', 'true');
});
