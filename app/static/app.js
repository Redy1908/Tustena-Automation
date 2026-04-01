/* ── State ────────────────────────────────────────────────────────────────── */

let previewData  = [];
let currentWeekOffset = 0;
let csvFile      = null;

function getLegacyMode() {
  return document.querySelector('.mode-chip.active')?.dataset.mode || 'none';
}

/* ── Bootstrapping & Navigation ───────────────────────────────────────────── */

const settingsView = document.getElementById('settings-view');
const mainView     = document.getElementById('main-view');

function showSettings() {
  mainView.style.display     = 'none';
  settingsView.style.display = 'block';
  document.getElementById('warning-banner-full').style.display = 'none';
}

function showMainView() {
  settingsView.style.display = 'none';
  mainView.style.display     = 'block';
  document.getElementById('warning-banner-full').style.display = '';
  document.getElementById('holiday-warning').style.display = 
    (!document.getElementById('skip_holidays').checked) ? '' : 'none';
  loadWeek();
}

document.getElementById('view-settings-btn').addEventListener('click', showSettings);

document.addEventListener('DOMContentLoaded', () => {
  const local_tustena = localStorage.getItem('tustena_api_key');
  const local_ical    = localStorage.getItem('ical_url');
  const local_float   = localStorage.getItem('float_api_key');
  const skip_holidays = localStorage.getItem('skip_holidays');
  
  if (local_tustena) document.getElementById('tustena_api_key').value = local_tustena;
  if (local_ical)    document.getElementById('ical_url').value = local_ical;
  if (local_float)   document.getElementById('float_api_key').value = local_float;
  if (skip_holidays) document.getElementById('skip_holidays').checked = skip_holidays === 'true';

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
  return {
    start: toLocalDateStr(monday),
    end: toLocalDateStr(sunday),
    monday, sunday
  };
}

/* ── UI Interactions ──────────────────────────────────────────────────────── */

document.getElementById('advanced_toggle').addEventListener('change', function() {
  document.getElementById('advanced-container').style.display = this.checked ? 'block' : 'none';
});

document.querySelectorAll('.mode-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const mode = chip.dataset.mode;
    document.getElementById('mode-csv').style.display   = (mode === 'csv') ? 'block' : 'none';
    document.getElementById('mode-float').style.display = (mode === 'float') ? 'block' : 'none';
  });
});

document.getElementById('week-prev-btn').addEventListener('click', () => { currentWeekOffset--; loadWeek(); });
document.getElementById('week-next-btn').addEventListener('click', () => { currentWeekOffset++; loadWeek(); });

/* ── Drop Zone ────────────────────────────────────────────────────────────── */

{
  const dropZone  = document.getElementById('csv_drop_zone');
  const fileInput = document.getElementById('csv_file');
  const fileName  = document.getElementById('csv_filename');

  function setCsvFile(file) {
    if (!file || !file.name.endsWith('.csv')) return;
    csvFile = file;
    fileName.textContent = file.name;
    document.getElementById('err-csv-file')?.classList.remove('visible');
  }

  dropZone.addEventListener('click', () => fileInput.click());

  fetch('/latest_csv').then(async resp => {
    if (!resp.ok) return;
    const blob = await resp.blob();
    const name = resp.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] || 'latest.csv';
    setCsvFile(new File([blob], name, { type: 'text/csv' }));
  }).catch(() => {});
  fileInput.addEventListener('change', () => setCsvFile(fileInput.files[0]));

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    setCsvFile(e.dataTransfer.files[0]);
  });
}

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

async function loadWeek() {
  const bounds = getWeekBoundaries(currentWeekOffset);
  const df = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' });
  const titleStr = `${df.format(bounds.monday)} — ${df.format(bounds.sunday)}`;
  document.getElementById('week-title').textContent = titleStr;
  
  const mode = getLegacyMode();
  const list = document.getElementById('voucher-list');
  const legacyWrap = document.getElementById('legacy-preview-wrapper');
  
  if (mode === 'none') {
    legacyWrap.style.display = 'none';
    setLoadingState();
    await fetchPreview('ical', bounds);
  } else {
    list.innerHTML = `<div class="voucher-date-sep" style="text-align:center; padding: 2rem;">Modalità Legacy: Clicca anteprima per caricare i task in questo intervallo.</div>`;
    legacyWrap.style.display = 'flex';
  }
}

document.getElementById('legacy-preview-btn').addEventListener('click', async () => {
  setLoadingState();
  const mode = getLegacyMode();
  const bounds = getWeekBoundaries(currentWeekOffset);
  await fetchPreview(mode, bounds);
});

function setLoadingState() {
  const list = document.getElementById('voucher-list');
  list.innerHTML = `
    <div class="loading-state" style="display:flex; flex-direction:column; align-items:center;  padding:3rem 0; color:var(--text-muted); gap: 1rem;">
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

async function fetchPreview(mode, bounds) {
  const tk = document.getElementById('tustena_api_key').value.trim();
  const ic = document.getElementById('ical_url').value.trim();
  const fk = document.getElementById('float_api_key').value.trim();
  const skip = document.getElementById('skip_holidays').checked;

  let fetchUrl, fetchInit;

  if (mode === 'csv') {
    if (!csvFile) return setListError('Seleziona prima il file CSV nelle Impostazioni.');
    const fd = new FormData();
    fd.append('tustena_api_key', tk);
    fd.append('csv_file', csvFile);
    fd.append('date_from', bounds.start);
    fd.append('date_to', bounds.end);
    fetchUrl  = '/preview_csv';
    fetchInit = { method: 'POST', body: fd };
  } else if (mode === 'ical') {
    if (!ic) return setListError('URL iCal mancante nelle impostazioni.');
    fetchUrl  = '/preview_ical';
    fetchInit = { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ tustena_api_key: tk, ical_url: ic, skip_holidays: skip, date_from: bounds.start, date_to: bounds.end }) 
    };
  } else if (mode === 'float') {
    if (!fk) return setListError('API Key Float mancante nelle impostazioni.');
    fetchUrl  = '/preview';
    fetchInit = { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ tustena_api_key: tk, float_api_key: fk, date_from: bounds.start, date_to: bounds.end }) 
    };
  }

  try {
    const resp = await fetch(fetchUrl, fetchInit);
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { return setListError(text); }

    if (!resp.ok) {
      return setListError(resp.status < 500 ? (json.error || 'Errore') : 'Si è verificato un errore.');
    }
    renderPreview(json.allocations);
  } catch (err) {
    setListError('Errore di rete: ' + err.message);
  }
}

/* ── Save Settings ────────────────────────────────────────────────────────── */

document.getElementById('settings-form').addEventListener('submit', async e => {
  e.preventDefault();
  const tustenaEl = document.getElementById('tustena_api_key');
  
  if (!tustenaEl.value.trim()) { 
    tustenaEl.classList.add('input-error'); 
    return; 
  }
  
  localStorage.setItem('tustena_api_key', tustenaEl.value.trim());
  localStorage.setItem('ical_url', document.getElementById('ical_url').value.trim());
  localStorage.setItem('float_api_key', document.getElementById('float_api_key').value.trim());
  localStorage.setItem('skip_holidays', document.getElementById('skip_holidays').checked);
  
  showMainView();
});

/* ── Render ───────────────────────────────────────────────────────────────── */

function renderPreview(allocations) {
  previewData = allocations;
  const list = document.getElementById('voucher-list');

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
        row.innerHTML = `
          <div class="voucher-meta">
            <div class="vm-primary" title="${t.project_name}">${t.project_name}</div>
            <div class="vm-secondary" title="${t.client_name}">${t.client_name}</div>
          </div>
          <div class="voucher-error-msg">${t.error}</div>`;
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
        
        row.querySelectorAll('input[type="time"]').forEach(inp =>
          inp.addEventListener('input', () => { updateDuration(row, t.hours); })
        );
        updateDuration(row, t.hours);
      }
      list.appendChild(row);
    });
  });

  // Manage visibility
  const existsCount = allocations.filter(t => t.exists).length;
  const toggleBtn = document.getElementById('toggle-exists-btn');
  toggleBtn.style.display = existsCount > 0 ? '' : 'none';
  toggleBtn.dataset.hidden = 'true';
  toggleBtn.textContent = 'Mostra già presenti';

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
  const btn = document.getElementById('toggle-exists-btn');
  const hiding = btn.dataset.hidden === 'false';
  document.querySelectorAll('.voucher-exists').forEach(row => {
    row.style.display = hiding ? 'none' : '';
  });
  updateDateSeparators();
  btn.dataset.hidden = hiding ? 'true' : 'false';
  btn.textContent = hiding ? 'Mostra già presenti' : 'Nascondi già presenti';
});


function updateDuration(row, expectedHours) {
  const startInput = row.querySelector('[data-field="start"]');
  const endInput   = row.querySelector('[data-field="end"]');
  const durEl      = row.querySelector('.voucher-duration');
  const btn        = row.querySelector('.btn-run-row');

  const startVal = startInput.value;
  const endVal   = endInput.value;

  if (!startVal || !endVal) { durEl.textContent = '—'; if(btn) btn.disabled=true; return; }

  const [sh, sm] = startVal.split(':').map(Number);
  const [eh, em] = endVal.split(':').map(Number);
  const actualMins   = (eh * 60 + em) - (sh * 60 + sm);
  const expectedMins = expectedHours * 60;

  if (actualMins <= 0) {
    startInput.classList.add('input-error');
    endInput.classList.add('input-error');
    durEl.textContent = 'Fine ≤ Inizio';
    durEl.className = 'voucher-duration voucher-hours--diff';
    if(btn) btn.disabled=true;
    return;
  }

  startInput.classList.remove('input-error');
  endInput.classList.remove('input-error');

  const actualH = (actualMins / 60).toFixed(1).replace('.0', '');
  durEl.textContent = `Durata: ${actualH}h`;
  durEl.className = actualMins !== expectedMins ? 'voucher-duration voucher-hours--diff' : 'voucher-duration';
  if(btn) {
    const descEl = row.querySelector('.voucher-description');
    btn.disabled = (!descEl || !descEl.value.trim());
  }
}

// Global delegated listen to textarea
document.getElementById('voucher-list').addEventListener('input', (e) => {
  if (e.target.classList.contains('voucher-description')) {
    const row = e.target.closest('.voucher-row');
    const idx = row.dataset.idx;
    const t = previewData[idx];
    updateDuration(row, t.hours);
  }
});

/* ── Run Row Execution ────────────────────────────────────────────────────── */

document.getElementById('voucher-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-run-row');
  if (!btn) return;
  
  const idx = btn.dataset.idx;
  const row = btn.closest('.voucher-row');
  const t = previewData[idx];
  
  const descEl = row.querySelector('.voucher-description');
  const startEl = row.querySelector('[data-field="start"]');
  const endEl = row.querySelector('[data-field="end"]');
  
  const desc = descEl.value.trim();
  if (!desc) { descEl.classList.add('input-error'); return; }
  descEl.classList.remove('input-error');

  btn.disabled = true;
  btn.textContent = 'Creazione...';
  
  const tk = document.getElementById('tustena_api_key').value.trim();
  const fk = document.getElementById('float_api_key')?.value.trim();
  
  const singleTask = {
    ...t,
    start_time: startEl.value,
    end_time: endEl.value,
    description: desc
  };
  
  try {
    const resp = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tustena_api_key: tk, float_api_key: fk, tasks: [singleTask] })
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
      endEl.disabled = true;
      descEl.disabled = true;
    } else {
      throw new Error(r.error);
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Riprova';
    btn.style.background = 'var(--error)';
    console.error(err);
    alert(`Errore: ${err.message}`);
  }
});

/* ── Modals and Search (copied from previous structure) ───────────────────── */

document.getElementById('warning-toggle')?.addEventListener('click', () => {
  const details = document.getElementById('warning-details');
  const chevron = document.querySelector('.warning-chevron');
  const expanded = details.style.display !== 'none';
  details.style.display = expanded ? 'none' : '';
  chevron.classList.toggle('warning-chevron--open', !expanded);
});

async function searchCompany() {
  const query      = document.getElementById('company-search-input').value.trim();
  const tustenaKey = document.getElementById('tustena_api_key').value.trim();
  const results    = document.getElementById('company-search-results');
  if (!query) return;

  results.innerHTML = '<li class="company-search-loading">Ricerca in corso…</li>';
  try {
    const resp = await fetch(`/search_company?tustena_api_key=${encodeURIComponent(tustenaKey)}&q=${encodeURIComponent(query)}`);
    const json = await resp.json();
    if (json.error) {
      results.innerHTML = `<li class="company-search-error">${json.error}</li>`;
    } else if (!json.companies.length) {
      results.innerHTML = '<li class="company-search-empty">Nessun risultato.</li>';
    } else {
      results.innerHTML = json.companies.map(name => `<li>${name}</li>`).join('');
    }
  } catch {
    results.innerHTML = '<li class="company-search-error">Errore di rete.</li>';
  }
}

document.getElementById('company-search-btn')?.addEventListener('click', searchCompany);
document.getElementById('company-search-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchCompany();
});

async function searchServices() {
  const company    = document.getElementById('service-company-input').value.trim();
  const contract   = document.getElementById('service-contract-input').value.trim();
  const tustenaKey = document.getElementById('tustena_api_key').value.trim();
  const results    = document.getElementById('service-search-results');
  if (!company || !contract) return;

  results.innerHTML = '<li class="company-search-loading">Ricerca in corso…</li>';
  try {
    const resp = await fetch(`/search_services?tustena_api_key=${encodeURIComponent(tustenaKey)}&company=${encodeURIComponent(company)}&contract=${encodeURIComponent(contract)}`);
    const json = await resp.json();
    if (json.error) {
      results.innerHTML = `<li class="company-search-error">${json.error}</li>`;
    } else if (!json.services.length) {
      results.innerHTML = '<li class="company-search-empty">Nessun risultato.</li>';
    } else {
      results.innerHTML = json.services.map(name => `<li>${name}</li>`).join('');
    }
  } catch {
    results.innerHTML = '<li class="company-search-error">Errore di rete.</li>';
  }
}

document.getElementById('service-search-btn')?.addEventListener('click', searchServices);
const svcInputs = [document.getElementById('service-company-input'), document.getElementById('service-contract-input')];
svcInputs.forEach(el => el?.addEventListener('keydown', e => { if (e.key === 'Enter') searchServices(); }));

const helpModal = document.getElementById('help-modal');
const helpBtn = document.getElementById('help-btn');

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

const holidayModal     = document.getElementById('holiday-modal');
const holidayOkBtn     = document.getElementById('holiday-ok-btn');
const holidayCancelBtn = document.getElementById('holiday-cancel-btn');
const skipHolidaysCb   = document.getElementById('skip_holidays');

skipHolidaysCb.addEventListener('change', function () {
  if (!this.checked) {
    this.checked = true;
    holidayModal.classList.add('open');
    holidayModal.setAttribute('aria-hidden', 'false');
  }
});

holidayCancelBtn?.addEventListener('click', () => {
  holidayModal.classList.remove('open');
  holidayModal.setAttribute('aria-hidden', 'true');
});

holidayOkBtn?.addEventListener('click', () => {
  skipHolidaysCb.checked = false;
  holidayModal.classList.remove('open');
  holidayModal.setAttribute('aria-hidden', 'true');
});
