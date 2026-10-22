import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
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
const $ = id => document.getElementById(id);
const form = $('financeForm');
const list = $('activities');
const template = $('activityTemplate');
const WIZARD_PAGE_NAMES = ['Datos del docente', 'Clases realizadas', 'Revisar y enviar'];
let currentWizardPage = 1;
let teacherSource = '';
let lookupSequence = 0;
const validatedPages = new Set();
let activePeriod = null;
let periodState = 'loading';

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

function validPeriod(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const {mesInicio, anioInicio, mesFin, anioFin} = entry;
  return [mesInicio, mesFin].every(v => Number.isInteger(v) && v >= 1 && v <= 12)
    && [anioInicio, anioFin].every(v => Number.isInteger(v) && v >= 2020 && v <= 2100)
    && anioFin * 12 + mesFin >= anioInicio * 12 + mesInicio;
}

function selectActivePeriod(data) {
  const id = data && typeof data.activoId === 'string' ? data.activoId : null;
  const entry = id && data.periodos && data.periodos[id];
  if (!id || !validPeriod(entry)) return null;
  const label = MONTHS[entry.mesInicio - 1] + ' ' + entry.anioInicio +
    ' - ' + MONTHS[entry.mesFin - 1] + ' ' + entry.anioFin;
  return {...entry, id, etiqueta:label};
}

function setActivePeriod(data) {
  activePeriod = selectActivePeriod(data);
  periodState = 'ready';
  renderPeriodAvailability();
  updateAll();
}

function renderPeriodAvailability() {
  const banner = $('periodUnavailable');
  if (activePeriod) {
    banner.hidden = true;
  } else {
    banner.hidden = false;
    banner.textContent = periodState === 'loading'
      ? 'Verificando la disponibilidad del formulario…'
      : periodState === 'error'
        ? 'No se pudo consultar el período autorizado. Contacta a Titulación.'
        : 'No hay un período lectivo activo. Titulación debe habilitarlo antes de enviar una hoja.';
  }
  ['printBtn','pdfBtn','submitAdminBtn'].forEach(id => { $(id).disabled = !activePeriod; });
}

function listenActivePeriod() {
  renderPeriodAvailability();
  if (!db) {
    periodState = 'error';
    renderPeriodAvailability();
    return;
  }
  onValue(ref(db, PERIODS_PATH), snapshot => setActivePeriod(snapshot.val()), error => {
    console.error('No se pudo consultar el período activo:', error);
    activePeriod = null;
    periodState = 'error';
    renderPeriodAvailability();
    updateAll();
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
  $('saveDraftBtn').addEventListener('click', () => saveDraft(true));
  $('printBtn').addEventListener('click', () => { if (validateForm()) window.print(); });
  $('submitAdminBtn').addEventListener('click', submitToAdmin);
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
  card.querySelector('.activity-date').value = data.date || today();
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
  $('evidencePage').hidden = ev.length === 0;
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
  b.textContent = value;
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
  return activePeriod ? activePeriod.etiqueta : '';
}

function ensurePeriod() {
  if (activePeriod) return true;
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

function validateActivityCard(card) {
  const date = card.querySelector('.activity-date');
  const hours = card.querySelector('.activity-hours');
  const notes = card.querySelector('.activity-notes');
  const evidence = card.querySelector('.activity-evidence');

  const badDate = !date.value || !date.checkValidity();
  const badHours = !hours.value.trim() || !hours.checkValidity() ||
    !Number.isFinite(Number(hours.value)) || Number(hours.value) <= 0;
  const badNotes = !notes.value.trim();
  // La evidencia es opcional; si hay un enlace, debe ser válido.
  const badEvidence = !!evidence.value.trim() && !evidence.checkValidity();

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


async function submitToAdmin() {
  if (!validateForm()) return;
  if (!db) {
    toast('Firebase no está disponible. No se pudo enviar la hoja.');
    return;
  }

  // Valida de nuevo en Firebase: el período pudo cambiar mientras se completaba la hoja.
  let confirmedPeriod;
  try {
    const snap = await get(ref(db, PERIODS_PATH));
    confirmedPeriod = selectActivePeriod(snap.val());
  } catch (error) {
    console.error(error);
    toast('No se pudo verificar el período vigente. Intenta nuevamente.');
    return;
  }
  if (!confirmedPeriod) {
    setActivePeriod(null);
    toast('El período fue desactivado. Se canceló el envío.');
    return;
  }
  if (!activePeriod || confirmedPeriod.id !== activePeriod.id) {
    activePeriod = confirmedPeriod;
    periodState = 'ready';
    renderPeriodAvailability();
    updateAll();
    toast('Cambió el período vigente. Revisa tu hoja y vuelve a enviarla.');
    return;
  }
  const rows = activities();
  const totalHours = rows.reduce((sum, item) => sum + item.hours, 0);
  const totalValue = rows.reduce((sum, item) => sum + item.hours * item.valueHour, 0);
  const payload = {
    version: 2,
    valorHoraGestionadoPor: 'Talento Humano',
    concepto: CONCEPT,
    estado: 'Enviada',
    observacionAdmin: '',
    cedula: $('cedula').value.trim(),
    docente: $('teacherName').value.trim(),
    origenDocente: teacherSource === 'manual' ? 'manual' : 'firebase',
    tituloSuperior: $('teacherTitle').value.trim(),
    carrera: $('teacherCareer').value.trim(),
    periodo: {
      id: confirmedPeriod.id,
      mesInicio: confirmedPeriod.mesInicio,
      anioInicio: confirmedPeriod.anioInicio,
      mesFin: confirmedPeriod.mesFin,
      anioFin: confirmedPeriod.anioFin,
      etiqueta: confirmedPeriod.etiqueta
    },
    actividades: rows,
    totales: {
      clases: rows.length,
      horas: totalHours,
      valor: Number(totalValue.toFixed(2))
    },
    evidencias: rows.filter(item => item.evidence).length,
    fechaEnvio: Date.now(),
    fechaActualizacion: Date.now(),
    origen: 'Hoja-Financiera'
  };

  const btn = $('submitAdminBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  try {
    const target = push(ref(db, 'hojasFinancieras'));
    await set(target, payload);
    localStorage.setItem('hoja-financiera-last-submission', JSON.stringify({
      id: target.key,
      fechaEnvio: payload.fechaEnvio,
      cedula: payload.cedula
    }));
    saveDraft(false);
    setSubmissionNote('Hoja enviada correctamente', 'Código: ' + target.key + ' · Estado: Enviada.', true);
    toast('Hoja enviada al administrador.');
  } catch (error) {
    console.error(error);
    setSubmissionNote('No se pudo enviar', 'Firebase rechazó la escritura. Revisa las reglas del nodo hojasFinancieras.', false);
    toast('No se pudo enviar la hoja a Firebase.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar al administrador';
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
    activities:activities()
  };
  localStorage.setItem(DRAFT, JSON.stringify(data));
  if (showMessage) toast('Borrador guardado en este dispositivo.');
}

function restoreDraft() {
  const raw = localStorage.getItem(DRAFT);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    ['cedula','teacherName','teacherTitle','teacherCareer'].forEach(k => {
      if (d[k] != null) $(k).value = d[k];
    });
    teacherSource = d.teacherName ? (d.teacherSource === 'firebase' ? 'firebase' : 'manual') : '';
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
  localStorage.removeItem(DRAFT);
  clearAllValidation();
  form.reset();
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
