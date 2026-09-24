import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, get, push, set } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

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
const $ = id => document.getElementById(id);
const form = $('financeForm');
const list = $('activities');
const template = $('activityTemplate');

let db = null;
try {
  db = getDatabase(initializeApp(firebaseConfig));
  setFirebaseStatus('Firebase conectado', true);
} catch (e) {
  console.error(e);
  setFirebaseStatus('Firebase no disponible', false);
}

setupMonths();
setupPeriod();
bind();
if (!restoreDraft()) addActivity();
updateAll();

function setupMonths() {
  ['startMonth','endMonth'].forEach(id => {
    MONTHS.forEach((m, i) => {
      const op = document.createElement('option');
      op.value = String(i + 1);
      op.textContent = m;
      $(id).appendChild(op);
    });
  });
}

function setupPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 4 && m <= 9) {
    $('startMonth').value = '4'; $('startYear').value = y;
    $('endMonth').value = '9'; $('endYear').value = y;
  } else if (m >= 10) {
    $('startMonth').value = '10'; $('startYear').value = y;
    $('endMonth').value = '3'; $('endYear').value = y + 1;
  } else {
    $('startMonth').value = '10'; $('startYear').value = y - 1;
    $('endMonth').value = '3'; $('endYear').value = y;
  }
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
  $('cedula').addEventListener('input', cedulaChanged);
  $('cedula').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); lookupTeacher(); }
  });
  $('teacherTitle').addEventListener('change', rememberTitle);
  $('saveDraftBtn').addEventListener('click', () => saveDraft(true));
  $('printBtn').addEventListener('click', () => { if (validateForm()) window.print(); });
  $('submitAdminBtn').addEventListener('click', submitToAdmin);
  $('clearBtn').addEventListener('click', clearForm);
}

function addActivity(data) {
  data = data || {};
  const frag = template.content.cloneNode(true);
  const card = frag.querySelector('.activity-card');
  card.querySelector('.activity-date').value = data.date || today();
  card.querySelector('.activity-value').value = data.valueHour == null ? '' : data.valueHour;
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
    valueHour: num(card.querySelector('.activity-value').value),
    hours: num(card.querySelector('.activity-hours').value),
    notes: card.querySelector('.activity-notes').value.trim(),
    evidence: card.querySelector('.activity-evidence').value.trim()
  }));
}

function updateAll() {
  validatePeriod();
  const rows = activities();
  const hours = rows.reduce((s, r) => s + r.hours, 0);
  const money = rows.reduce((s, r) => s + r.hours * r.valueHour, 0);
  $('classCount').textContent = rows.length;
  $('hoursTotal').textContent = nfmt(hours);
  $('moneyTotal').textContent = money.toLocaleString('en-US', {style:'currency', currency:'USD'});
  renderPreview(rows, hours);
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
  const cedula = $('cedula').value.replace(/\D/g, '').slice(0,10);
  $('cedula').value = cedula;
  const msg = $('lookupMessage');
  msg.className = 'helper';

  if (!/^\d{10}$/.test(cedula)) {
    msg.textContent = 'La cédula debe tener 10 dígitos.';
    msg.classList.add('error');
    return;
  }
  if (!db) return manualTeacher('Firebase no está disponible.');

  $('lookupBtn').disabled = true;
  $('lookupBtn').textContent = 'Buscando…';
  msg.textContent = 'Consultando Firebase…';

  try {
    const snap = await get(ref(db, 'patrociniosGenerados/' + cedula));
    if (!snap.exists()) return manualTeacher('No se encontró esta cédula en Firebase.');
    const record = findRecord(snap.val(), cedula);
    if (!record || !record.docente) return manualTeacher('La cédula existe, pero no se encontró el nombre del docente.');

    $('teacherName').value = clean(record.docente);
    $('teacherName').readOnly = true;
    $('teacherCareer').value = clean(record.carrera || '');
    restoreTitle(cedula);
    msg.textContent = 'Docente encontrado correctamente.';
    msg.classList.add('success');
    updateAll();
  } catch (e) {
    console.error(e);
    manualTeacher('No fue posible consultar Firebase. Revisa las reglas de lectura.');
  } finally {
    $('lookupBtn').disabled = false;
    $('lookupBtn').textContent = 'Buscar';
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
  const msg = $('lookupMessage');
  msg.textContent = message + ' Puedes escribir el nombre manualmente.';
  msg.className = 'helper error';
  $('teacherName').value = '';
  $('teacherName').readOnly = false;
  $('teacherCareer').value = '';
  updateAll();
}

function cedulaChanged() {
  const input = $('cedula');
  input.value = input.value.replace(/\D/g, '').slice(0,10);
  $('lookupMessage').textContent = '';
  $('teacherName').value = '';
  $('teacherName').readOnly = true;
  $('teacherCareer').value = '';
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

function validatePeriod() {
  const start = Number($('startYear').value) * 12 + Number($('startMonth').value);
  const end = Number($('endYear').value) * 12 + Number($('endMonth').value);
  const ok = start > 0 && end > 0 && end >= start;
  $('periodError').textContent = ok ? '' : 'El período final no puede ser anterior al inicial.';
  return ok;
}

function validateForm() {
  updateAll();
  if (!validatePeriod()) return fail('Revisa el período lectivo.');
  if (!/^\d{10}$/.test($('cedula').value.trim())) return fail('Ingresa una cédula válida de 10 dígitos.', $('cedula'));
  if (!$('teacherName').value.trim()) return fail('Busca o ingresa el nombre del docente.', $('teacherName'));
  if (!$('teacherTitle').value.trim()) return fail('Ingresa el título superior.', $('teacherTitle'));
  const rows = activities();
  if (!rows.length) return fail('Agrega al menos una clase.');
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].date || rows[i].valueHour <= 0 || rows[i].hours <= 0 || !rows[i].notes) {
      return fail('Completa todos los datos de la clase ' + (i + 1) + '.');
    }
  }
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

  const rows = activities();
  const totalHours = rows.reduce((sum, item) => sum + item.hours, 0);
  const totalValue = rows.reduce((sum, item) => sum + item.hours * item.valueHour, 0);
  const payload = {
    version: 1,
    concepto: CONCEPT,
    estado: 'Enviada',
    observacionAdmin: '',
    cedula: $('cedula').value.trim(),
    docente: $('teacherName').value.trim(),
    tituloSuperior: $('teacherTitle').value.trim(),
    carrera: $('teacherCareer').value.trim(),
    periodo: {
      mesInicio: Number($('startMonth').value),
      anioInicio: Number($('startYear').value),
      mesFin: Number($('endMonth').value),
      anioFin: Number($('endYear').value),
      etiqueta: periodLabel()
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
    startMonth:$('startMonth').value, startYear:$('startYear').value,
    endMonth:$('endMonth').value, endYear:$('endYear').value,
    cedula:$('cedula').value, teacherName:$('teacherName').value,
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
    ['startMonth','startYear','endMonth','endYear','cedula','teacherName','teacherTitle','teacherCareer'].forEach(k => {
      if (d[k] != null) $(k).value = d[k];
    });
    $('teacherName').readOnly = Boolean(d.teacherName);
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
  form.reset();
  setupPeriod();
  $('teacherName').readOnly = true;
  $('lookupMessage').textContent = '';
  list.replaceChildren();
  addActivity();
  updateAll();
  toast('Formulario limpio.');
}

function periodLabel() {
  const sm = Number($('startMonth').value), em = Number($('endMonth').value);
  const sy = Number($('startYear').value), ey = Number($('endYear').value);
  if (!sm || !em || !sy || !ey) return '';
  return MONTHS[sm-1] + ' ' + sy + ' - ' + MONTHS[em-1] + ' ' + ey;
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
