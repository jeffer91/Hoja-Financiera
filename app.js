import {apiRequest} from './api-config.js';
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CONCEPT = 'Clases de refuerzo por carrera';
const DRAFT = 'hoja-financiera-draft-v1';
const INITIAL_PERIOD_ID = '2026-02_2026-08';
const INITIAL_PERIOD = Object.freeze({id: INITIAL_PERIOD_ID, mesInicio:2, anioInicio:2026, mesFin:8, anioFin:2026, etiqueta:'Febrero 2026 - Agosto 2026'});
const $ = id => document.getElementById(id);
const form = $('financeForm');
const list = $('activities');
const template = $('activityTemplate');
const WIZARD_PAGE_NAMES = ['Datos del docente', 'Clases realizadas', 'Revisar y generar'];
let currentWizardPage = 1;
const validatedPages = new Set();
let availablePeriods = {[INITIAL_PERIOD_ID]: {...INITIAL_PERIOD}};
let desiredPeriodId = INITIAL_PERIOD_ID;
let activePeriod = {...INITIAL_PERIOD};
let periodState = 'loading';
let exporting = false;
let draftTimer;
bind();
if (!restoreDraft()) addActivity();
updateAll();
goToPage(1, false);
listenActivePeriod();


function validPeriod(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const {mesInicio, anioInicio, mesFin, anioFin} = entry;
  return [mesInicio, mesFin].every(v => Number.isInteger(v) && v >= 1 && v <= 12)
    && [anioInicio, anioFin].every(v => Number.isInteger(v) && v >= 2020 && v <= 2100)
    && anioFin * 12 + mesFin >= anioInicio * 12 + mesInicio;
}

function renderPeriodSelector() {
  const control = $('periodSelect');
  const selected = activePeriod || INITIAL_PERIOD;
  const choices = {...availablePeriods};
  control.replaceChildren();
  for(const [id,entry] of Object.entries(choices)) {
    const option=document.createElement('option');
    option.value=id;
    option.textContent=entry.etiqueta || id;
    control.append(option);
  }
  control.value=selected.id;
}

function setActivePeriod(data) {
  const choices = {[INITIAL_PERIOD_ID]: {...INITIAL_PERIOD}};
  for(const [id,entry] of Object.entries(data?.periodos || {})) {
    if(validPeriod(entry) && /^\d{4}-\d{2}_\d{4}-\d{2}$/.test(id)) {
      choices[id]={...entry,id,etiqueta:entry.etiqueta || (MONTHS[entry.mesInicio-1]+' '+entry.anioInicio+' - '+MONTHS[entry.mesFin-1]+' '+entry.anioFin)};
    }
  }
  availablePeriods=choices;
  activePeriod=availablePeriods[desiredPeriodId]||availablePeriods[INITIAL_PERIOD_ID];
  periodState='ready';
  renderPeriodSelector();
  renderPeriodAvailability();
  updateAll();
}

function renderPeriodAvailability() {
  const selected=activePeriod;
  const banner=$('periodUnavailable');
  banner.hidden=Boolean(selected);
  if(!selected)banner.textContent='Selecciona un período lectivo válido.';
  ['printBtn','pdfBtn'].forEach(id => {$(id).disabled=!selected;});
}

function listenActivePeriod() {
  renderPeriodSelector();
  renderPeriodAvailability();
  void apiRequest('/api/periods').then(data=>setActivePeriod(data)).catch(error=>{
    console.warn('No se pudo consultar el catálogo de períodos; se mantiene el período inicial.',error);
    periodState='error';
    renderPeriodAvailability();
  });
}

function bind() {
  form.addEventListener('input', updateAll);
  form.addEventListener('change', updateAll);
  for (const event of ['input','change']) form.addEventListener(event, scheduleDraft);
  window.addEventListener('pagehide', () => saveDraft(false));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (validateForm()) await downloadPdf();
  });
  $('addActivityBtn').addEventListener('click', () => addActivity());
  $('cedula').addEventListener('input', sanitizeCedula);
  $('teacherCareer').addEventListener('change', toggleCareerOther);
  $('periodSelect').addEventListener('change', () => {
    desiredPeriodId=$('periodSelect').value;
    activePeriod=availablePeriods[desiredPeriodId]||availablePeriods[INITIAL_PERIOD_ID];
    renderPeriodAvailability();
    updateAll();
    saveDraft(false);
  });
  $('saveDraftBtn').addEventListener('click', () => saveDraft(true));
  $('printBtn').addEventListener('click', () => { if (validateForm()) window.print(); });
  $('clearBtn').addEventListener('click', clearForm);

  document.querySelectorAll('[data-next-page]').forEach(btn => {
    btn.addEventListener('click', () => goToPage(Number(btn.dataset.nextPage), true));
  });
  document.querySelectorAll('[data-prev-page]').forEach(btn => {
    btn.addEventListener('click', () => goToPage(Number(btn.dataset.prevPage), false));
  });
}

function addActivity(data) {
  if (list.children.length >= 80) return toast('Se permiten hasta 80 clases por hoja.');
  data = data || {};
  const frag = template.content.cloneNode(true);
  const card = frag.querySelector('.activity-card');
  card.querySelector('.activity-date').value = data.date || defaultClassDate();
  const hoursInput = card.querySelector('.activity-hours');
  const initialHours = data.hours == null ? 2 : Number(data.hours);
  hoursInput.value = Number.isFinite(initialHours) ? initialHours.toFixed(2) : '';
  hoursInput.addEventListener('blur', () => {
    const value = Number(hoursInput.value);
    if (hoursInput.value.trim() && hoursInput.checkValidity() && Number.isFinite(value)) {
      hoursInput.value = value.toFixed(2);
    }
  });
  card.querySelector('.activity-notes').value = data.notes || '';
  card.querySelector('.activity-evidence').value = data.evidence || '';
  card.querySelector('.remove-activity').addEventListener('click', () => {
    if (list.children.length <= 1) return toast('Debe existir al menos una clase.');
    card.remove(); renumber(); updateAll(); scheduleDraft();
  });
  list.appendChild(card);
  renumber();
  updateAll();
  scheduleDraft();
}

function renumber() {
  [...list.children].forEach((card, i) => {
    card.querySelector('.activity-number').textContent = String(i + 1);
  });
}

function activities() {
  return [...list.querySelectorAll('.activity-card')].map(card => ({
    date: card.querySelector('.activity-date').value,
    valueHour: null,
    hours: num(card.querySelector('.activity-hours').value),
    notes: card.querySelector('.activity-notes').value.trim(),
    evidence: card.querySelector('.activity-evidence').value.trim()
  }));
}

function updateAll() {
  const rows = activities();
  const hours = rows.reduce((s, r) => s + r.hours, 0);
  $('classCount').textContent = rows.length;
  $('hoursTotal').textContent = nfmt(hours);
  updateWizardSummary();
  renderPreview(rows, hours);
  // Las marcas rojas se actualizan en tiempo real tras intentar avanzar.
  if (validatedPages.has(1)) validateTeacherFields();
  if (validatedPages.has(2)) validateActivityCards();
}

function renderPreview(rows, totalHours) {
  const period = periodLabel();
  $('pvPeriod').textContent = period || '—';
  $('pvName').textContent = fullTeacherName() || '—';
  $('pvCedula').textContent = $('cedula').value.trim() || '—';
  $('pvTitle').textContent = $('teacherTitle').value.trim() || '—';
  $('pvSubject').textContent = careerValue() || CONCEPT;
  $('pvHoursTotal').textContent = nfmt(totalHours);

  renderOfficialFinancialPages(rows);

  const ev = rows.filter(r => r.evidence);
  $('evidencePage').hidden = ev.length === 0;
  $('evName').textContent = fullTeacherName() || '—';
  $('evCareer').textContent = careerValue() || '—';
  $('evPeriod').textContent = period || '—';
  const evList = $('evidenceList');
  evList.replaceChildren();
  ev.forEach((r, i) => {
    const box = document.createElement('div');
    box.className = 'evidence-item';
    const head = document.createElement('div');
    head.className = 'ev-title';
    head.textContent = 'Grabación / evidencia ' + (i + 1);
    const grid = document.createElement('div');
    grid.className = 'evidence-grid';
    addPair(grid, 'Fecha:', longDate(r.date));
    addPair(grid, 'Tiempo de clase:', nfmt(r.hours) + ' HORAS');
    addPair(grid, 'Enlace:', r.evidence, true);
    box.append(head, grid);
    evList.appendChild(box);
  });
}

// El formato institucional de referencia usa papel Carta y 23 renglones
// numerados, más siete renglones vacíos de reserva. No se descartan clases:
// si exceden la capacidad, se generan hojas de continuación.
const OFFICIAL_NUMBERED_ROWS = 23;
const OFFICIAL_SPACER_ROWS = 7;

function paginateFinancialRows(rows) {
  const pages = [];
  let page = [], estimatedUnits = 0;
  for (const row of rows) {
    // Las observaciones largas ocupan más líneas: usar menos registros
    // en esa hoja para evitar que el PDF corte la tabla o las firmas.
    const cost = 1 + Math.min(18, Math.floor((row.notes || '').length / 90));
    if (page.length && (page.length >= OFFICIAL_NUMBERED_ROWS || estimatedUnits + cost > OFFICIAL_NUMBERED_ROWS)) {
      pages.push(page);
      page = [];
      estimatedUnits = 0;
    }
    page.push(row);
    estimatedUnits += cost;
  }
  pages.push(page);
  return pages;
}

function renderOfficialFinancialPages(rows) {
  const content = $('pdfContent');
  const first = $('financialPage');
  content.querySelectorAll('.financial-continuation').forEach(node => node.remove());

  const pageRows = paginateFinancialRows(rows);
  let rowOffset = 0;
  pageRows.forEach((batch, pageIndex) => {
    const isLast = pageIndex === pageRows.length - 1;
    const sheet = pageIndex === 0 ? first : first.cloneNode(true);

    if (pageIndex > 0) {
      sheet.removeAttribute('id');
      sheet.classList.add('financial-continuation');
      sheet.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      content.insertBefore(sheet, $('evidencePage'));
    }

    const tbody = sheet.querySelector('.activities-table tbody');
    tbody.replaceChildren();
    for (let index = 0; index < OFFICIAL_NUMBERED_ROWS + OFFICIAL_SPACER_ROWS; index++) {
      const numbered = index < OFFICIAL_NUMBERED_ROWS;
      const row = numbered ? batch[index] : null;
      const date = row ? parseDate(row.date) : null;
      const tr = document.createElement('tr');
      if (!numbered) tr.className = 'official-spacer-row';
      const cells = [
        numbered && (row || isLast) ? String(rowOffset + index + 1) : '',
        row ? CONCEPT : '',
        date ? String(date.getMonth() + 1) : '',
        date ? String(date.getDate()) : '',
        row && row.valueHour != null ? nfmt(row.valueHour) : '',
        row && row.hours ? nfmt(row.hours) : '',
        row ? row.notes : ''
      ];
      cells.forEach((value, column) => {
        const td = document.createElement('td');
        td.textContent = value;
        if (column === 1) td.className = 'concept-cell';
        if (column === 6) td.className = 'notes-cell';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }

    sheet.querySelector('.activities-table tfoot').hidden = !isLast;
    sheet.querySelector('.signatures').hidden = !isLast;
    rowOffset += batch.length;
  });
}

function addPair(grid, label, value, url) {
  const a = document.createElement('div');
  a.className = 'label'; a.textContent = label;
  const b = document.createElement('div');
  if (url) b.className = 'evidence-url';
  if(url && validEvidenceUrl(value)) {
    const link=document.createElement('a');link.href=value;link.textContent=value;
    link.target='_blank';link.rel='noopener noreferrer';link.style.overflowWrap='anywhere';
    b.appendChild(link);
  } else b.textContent=value;
  grid.append(a, b);
}

// La cédula se revisa localmente; no se consultan datos de docentes.
function sanitizeCedula() {
  const input = $('cedula');
  input.value = input.value.replace(/\D/g, '').slice(0, 10);
}

function toggleCareerOther() {
  const other = $('teacherCareer').value === '__other__';
  $('teacherCareerOtherLabel').hidden = !other;
  if (!other) $('teacherCareerOther').value = '';
}

function fullTeacherName() {
  return [clean($('teacherLastNames').value), clean($('teacherFirstNames').value)].filter(Boolean).join(' ');
}

function careerValue() {
  return ($('teacherCareer').value === '__other__'
    ? $('teacherCareerOther').value
    : $('teacherCareer').value).trim();
}

function periodLabel() {
  const period=activePeriod;
  return period ? period.etiqueta : '';
}

function ensurePeriod() {
  if (activePeriod) return true;
  renderPeriodAvailability();
  toast('Selecciona un período válido antes de descargar.');
  return false;
}

function goToPage(target, validateForward = true) {
  target = Number(target);
  if (!Number.isInteger(target) || target < 1 || target > 3) return;
  if (validateForward && target > currentWizardPage && !validateWizardPage(currentWizardPage)) return;

  currentWizardPage = target;

  document.querySelectorAll('[data-wizard-page]').forEach(page => {
    const active = Number(page.dataset.wizardPage) === target;
    page.hidden = !active;
    page.classList.toggle('is-active', active);
  });

  document.querySelectorAll('[data-step-indicator]').forEach(step => {
    const n = Number(step.dataset.stepIndicator);
    step.classList.toggle('is-active', n === target);
    step.classList.toggle('is-complete', n < target);
  });

  const label = $('wizardPageLabel');
  const name = $('wizardPageName');
  if (label) label.textContent = 'Paso ' + target + ' de 3';
  if (name) name.textContent = WIZARD_PAGE_NAMES[target - 1];

  updateWizardSummary();
  const panel = document.querySelector('.form-panel');
  if (panel) panel.scrollIntoView({behavior:'smooth', block:'start'});
}

function updateWizardSummary() {
  const teacher = $('reviewTeacher');
  if (!teacher) return;
  teacher.textContent = fullTeacherName() || '—';
  $('reviewCedula').textContent = $('cedula').value.trim() || '—';
  $('reviewCareer').textContent = careerValue() || 'No registrada';
}

function markFieldInvalid(field, invalid) {
  if (!field) return;
  field.classList.toggle('is-invalid', invalid);
  if (invalid) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  const label = field.closest('label');
  if (label) label.classList.toggle('label-error', invalid);
}

function clearAllValidation() {
  validatedPages.clear();
  form.querySelectorAll('.is-invalid').forEach(field => markFieldInvalid(field, false));
  form.querySelectorAll('.activity-card.has-errors').forEach(card => card.classList.remove('has-errors'));
}

function validateTeacherFields() {
  let valid = true;
  const cedula = $('cedula');
  const badCedula = !/^\d{10}$/.test(cedula.value.trim());
  markFieldInvalid(cedula, badCedula);
  if (badCedula) valid = false;
  ['teacherLastNames','teacherFirstNames','teacherTitle'].forEach(id => {
    const field = $(id);
    const bad = !field.value.trim();
    markFieldInvalid(field, bad);
    if (bad) valid = false;
  });
  return valid;
}

function validClassDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y,m,d] = date.split('-').map(Number);
  const actual = new Date(y, m-1, d);
  if (actual.getFullYear() !== y || actual.getMonth() !== m-1 || actual.getDate() !== d) return false;
  const period=activePeriod;
  if (!period) return true;
  const month = date.slice(0,7);
  return month >= period.anioInicio + '-' + String(period.mesInicio).padStart(2,'0') &&
    month <= period.anioFin + '-' + String(period.mesFin).padStart(2,'0');
}

function defaultClassDate() {
  const now = today();
  const period=activePeriod;
  if (!period || validClassDate(now)) return now;
  return period.anioInicio + '-' + String(period.mesInicio).padStart(2,'0') + '-01';
}

function validEvidenceUrl(value) {
  if (!value || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !!url.hostname;
  } catch { return false; }
}

function validateActivityCard(card) {
  const date = card.querySelector('.activity-date');
  const hours = card.querySelector('.activity-hours');
  const notes = card.querySelector('.activity-notes');
  const evidence = card.querySelector('.activity-evidence');

  const badDate = !date.value || !date.checkValidity() || !validClassDate(date.value);
  const badHours = !hours.value.trim() || !hours.checkValidity() ||
    !Number.isFinite(Number(hours.value)) || Number(hours.value) <= 0 || Number(hours.value) > 24;
  const badNotes = !notes.value.trim();
  // Cada clase debe incluir una dirección HTTPS de evidencia válida.
  const badEvidence = !evidence.value.trim() || !evidence.checkValidity() || !validEvidenceUrl(evidence.value.trim());

  markFieldInvalid(date, badDate);
  markFieldInvalid(hours, badHours);
  markFieldInvalid(notes, badNotes);
  markFieldInvalid(evidence, badEvidence);

  const invalid = badDate || badHours || badNotes || badEvidence;
  card.classList.toggle('has-errors', invalid);
  return !invalid;
}

function validateActivityCards() {
  const cards = [...list.querySelectorAll('.activity-card')];
  if (!cards.length) return false;
  let valid = true;
  cards.forEach(card => { if (!validateActivityCard(card)) valid = false; });
  return valid;
}

function reportValidationError(page, message) {
  if (currentWizardPage !== page) goToPage(page, false);
  const target = document.querySelector('[data-wizard-page="' + page + '"] .is-invalid');
  if (target && !target.readOnly) target.focus();
  toast(message);
  return false;
}

function validateWizardPage(page) {
  if (page === 1) {
    validatedPages.add(1);
    if (!validateTeacherFields()) {
      return reportValidationError(1, 'Revisa los campos marcados en rojo de los datos del docente.');
    }
    return true;
  }
  if (page === 2) {
    validatedPages.add(2);
    if (!validateActivityCards()) {
      return reportValidationError(2, 'Completa los campos rojos: cada clase requiere un enlace HTTPS de grabación o evidencia.');
    }
    return true;
  }
  return true;
}

function validateForm() {
  if (!ensurePeriod()) return false;
  if (!validateWizardPage(1)) return false;
  if (!validateWizardPage(2)) return false;
  return true;
}

function fail(message, el) {
  toast(message);
  if (el) el.focus();
  return false;
}


async function downloadPdf() {
  if (exporting) return;
  if (!window.html2pdf) {
    toast('No se cargó el generador PDF. Usa Imprimir → Guardar como PDF.');
    window.print();
    return;
  }
  exporting = true;
  $('pdfBtn').disabled = true;
  $('pdfBtn').textContent = 'Generando…';
  saveDraft(false);
  document.body.classList.add('pdf-export');
  const filename = 'HOJA_FINANCIERA_' + fileSafe(fullTeacherName() || 'DOCENTE') + '_' + fileSafe(periodLabel()) + '.pdf';
  const options = {
    margin: 0,
    filename,
    image: {type:'jpeg', quality:0.98},
    html2canvas: {scale:2, useCORS:true, backgroundColor:'#ffffff'},
    jsPDF: {unit:'mm', format:'letter', orientation:'portrait'},
    pagebreak: {mode:['css','legacy']}
  };
  try {
    toast('Generando PDF…');
    await Promise.all([...$('pdfContent').querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    await window.html2pdf().set(options).from($('pdfContent')).save();
    toast('PDF generado. El proceso ha finalizado.');
  } catch (e) {
    console.error(e);
    toast('No se pudo descargar directamente. Usa Imprimir → Guardar como PDF.');
  } finally {
    document.body.classList.remove('pdf-export');
    exporting = false;
    $('pdfBtn').disabled = false;
    $('pdfBtn').textContent = 'Descargar PDF';
  }
}

function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveDraft(false), 400);
}

function saveDraft(showMessage) {
  const data = {
    cedula:$('cedula').value, teacherLastNames:$('teacherLastNames').value, teacherFirstNames:$('teacherFirstNames').value,
    teacherTitle:$('teacherTitle').value, teacherCareer:careerValue(),
    periodId:activePeriod?.id||INITIAL_PERIOD_ID,
    activities:activities()
  };
  try { localStorage.setItem(DRAFT, JSON.stringify(data)); }
  catch (error) { console.warn('No se pudo guardar el borrador local.',error); if (showMessage) toast('El navegador no permitió guardar el borrador.'); return; }
  if (showMessage) toast('Borrador guardado en este dispositivo.');
}

function restoreDraft() {
  let raw = null;
  try { raw = localStorage.getItem(DRAFT); } catch (error) { console.warn(error); return false; }
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || !Array.isArray(d.activities)) return false;
    ['cedula','teacherLastNames','teacherFirstNames','teacherTitle'].forEach(k => {
      if (d[k] != null) $(k).value = d[k];
    });
    // No adivinar dónde terminan los apellidos de borradores previos.
    // Conservar todo el nombre antiguo y solicitar que el docente lo separe.
    if (typeof d.teacherName === 'string' && d.teacherName.trim() &&
        !d.teacherLastNames && !d.teacherFirstNames) {
      $('teacherLastNames').value = d.teacherName.trim();
      $('legacyNameNotice').hidden = false;
    } else {
      $('legacyNameNotice').hidden = true;
    }
    const career = typeof d.teacherCareer === 'string' ? d.teacherCareer : '';
    const isListed = Array.from($('teacherCareer').options).some(o => o.value === career);
    $('teacherCareer').value = isListed ? career : (career ? '__other__' : '');
    $('teacherCareerOther').value = isListed ? '' : career;
    toggleCareerOther();
    desiredPeriodId = typeof d.periodId==='string' ? d.periodId : INITIAL_PERIOD_ID;
    activePeriod = availablePeriods[desiredPeriodId] || availablePeriods[INITIAL_PERIOD_ID];
    renderPeriodSelector();
    list.replaceChildren();
    (d.activities.length ? d.activities.slice(0,80) : [{}]).forEach(addActivity);
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}

function clearForm() {
  if (!confirm('¿Deseas limpiar la hoja actual?')) return;
  try { localStorage.removeItem(DRAFT); } catch (error) { console.warn(error); }
  clearAllValidation();
  clearTimeout(draftTimer);
  form.reset();
  $('legacyNameNotice').hidden = true;
  toggleCareerOther();
  desiredPeriodId = INITIAL_PERIOD_ID;
  activePeriod = availablePeriods[INITIAL_PERIOD_ID];
  renderPeriodSelector();
  renderPeriodAvailability();
  list.replaceChildren();
  addActivity();
  updateAll();
  goToPage(1, false);
  toast('Formulario limpio.');
}

function parseDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null;
  const p = v.split('-').map(Number);
  return new Date(p[0], p[1]-1, p[2]);
}
function longDate(v) {
  const d = parseDate(v);
  if (!d) return '—';
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function nfmt(v) { return Number(v || 0).toLocaleString('es-EC', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function clean(v) { return String(v || '').replace(/\s+/g,' ').trim(); }
function fileSafe(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').toUpperCase(); }

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}
