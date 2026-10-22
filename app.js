import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {apiRequest} from './api-config.js';
import { getDatabase, ref, get, push, set, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyANtWmjXdlHkf-LO4t2gtpyymmjeEr2emI',
  authDomain: 'repaso-fire-d8ceb.firebaseapp.com',
  databaseURL: 'https://repaso-fire-d8ceb-default-rtdb.firebaseio.com',
  projectId: 'repaso-fire-d8ceb',
  storageBucket: 'repaso-fire-d8ceb.firebasestorage.app',
  messagingSenderId: '1080713449199',
  appId: '1:1080713449199:web:a94fd6c6e26766b4e2551a'
};

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CONCEPT = 'Clases de refuerzo por carrera';
const DRAFT = 'hoja-financiera-draft-v1';
const TITLES = 'hoja-financiera-titles-v1';
const PERIODS_PATH = 'periodosHojaFinanciera';
const INITIAL_PERIOD_ID = '2026-02_2026-08';
const INITIAL_PERIOD = Object.freeze({id: INITIAL_PERIOD_ID, mesInicio:2, anioInicio:2026, mesFin:8, anioFin:2026, etiqueta:'Febrero 2026 - Agosto 2026'});
const $ = id => document.getElementById(id);
const form = $('financeForm');
const list = $('activities');
const template = $('activityTemplate');
const WIZARD_PAGE_NAMES = ['Datos del docente', 'Clases realizadas', 'Revisar y enviar'];
let currentWizardPage = 1;
let teacherSource = '';
let lookupSequence = 0;
const validatedPages = new Set();
let availablePeriods = {[INITIAL_PERIOD_ID]: {...INITIAL_PERIOD}};
let desiredPeriodId = INITIAL_PERIOD_ID;
let activePeriod = {...INITIAL_PERIOD};
let periodState = 'loading';
let submissionInProgress = false;
let documentServiceReady = false;
const PRIVATE_SHEETS_KEY = 'hf-private-sheet-links-v1';
let correctionTarget = null;

let db = null;
try {
  db = getDatabase(initializeApp(firebaseConfig));
  setFirebaseStatus('Firebase preparado', true);
} catch (e) {
  console.error(e);
  setFirebaseStatus('Firebase no disponible', false);
}

bind();
if (!restoreDraft()) addActivity();
updateAll();
goToPage(1, false);
listenActivePeriod();
void checkDocumentService();
checkPrivateSheetLink();

function validPeriod(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const {mesInicio, anioInicio, mesFin, anioFin} = entry;
  return [mesInicio, mesFin].every(v => Number.isInteger(v) && v >= 1 && v <= 12)
    && [anioInicio, anioFin].every(v => Number.isInteger(v) && v >= 2020 && v <= 2100)
    && anioFin * 12 + mesFin >= anioInicio * 12 + mesInicio;
}

function renderPeriodSelector() {
  const control = $('periodSelect');
  const selected = correctionTarget?.periodo || activePeriod || INITIAL_PERIOD;
  const choices = {...availablePeriods};
  if(correctionTarget?.periodo?.id)choices[correctionTarget.periodo.id]=correctionTarget.periodo;
  control.replaceChildren();
  for(const [id,entry] of Object.entries(choices)) {
    const option=document.createElement('option');
    option.value=id;
    option.textContent=entry.etiqueta || id;
    control.append(option);
  }
  control.value=selected.id;
  control.disabled=!!correctionTarget;
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
  const selected=correctionTarget?.periodo || activePeriod;
  const banner=$('periodUnavailable');
  banner.hidden=!!selected;
  if(!selected)banner.textContent='Selecciona un período lectivo válido.';
  ['printBtn','pdfBtn'].forEach(id => {$(id).disabled=!selected;});
  $('submitAdminBtn').disabled=!selected || !documentServiceReady;
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
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (validateForm()) await downloadPdf();
  });
  $('addActivityBtn').addEventListener('click', () => addActivity());
  $('lookupBtn').addEventListener('click', lookupTeacher);
  $('manualTeacherBtn').addEventListener('click', () => {
    if (!/^\d{10}$/.test($('cedula').value.trim())) {
      toast('Ingresa primero la cédula de 10 dígitos.');
      $('cedula').focus();
      return;
    }
    manualTeacher('Registro nuevo: completa los datos; el administrador podrá verificarlos.');
    $('teacherName').focus();
  });
  $('cedula').addEventListener('input', cedulaChanged);
  $('cedula').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); lookupTeacher(); }
  });
  $('teacherTitle').addEventListener('change', rememberTitle);
  $('periodSelect').addEventListener('change', () => {
    if (correctionTarget) return;
    desiredPeriodId=$('periodSelect').value;
    activePeriod=availablePeriods[desiredPeriodId]||availablePeriods[INITIAL_PERIOD_ID];
    renderPeriodAvailability();
    updateAll();
    saveDraft(false);
  });
  $('saveDraftBtn').addEventListener('click', () => saveDraft(true));
  $('printBtn').addEventListener('click', () => { if (validateForm()) window.print(); });
  $('submitAdminBtn').addEventListener('click', submitToAdmin);
  $('statusLookupBtn').addEventListener('click', consultStatus);
  $('signedPdfFile').addEventListener('change', () => {
    const file=$('signedPdfFile').files[0];
    $('signedFileStatus').textContent=file?file.name+' · '+Math.round(file.size/1024)+' KB':'Todavía no has seleccionado el PDF firmado.';
  });
  $('clearBtn').addEventListener('click', clearForm);

  document.querySelectorAll('[data-next-page]').forEach(btn => {
    btn.addEventListener('click', () => goToPage(Number(btn.dataset.nextPage), true));
  });
  document.querySelectorAll('[data-prev-page]').forEach(btn => {
    btn.addEventListener('click', () => goToPage(Number(btn.dataset.prevPage), false));
  });
}

function addActivity(data) {
  data = data || {};
  const frag = template.content.cloneNode(true);
  const card = frag.querySelector('.activity-card');
  card.querySelector('.activity-date').value = data.date || defaultClassDate();
  card.querySelector('.activity-hours').value = data.hours == null ? 2 : data.hours;
  card.querySelector('.activity-notes').value = data.notes || '';
  card.querySelector('.activity-evidence').value = data.evidence || '';
  card.querySelector('.remove-activity').addEventListener('click', () => {
    if (list.children.length <= 1) return toast('Debe existir al menos una clase.');
    card.remove(); renumber(); updateAll();
  });
  list.appendChild(card);
  renumber();
  updateAll();
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
  $('pvName').textContent = $('teacherName').value.trim() || '—';
  $('pvCedula').textContent = $('cedula').value.trim() || '—';
  $('pvTitle').textContent = $('teacherTitle').value.trim() || '—';
  $('pvHoursTotal').textContent = nfmt(totalHours);

  const tbody = $('pvActivities');
  tbody.replaceChildren();
  rows.forEach((r, i) => {
    const d = parseDate(r.date);
    const tr = document.createElement('tr');
    const cells = [
      String(i + 1), CONCEPT, d ? String(d.getMonth() + 1) : '',
      d ? String(d.getDate()) : '', r.valueHour ? nfmt(r.valueHour) : '',
      r.hours ? nfmt(r.hours) : '', r.notes
    ];
    cells.forEach((v, j) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (j === 1) td.className = 'concept-cell';
      if (j === 6) td.className = 'notes-cell';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  const ev = rows.filter(r => r.evidence);
  $('evidencePage').hidden = false;
  $('evName').textContent = $('teacherName').value.trim() || '—';
  $('evCareer').textContent = $('teacherCareer').value.trim() || '—';
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

function addPair(grid, label, value, url) {
  const a = document.createElement('div');
  a.className = 'label'; a.textContent = label;
  const b = document.createElement('div');
  if (url) b.className = 'evidence-url';
  if(url && /^https:\/\//i.test(value)) {
    const link=document.createElement('a');link.href=value;link.textContent=value;
    link.target='_blank';link.rel='noopener noreferrer';link.style.overflowWrap='anywhere';
    b.appendChild(link);
  } else b.textContent=value;
  grid.append(a, b);
}

async function lookupTeacher() {
  const cedula = $('cedula').value.replace(/\D/g, '').slice(0, 10);
  $('cedula').value = cedula;
  const msg = $('lookupMessage');
  msg.className = 'helper';
  if (!/^\d{10}$/.test(cedula)) {
    msg.textContent = 'La cédula debe tener 10 dígitos.';
    msg.classList.add('error');
    return;
  }
  if (!db) return manualTeacher('Firebase no disponible. Completa los datos del docente nuevo.');
  const request = ++lookupSequence;
  $('lookupBtn').disabled = true;
  $('lookupBtn').textContent = 'Buscando…';
  msg.textContent = 'Consultando Firebase…';
  try {
    const snap = await get(ref(db, 'patrociniosGenerados/' + cedula));
    if (request !== lookupSequence || $('cedula').value !== cedula) return;
    if (!snap.exists()) return manualTeacher('No consta en Firebase. Completa los datos del docente nuevo.');
    const record = findRecord(snap.val(), cedula);
    if (!record || !record.docente) return manualTeacher('No se encontró el nombre. Puedes ingresarlo manualmente.');
    teacherSource = 'firebase';
    $('teacherName').value = clean(record.docente);
    $('teacherName').readOnly = true;
    $('teacherName').placeholder = 'Automático o escribe un docente nuevo';
    $('teacherCareer').value = clean(record.carrera || '');
    $('teacherCareer').readOnly = true;
    $('manualTeacherBtn').textContent = '+ Docente nuevo';
    restoreTitle(cedula);
    msg.textContent = 'Docente encontrado en Firebase.';
    msg.className = 'helper success';
    setFirebaseStatus('Firebase conectado', true);
    updateAll();
  } catch (e) {
    console.error(e);
    if (request !== lookupSequence || $('cedula').value !== cedula) return;
    setFirebaseStatus('Sin acceso a la consulta', false);
    manualTeacher('Firebase no pudo consultarse. Ingresa los datos; quedarán pendientes de verificación.');
  } finally {
    if (request === lookupSequence) {
      $('lookupBtn').disabled = false;
      $('lookupBtn').textContent = 'Buscar';
    }
  }
}

function findRecord(value, cedula) {
  if (!value || typeof value !== 'object') return null;
  if (value.docente && (!value.cedula || String(value.cedula) === cedula)) return value;
  for (const child of Object.values(value)) {
    const found = findRecord(child, cedula);
    if (found) return found;
  }
  return null;
}

function manualTeacher(message) {
  lookupSequence++; // Invalida búsquedas anteriores para proteger los datos ingresados.
  teacherSource = 'manual';
  $('lookupBtn').disabled = false;
  $('lookupBtn').textContent = 'Buscar';
  $('teacherName').readOnly = false;
  $('teacherCareer').readOnly = false;
  $('teacherName').placeholder = 'Escribe apellidos y nombres';
  $('teacherCareer').placeholder = 'Escribe la carrera (opcional)';
  $('manualTeacherBtn').textContent = 'Ingreso manual activo';
  const msg = $('lookupMessage');
  msg.textContent = message;
  msg.className = 'helper notice';
  updateAll();
}

function cedulaChanged() {
  const input = $('cedula');
  input.value = input.value.replace(/\D/g, '').slice(0, 10);
  lookupSequence++;
  teacherSource = '';
  $('lookupMessage').textContent = '';
  $('lookupMessage').className = 'helper';
  $('lookupBtn').disabled = false;
  $('lookupBtn').textContent = 'Buscar';
  $('teacherName').value = '';
  $('teacherName').readOnly = true;
  $('teacherName').placeholder = 'Automático o escribe un docente nuevo';
  $('teacherTitle').value = ''; // Nunca reutilizar título de otra cédula.
  $('teacherCareer').value = '';
  $('teacherCareer').readOnly = true;
  $('teacherCareer').placeholder = 'Automática o ingresa la carrera';
  $('manualTeacherBtn').textContent = '+ Docente nuevo';
  if (input.value.length === 10) lookupTeacher();
  updateAll();
}

function rememberTitle() {
  const cedula = $('cedula').value.trim();
  const title = $('teacherTitle').value.trim();
  if (!/^\d{10}$/.test(cedula) || !title) return;
  let data = {};
  try { data = JSON.parse(localStorage.getItem(TITLES) || '{}'); } catch (_) {}
  data[cedula] = title;
  localStorage.setItem(TITLES, JSON.stringify(data));
}

function restoreTitle(cedula) {
  try {
    const data = JSON.parse(localStorage.getItem(TITLES) || '{}');
    if (data[cedula] && !$('teacherTitle').value.trim()) $('teacherTitle').value = data[cedula];
  } catch (_) {}
}

function periodLabel() {
  const period=correctionTarget?.periodo||activePeriod;
  return period ? period.etiqueta : '';
}

function ensurePeriod() {
  if (correctionTarget?.periodo || activePeriod) return true;
  renderPeriodAvailability();
  toast('No hay un período activo. El administrador debe habilitarlo antes de enviar o descargar.');
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
  teacher.textContent = $('teacherName').value.trim() || '—';
  $('reviewCedula').textContent = $('cedula').value.trim() || '—';
  $('reviewCareer').textContent = $('teacherCareer').value.trim() || 'No registrada';
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
  ['teacherName','teacherTitle'].forEach(id => {
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
  const period=correctionTarget?.periodo||activePeriod;
  if (!period) return true;
  const month = date.slice(0,7);
  return month >= period.anioInicio + '-' + String(period.mesInicio).padStart(2,'0') &&
    month <= period.anioFin + '-' + String(period.mesFin).padStart(2,'0');
}

function defaultClassDate() {
  const now = today();
  const period=correctionTarget?.periodo||activePeriod;
  if (!period || validClassDate(now)) return now;
  return period.anioInicio + '-' + String(period.mesInicio).padStart(2,'0') + '-01';
}

function validEvidenceUrl(value) {
  if (!value) return true;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
}

function validateActivityCard(card) {
  const date = card.querySelector('.activity-date');
  const hours = card.querySelector('.activity-hours');
  const notes = card.querySelector('.activity-notes');
  const evidence = card.querySelector('.activity-evidence');

  const badDate = !date.value || !date.checkValidity() || !validClassDate(date.value);
  const badHours = !hours.value.trim() || !hours.checkValidity() ||
    !Number.isFinite(Number(hours.value)) || Number(hours.value) <= 0;
  const badNotes = !notes.value.trim();
  // La evidencia es opcional; si hay un enlace, debe ser válido.
  const badEvidence = !!evidence.value.trim() && (!evidence.checkValidity() || !validEvidenceUrl(evidence.value.trim()));

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
    rememberTitle();
    return true;
  }
  if (page === 2) {
    validatedPages.add(2);
    if (!validateActivityCards()) {
      return reportValidationError(2, 'Completa los campos rojos de las clases. La evidencia es opcional.');
    }
    return true;
  }
  return true;
}

function validateForm() {
  if (!ensurePeriod()) return false;
  if (!validateWizardPage(1)) return false;
  if (!validateWizardPage(2)) return false;
  rememberTitle();
  return true;
}

function fail(message, el) {
  toast(message);
  if (el) el.focus();
  return false;
}


function privateSheets() {
  try{return JSON.parse(localStorage.getItem(PRIVATE_SHEETS_KEY)||'{}');}catch{return {};}
}
function savePrivateSheet(id,cedula,capability) {
  try{
    const all=privateSheets();
    all[id]={cedula,capability};
    localStorage.setItem(PRIVATE_SHEETS_KEY,JSON.stringify(all));
  }catch(error){console.warn('No se guardó el enlace privado:',error);}
}
function sheetCapability(id) {
  const all=privateSheets();
  const query=new URLSearchParams(location.search);
  if(query.get('hoja')===id&&query.get('clave'))return query.get('clave');
  return all[id]?.capability||'';
}
function readSignedPdf(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('No fue posible leer el PDF seleccionado'));
    reader.onload=()=>resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
function submissionPayload() {
  const rows=activities();
  return {
    cedula:$('cedula').value.trim(),
    docente:$('teacherName').value.trim(),
    tituloSuperior:$('teacherTitle').value.trim(),
    carrera:$('teacherCareer').value.trim(),
    origenDocente:teacherSource==='manual'?'manual':'firebase',
    actividades:rows
  };
}
async function loadCorrection(id,capability) {
  try {
    const result=await apiRequest('/api/private/sheet?id='+encodeURIComponent(id),{sheetToken:capability});
    if(result.estado!=='Observada') {
      toast('Esta hoja no está devuelta para corrección. Estado: '+result.estado);
      return;
    }
    correctionTarget={id,capability,periodo:result.periodo};
    renderPeriodSelector();
    $('cedula').value=result.cedula||'';
    $('teacherName').value=result.docente||'';
    $('teacherTitle').value=result.tituloSuperior||'';
    $('teacherCareer').value=result.carrera||'';
    teacherSource='manual';
    $('teacherName').readOnly=false;
    $('teacherCareer').readOnly=false;
    $('manualTeacherBtn').textContent='Edición de hoja observada';
    list.replaceChildren();
    for(const activity of result.actividades||[])addActivity(activity);
    if(!list.children.length)addActivity();
    $('statusResults').hidden=false;
    $('statusResults').replaceChildren();
    const note=document.createElement('strong');
    note.textContent='Observaciones de tu hoja:';
    const msg=document.createElement('p');
    msg.textContent=result.observacionAdmin||'Corrige y vuelve a subir el PDF firmado.';
    $('statusResults').append(note,msg);
    renderPeriodAvailability();
    updateAll();
    goToPage(1,false);
    toast('Hoja observada recuperada. Corrige, descarga otro PDF y súbelo firmado.');
  }catch(e){toast('No se pudo recuperar la hoja privada: '+e.message);}
}
function checkPrivateSheetLink() {
  const params=new URLSearchParams(location.search);
  const id=params.get('hoja'),capability=params.get('clave');
  if(id&&capability)void loadCorrection(id,capability);
}
async function consultStatus() {
  const cedula=$('cedula').value.replace(/\D/g,'');
  if(!/^\d{10}$/.test(cedula)){toast('Ingresa tu cédula de 10 dígitos.');return;}
  const box=$('statusResults');
  box.hidden=false;
  box.textContent='Buscando hojas registradas…';
  try {
    const result=await apiRequest('/api/status?cedula='+encodeURIComponent(cedula));
    box.replaceChildren();
    if(!result.hojas.length){
      box.textContent='No existen PDF firmados recibidos para esta cédula.';
      correctionTarget=null;
      return;
    }
    for(const h of result.hojas) {
      const card=document.createElement('div');
      card.style.cssText='border-bottom:1px solid #dce5ee;padding:8px 0';
      const line=document.createElement('strong');line.textContent=h.periodo+' · '+h.estado;
      card.append(line);
      if(h.estado==='Observada') {
        const cap=sheetCapability(h.id);
        if(cap) {
          const btn=document.createElement('button');btn.type='button';btn.className='btn btn-secondary';
          btn.style.margin='6px 0 0';
          btn.textContent='Preparar corrección de esta hoja';
          btn.addEventListener('click',()=>void loadCorrection(h.id,cap));
          card.append(document.createElement('br'),btn);
        } else {
          const p=document.createElement('small');
          p.textContent='Para corregirla necesitas el enlace privado que recibiste al subir el PDF.';
          card.append(document.createElement('br'),p);
        }
      }
      box.append(card);
    }
  } catch(e){box.textContent='No se pudo consultar el estado: '+e.message;}
}
async function checkDocumentService() {
  const indicator=$('documentServiceStatus');
  try {
    const health=await apiRequest('/api/health');
    documentServiceReady=health.ok===true;
    if(documentServiceReady) {
      indicator.textContent='Recepción de PDF firmados disponible.';
      indicator.dataset.status='ready';
    } else {
      indicator.textContent=health.reason==='credentials-required'
        ? 'La recepción de PDF firmados está pendiente de habilitación institucional. Puedes preparar y descargar tu hoja.'
        : 'La recepción de PDF firmados no está disponible en este momento. Conserva el documento para subirlo después.';
      indicator.dataset.status='unavailable';
    }
  } catch(e) {
    documentServiceReady=false;
    indicator.textContent='No es posible conectar con la recepción de PDF. Puedes descargar tu hoja e intentarlo más tarde.';
    indicator.dataset.status='unavailable';
  }
  renderPeriodAvailability();
}
async function submitToAdmin() {
  if(submissionInProgress)return;
  if(!documentServiceReady)return toast('La recepción de PDF firmados aún no está disponible. Conserva tu PDF para enviarlo después.');
  if(!validateForm())return;
  const file=$('signedPdfFile').files?.[0];
  if(!file)return fail('Selecciona el PDF que ya firmaste.', $('signedPdfFile'));
  if(file.size>10*1024*1024||file.size<100||!file.name.toLowerCase().endsWith('.pdf'))
    return fail('Solo se permiten archivos PDF de hasta 10 MB.', $('signedPdfFile'));
  submissionInProgress=true;
  const btn=$('submitAdminBtn');
  btn.disabled=true;btn.textContent='Subiendo PDF firmado…';
  try {
    const pdf=await readSignedPdf(file);
    const hoja=submissionPayload();
    let result;
    if(correctionTarget) {
      result=await apiRequest('/api/revise',{
        method:'POST',
        data:{id:correctionTarget.id,capability:correctionTarget.capability,hoja,pdf}
      });
      correctionTarget=null;
    } else {
      result=await apiRequest('/api/submit',{method:'POST',data:{hoja,pdf,periodoId:activePeriod?.id}});
      savePrivateSheet(result.id,hoja.cedula,result.capability);
    }
    $('signedPdfFile').value='';
    $('signedFileStatus').textContent='Documento firmado recibido correctamente.';
    setSubmissionNote('PDF firmado recibido','Hoja: '+result.id+' · Estado: '+result.estado+'. Conserva el enlace privado de tu hoja.',true);
    const link=document.createElement('a');
    link.href=location.origin+location.pathname+'?hoja='+encodeURIComponent(result.id)+'&clave='+encodeURIComponent(result.capability||sheetCapability(result.id));
    link.textContent='Guardar enlace privado de la hoja';
    link.style.display='block';link.style.marginTop='7px';
    $('submissionNote').append(link);
    toast('PDF firmado cargado y registrado.');
    saveDraft(false);
  } catch(e) {
    console.error(e);
    setSubmissionNote('No se recibió el archivo firmado',e.message,false);
    toast('Error al subir el PDF: '+e.message);
  } finally {
    submissionInProgress=false;
    btn.disabled=(!activePeriod&&!correctionTarget?.periodo)||!documentServiceReady;
    btn.textContent='Subir PDF firmado';
  }
}

function setSubmissionNote(title, detail, ok) {
  const note = $('submissionNote');
  note.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = detail;
  note.append(strong, span);
  note.style.borderColor = ok ? '#b9dfcc' : '#efc4c0';
  note.style.background = ok ? '#f0fbf5' : '#fff6f5';
}

async function downloadPdf() {
  if (!window.html2pdf) {
    toast('No se cargó el generador PDF. Usa Imprimir → Guardar como PDF.');
    window.print();
    return;
  }
  document.body.classList.add('pdf-export');
  const filename = 'HOJA_FINANCIERA_' + fileSafe($('teacherName').value || 'DOCENTE') + '_' + fileSafe(periodLabel()) + '.pdf';
  const options = {
    margin: 0,
    filename,
    image: {type:'jpeg', quality:0.98},
    html2canvas: {scale:2, useCORS:true, backgroundColor:'#ffffff'},
    jsPDF: {unit:'mm', format:'a4', orientation:'portrait'},
    pagebreak: {mode:['css','legacy']}
  };
  try {
    toast('Generando PDF…');
    await window.html2pdf().set(options).from($('pdfContent')).save();
  } catch (e) {
    console.error(e);
    toast('No se pudo descargar directamente. Usa Imprimir → Guardar como PDF.');
  } finally {
    document.body.classList.remove('pdf-export');
  }
}

function saveDraft(showMessage) {
  const data = {
    cedula:$('cedula').value, teacherName:$('teacherName').value,
    teacherSource:teacherSource,
    teacherTitle:$('teacherTitle').value, teacherCareer:$('teacherCareer').value,
    periodId:correctionTarget?.periodo?.id||activePeriod?.id||INITIAL_PERIOD_ID,
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
    ['cedula','teacherName','teacherTitle','teacherCareer'].forEach(k => {
      if (d[k] != null) $(k).value = d[k];
    });
    teacherSource = d.teacherName ? (d.teacherSource === 'firebase' ? 'firebase' : 'manual') : '';
    desiredPeriodId = typeof d.periodId==='string' ? d.periodId : INITIAL_PERIOD_ID;
    activePeriod = availablePeriods[desiredPeriodId] || availablePeriods[INITIAL_PERIOD_ID];
    renderPeriodSelector();
    $('teacherName').readOnly = teacherSource !== 'manual';
    $('teacherCareer').readOnly = teacherSource !== 'manual';
    $('manualTeacherBtn').textContent = teacherSource === 'manual' ? 'Ingreso manual activo' : '+ Docente nuevo';
    if (teacherSource === 'manual') {
      $('lookupMessage').textContent = 'Docente de ingreso manual en borrador. Verifica los datos.';
      $('lookupMessage').className = 'helper notice';
    }
    list.replaceChildren();
    (d.activities && d.activities.length ? d.activities : [{}]).forEach(addActivity);
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
  form.reset();
  correctionTarget = null;
  desiredPeriodId = INITIAL_PERIOD_ID;
  activePeriod = availablePeriods[INITIAL_PERIOD_ID];
  renderPeriodSelector();
  renderPeriodAvailability();
  lookupSequence++;
  teacherSource = '';
  $('teacherName').readOnly = true;
  $('teacherCareer').readOnly = true;
  $('manualTeacherBtn').textContent = '+ Docente nuevo';
  $('lookupMessage').className = 'helper';
  $('lookupMessage').textContent = '';
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
function nfmt(v) { return Number(v || 0).toLocaleString('es-EC', {maximumFractionDigits:2}); }
function clean(v) { return String(v || '').replace(/\s+/g,' ').trim(); }
function fileSafe(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').toUpperCase(); }

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}
function setFirebaseStatus(text, ok) {
  const el = $('firebaseStatus');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = ok ? '1' : '.75';
}
