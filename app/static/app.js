/* ── State ────────────────────────────────────────────────────────────────── */

let previewData  = [];
let lastTustenaApiKey = '';
let lastFloatApiKey = '';
let activeTab    = 'all';
let csvFile      = null;

function isCsvMode() {
  return document.querySelector('.mode-chip.active')?.dataset.mode === 'csv';
}


function _setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('tab-all').style.display    = tab === 'all'    ? '' : 'none';
  document.getElementById('tab-single').style.display = tab === 'single' ? 'block' : 'none';
  document.getElementById('tab-range').style.display  = tab === 'range'  ? 'block' : 'none';
  clearError('date', 'err-date');
  clearError('date_from', 'err-date-range');
  clearError('date_to', 'err-date-range');
}

document.querySelectorAll('.mode-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const isFloat = chip.dataset.mode === 'float';
    document.getElementById('mode-float').style.display = isFloat ? '' : 'none';
    document.getElementById('mode-csv').style.display   = isFloat ? 'none' : '';
    // swap visible tabs
    document.querySelector('.tab[data-tab="all"]').style.display   = isFloat ? 'none' : '';
    document.querySelector('.tab[data-tab="range"]').style.display = isFloat ? '' : 'none';
    // reset to sensible default for the mode
    if (isFloat && activeTab === 'all')   _setTab('single');
    if (!isFloat && activeTab === 'range') _setTab('all');
  });
});

function toLocalDateStr(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

const now = new Date();
document.getElementById('date').value      = toLocalDateStr(now);
document.getElementById('date_from').value = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
document.getElementById('date_to').value   = toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function showFormError(detail) {
  const el = document.getElementById('form-error');
  el.textContent = detail || 'Si è verificato un errore.';
  el.style.display = 'block';
}

function showError(inputId, msgId) {
  document.getElementById(inputId)?.classList.add('input-error');
  document.getElementById(msgId)?.classList.add('visible');
}

function clearError(inputId, msgId) {
  document.getElementById(inputId)?.classList.remove('input-error');
  document.getElementById(msgId)?.classList.remove('visible');
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* ── Drop zone ────────────────────────────────────────────────────────────── */

{
  const dropZone  = document.getElementById('csv_drop_zone');
  const fileInput = document.getElementById('csv_file');
  const fileName  = document.getElementById('csv_filename');

  function setCsvFile(file) {
    if (!file || !file.name.endsWith('.csv')) return;
    csvFile = file;
    fileName.textContent = file.name;
    clearError('csv_drop_zone', 'err-csv-file');
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

/* ── Theme ────────────────────────────────────────────────────────────────── */

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

/* ── Date tabs ────────────────────────────────────────────────────────────── */

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => _setTab(btn.dataset.tab));
});

/* ── Live clear errors ────────────────────────────────────────────────────── */

[
  ['tustena_api_key',       'input',  'err-tustena-api-key'],
  ['float_api_key', 'input',  'err-float-api-key'],
  ['date',          'change', 'err-date'],
  ['date_from',     'change', 'err-date-range'],
  ['date_to',       'change', 'err-date-range'],
].forEach(([id, ev, errId]) =>
  document.getElementById(id)?.addEventListener(ev, () => clearError(id, errId))
);

/* ── Form validation ──────────────────────────────────────────────────────── */

function validate() {
  let ok = true;

  const apiKey = document.getElementById('tustena_api_key').value.trim();
  if (!apiKey) { showError('tustena_api_key', 'err-tustena-api-key'); ok = false; }
  else clearError('tustena_api_key', 'err-tustena-api-key');

  if (isCsvMode()) {
    if (!csvFile) { showError('csv_drop_zone', 'err-csv-file'); ok = false; }
    else clearError('csv_drop_zone', 'err-csv-file');
  } else {
    const floatEl = document.getElementById('float_api_key');
    if (floatEl) {
      if (!floatEl.value.trim()) { showError('float_api_key', 'err-float-api-key'); ok = false; }
      else clearError('float_api_key', 'err-float-api-key');
    }
  }

  if (activeTab === 'all') {
    // no date filter — all tasks
  } else if (activeTab === 'single') {
    const date = document.getElementById('date').value;
    if (!date) { showError('date', 'err-date'); ok = false; }
    else clearError('date', 'err-date');
  } else {
    const from = document.getElementById('date_from').value;
    const to   = document.getElementById('date_to').value;
    const rangeMsg = document.getElementById('err-date-range');
    if (!from || !to) {
      rangeMsg.textContent = 'Seleziona entrambe le date.';
      showError('date_from', 'err-date-range');
      showError('date_to',   'err-date-range');
      ok = false;
    } else if (from >= to) {
      rangeMsg.textContent = 'La data di inizio deve essere precedente a quella di fine.';
      showError('date_from', 'err-date-range');
      showError('date_to',   'err-date-range');
      ok = false;
    } else {
      rangeMsg.textContent = '';
      clearError('date_from', 'err-date-range');
      clearError('date_to',   'err-date-range');
    }
  }

  return ok;
}

/* ── Submit → Preview ─────────────────────────────────────────────────────── */

document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!validate()) return;

  lastTustenaApiKey = document.getElementById('tustena_api_key').value.trim();

  const btn = document.getElementById('preview-btn');
  btn.disabled = true;
  btn.textContent = 'Caricamento…';
  document.getElementById('form-error').style.display = 'none';

  let fetchUrl, fetchInit;

  if (isCsvMode()) {
    const fd = new FormData();
    fd.append('tustena_api_key', lastTustenaApiKey);
    fd.append('csv_file', csvFile);
    if (activeTab === 'single') {
      fd.append('date', document.getElementById('date').value);
    } else if (activeTab === 'range') {
      fd.append('date_from', document.getElementById('date_from').value);
      fd.append('date_to',   document.getElementById('date_to').value);
    }
    fetchUrl  = '/preview_csv';
    fetchInit = { method: 'POST', body: fd };
  } else {
    const body = { tustena_api_key: lastTustenaApiKey };
    const floatEl2  = document.getElementById('float_api_key');
    if (floatEl2)  body.float_api_key = lastFloatApiKey = floatEl2.value.trim();
    if (activeTab === 'single') {
      body.date = document.getElementById('date').value;
    } else {
      body.date_from = document.getElementById('date_from').value;
      body.date_to   = document.getElementById('date_to').value;
    }
    fetchUrl  = '/preview';
    fetchInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }

  try {
    const resp = await fetch(fetchUrl, fetchInit);
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { showFormError(text); return; }

    if (!resp.ok) {
      const msg = resp.status < 500 ? (json.error || 'Errore durante il caricamento.') : 'Si è verificato un errore.';
      showFormError(msg); return;
    }

    renderPreview(json.allocations);
  } catch (err) {
    showFormError('Errore di rete: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Anteprima →';
  }
});

/* ── Preview ──────────────────────────────────────────────────────────────── */

function renderPreview(allocations) {
  previewData = allocations;

  // Group by date
  const byDate = {};
  allocations.forEach(t => {
    if (!byDate[t.start_date]) byDate[t.start_date] = [];
    byDate[t.start_date].push(t);
  });

  // Cascade times: first task of each day starts at 09:00
  const timeMap = {};
  let i = 0;
  Object.keys(byDate).sort().forEach(date => {
    let cursor = 9 * 60;
    byDate[date].forEach(t => {
      const end = cursor + t.hours * 60;
      timeMap[i++] = { start: minsToTime(cursor), end: minsToTime(end) };
      cursor = end;
    });
  });

  // Render rows
  const list = document.getElementById('voucher-list');
  list.innerHTML = '';
  let idx = 0;
  Object.keys(byDate).sort().forEach(date => {
    const sep = document.createElement('div');
    sep.className = 'voucher-date-sep';
    sep.textContent = formatDate(date);
    list.appendChild(sep);

    byDate[date].forEach(t => {
      const { start, end } = timeMap[idx];
      const row = document.createElement('div');
      row.dataset.idx = idx;

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
                <span class="voucher-duration" data-dur="${idx}"></span>
                <span class="vf-expected">Previsto: ${t.hours}h</span>
              </div>
            </div>
          </div>
          <textarea class="voucher-description" placeholder="Contenuto Del Rapportino…" rows="1">${t.notes || ''}</textarea>`;
        row.querySelectorAll('input[type="time"]').forEach(inp =>
          inp.addEventListener('input', () => { updateDuration(row, t.hours); updateExecuteState(); })
        );
        row.querySelector('.voucher-description').addEventListener('input', updateExecuteState);
        updateDuration(row, t.hours);
      }

      list.appendChild(row);
      idx++;
    });
  });

  const errorCount  = allocations.filter(t => t.error).length;
  const existsCount = allocations.filter(t => t.exists).length;
  const okCount     = allocations.length - errorCount - existsCount;
  document.getElementById('step2-count').textContent = `${okCount} voucher da creare`;
  const errEl = document.getElementById('step2-errors');
  if (errorCount > 0) {
    errEl.textContent = `${errorCount} con errore`;
    errEl.style.display = '';
  } else {
    errEl.style.display = 'none';
  }
  const existsEl = document.getElementById('step2-exists');
  if (existsCount > 0) {
    existsEl.textContent = `${existsCount} già presenti`;
    existsEl.style.display = '';
  } else {
    existsEl.style.display = 'none';
  }

  const toggleBtn = document.getElementById('toggle-exists-btn');
  toggleBtn.style.display = existsCount > 0 ? '' : 'none';
  toggleBtn.dataset.hidden = 'true';
  toggleBtn.textContent = 'Mostra già presenti';

  // hide existing rows and empty date seps by default
  document.querySelectorAll('.voucher-exists').forEach(r => r.style.display = 'none');
  updateDateSeparators();

  document.getElementById('step1').style.display              = 'none';
  document.getElementById('step2').style.display              = 'block';
  document.getElementById('warning-banner-full').style.display    = 'none';
  document.getElementById('warning-banner-compact').style.display = '';
  updateExecuteState();
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

function updateExecuteState() {
  const errors = [];
  document.querySelectorAll('.voucher-row').forEach(row => {
    const durEl = row.querySelector('.voucher-duration');
    if (durEl?.classList.contains('voucher-hours--diff')) {
      const name = row.querySelector('.vm-primary')?.textContent || '';
      errors.push(durEl.textContent + (name ? ` (${name})` : ''));
    }
  });

  const btn     = document.getElementById('execute-btn');
  const warning = document.getElementById('execute-warning');

  const hasErrors  = document.querySelectorAll('.voucher-row.voucher-error').length > 0;

  const descEls = [...document.querySelectorAll('.voucher-row:not(.voucher-exists):not(.voucher-error) .voucher-description')];
  descEls.forEach(el => el.classList.toggle('input-error', !el.value.trim()));
  const missingDesc = descEls.some(el => !el.value.trim());

  btn.disabled = errors.length > 0 || hasErrors || missingDesc || previewData.length === 0;
  if (errors.length > 0 || hasErrors || missingDesc) {
    warning.querySelector('.execute-warning-tip').textContent = 'Controlla i voucher prima di procedere.';
    warning.style.display = 'inline-flex';
  } else {
    warning.style.display = 'none';
  }
}

function updateDuration(row, expectedHours) {
  const startInput = row.querySelector('[data-field="start"]');
  const endInput   = row.querySelector('[data-field="end"]');
  const durEl      = row.querySelector('.voucher-duration');

  const startVal = startInput.value;
  const endVal   = endInput.value;

  if (!startVal || !endVal) { durEl.textContent = '—'; return; }

  const [sh, sm] = startVal.split(':').map(Number);
  const [eh, em] = endVal.split(':').map(Number);
  const actualMins   = (eh * 60 + em) - (sh * 60 + sm);
  const expectedMins = expectedHours * 60;

  if (actualMins <= 0) {
    startInput.classList.add('input-error');
    endInput.classList.add('input-error');
    durEl.textContent = 'Fine ≤ Inizio';
    durEl.className = 'voucher-duration voucher-hours--diff';
    return;
  }

  startInput.classList.remove('input-error');
  endInput.classList.remove('input-error');

  const actualH = (actualMins / 60).toFixed(1).replace('.0', '');
  durEl.textContent = `Durata: ${actualH}h`;
  durEl.className = actualMins !== expectedMins ? 'voucher-duration voucher-hours--diff' : 'voucher-duration';
}

function goBack() {
  document.getElementById('step2').style.display              = 'none';
  document.getElementById('step1').style.display              = 'block';
  document.getElementById('output-card').style.display        = 'none';
  document.getElementById('warning-banner-full').style.display    = '';
  document.getElementById('warning-banner-compact').style.display = 'none';
  document.getElementById('log').innerHTML = '';
}

document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('warning-back-btn').addEventListener('click', goBack);

/* ── Warning banner toggle ────────────────────────────────────────────────── */

document.getElementById('warning-toggle').addEventListener('click', () => {
  const details = document.getElementById('warning-details');
  const chevron = document.querySelector('.warning-chevron');
  const expanded = details.style.display !== 'none';
  details.style.display = expanded ? 'none' : '';
  chevron.classList.toggle('warning-chevron--open', !expanded);
});

/* ── Company search ───────────────────────────────────────────────────────── */

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

document.getElementById('company-search-btn').addEventListener('click', searchCompany);
document.getElementById('company-search-input').addEventListener('keydown', e => {
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

document.getElementById('service-search-btn').addEventListener('click', searchServices);
[document.getElementById('service-company-input'), document.getElementById('service-contract-input')]
  .forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') searchServices(); }));

/* ── Execute ──────────────────────────────────────────────────────────────── */

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
document.getElementById('help-ok-btn').addEventListener('click', () => {
  helpModal.classList.remove('open');
  helpModal.setAttribute('aria-hidden', 'true');
});
helpModal.addEventListener('click', e => {
  if (e.target === helpModal) {
    helpModal.classList.remove('open');
    helpModal.setAttribute('aria-hidden', 'true');
  }
});

const confirmModal     = document.getElementById('confirm-modal');
const confirmOkBtn     = document.getElementById('confirm-ok-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

document.getElementById('execute-btn').addEventListener('click', () => {
  if (localStorage.getItem('confirmSkip')) {
    confirmOkBtn.click();
    return;
  }
  confirmModal.classList.add('open');
  confirmModal.setAttribute('aria-hidden', 'false');
});

confirmCancelBtn.addEventListener('click', () => {
  confirmModal.classList.remove('open');
  confirmModal.setAttribute('aria-hidden', 'true');
});

confirmOkBtn.addEventListener('click', async () => {
  if (document.getElementById('confirm-skip-checkbox').checked) {
    localStorage.setItem('confirmSkip', '1');
  }
  confirmModal.classList.remove('open');
  confirmModal.setAttribute('aria-hidden', 'true');

  const tasks = previewData.reduce((acc, t, i) => {
    if (t.error || t.exists) return acc;
    const row = document.querySelector(`.voucher-row[data-idx="${i}"]`);
    const descEl = row && row.querySelector('.voucher-description');
    acc.push({
      ...t,
      start_time:  row.querySelector('[data-field="start"]').value,
      end_time:    row.querySelector('[data-field="end"]').value,
      description: descEl ? descEl.value : '',
    });
    return acc;
  }, []);

  const btn        = document.getElementById('execute-btn');
  const outputCard = document.getElementById('output-card');
  const log        = document.getElementById('log');
  const statusDot  = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  btn.disabled = true;
  btn.textContent = 'Creazione…';
  outputCard.style.display = 'block';
  log.innerHTML = '';
  statusDot.className = 'status-dot running';
  statusText.textContent = 'In corso…';

  try {
    const resp = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tustena_api_key: lastTustenaApiKey, float_api_key: lastFloatApiKey, tasks }),
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { log.textContent = text; return; }

    if (!resp.ok) {
      statusDot.className = 'status-dot error';
      statusText.textContent = 'Errore';
      log.innerHTML = `<span class="line-err">${json.error}</span>`;
      return;
    }

    const hasErrors = json.results.some(r => !r.ok);
    json.results.forEach(r => {
      const line = document.createElement('span');
      line.className = r.ok ? 'line-ok' : 'line-err';
      const d = r.date ? r.date.split('-').reverse().join('/') : r.date;
      line.textContent = r.ok ? `✓ ${d} → ID ${r.id}\n` : `✗ ${d}: ${r.error}\n`;
      log.appendChild(line);
    });
    statusDot.className = hasErrors ? 'status-dot error' : 'status-dot ok';
    statusText.textContent = hasErrors ? 'Completato con errori' : 'Completato';
    if (hasErrors) { btn.disabled = false; }
  } catch (err) {
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Errore';
    log.innerHTML = `<span class="line-err">${err.message}</span>`;
    btn.disabled = false;
  } finally {
    btn.textContent = 'Crea Voucher';
  }
});
