import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, get, onValue, update, runTransaction } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyANtWmjXdlHkf-LO4t2gtpyymmjeEr2emI',
  authDomain: 'repaso-fire-d8ceb.firebaseapp.com',
  databaseURL: 'https://repaso-fire-d8ceb-default-rtdb.firebaseio.com',
  projectId: 'repaso-fire-d8ceb',
  storageBucket: 'repaso-fire-d8ceb.firebasestorage.app',
  messagingSenderId: '1080713449199',
  appId: '1:1080713449199:web:a94fd6c6e26766b4e2551a'
};

const $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const PERIODS_PATH = 'periodosHojaFinanciera';
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

let records = [];
let filtered = [];
let currentId = null;
let stopListening = null;
let stopPeriodListening = null;
let periodConfig = {periodos:{}, activoId:null};
let periodMutationBusy = false;

bind();
showAccessStatus('Verificando acceso automático…');
let signingIn = false;

onAuthStateChanged(auth, async user => {
  if (!user) {
    if (signingIn) return;
    signingIn = true;
    showAccessStatus('Conectando de forma segura con Firebase…');
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error(error);
      const message = error.code === 'auth/operation-not-allowed'
        ? 'Debes habilitar el proveedor Anónimo en Firebase Authentication para utilizar el acceso sin contraseña.'
        : 'No se pudo iniciar el acceso automático. Revisa la conexión y la configuración de Firebase.';
      showAccessStatus(message);
    } finally {
      signingIn = false;
    }
    return;
  }

  const allowed = await isAdministrator(user.uid);
  if (allowed === null) {
    showAccessStatus('Firebase no permitió comprobar los permisos. Verifica las reglas de administradores en Realtime Database.', user.uid);
    return;
  }
  if (!allowed) {
    showAccessStatus('Este navegador aún no tiene autorización administrativa. Registra su identificador en Firebase y actualiza la página.', user.uid);
    return;
  }
  showDashboard(user);
  listenSheets();
  listenPeriods();
}, error => {
  console.error(error);
  showAccessStatus('No se pudo verificar el acceso automático con Firebase.');
});

function bind() {
  setupPeriodInputs();
  $('createPeriodForm').addEventListener('submit', createAndActivatePeriod);
  $('searchFilter').addEventListener('input', applyFilters);
  $('statusFilter').addEventListener('change', applyFilters);
  $('periodFilter').addEventListener('change', applyFilters);
  $('careerFilter').addEventListener('change', applyFilters);
  $('refreshBtn').addEventListener('click', refreshNow);
  $('exportBtn').addEventListener('click', exportExcel);
  $('saveSheetBtn').addEventListener('click', saveCurrent);
  $('markReviewedBtn').addEventListener('click', () => setStatusAndSave('Revisada'));
  $('approveBtn').addEventListener('click', () => setStatusAndSave('Aprobada'));
  $('markObservedBtn').addEventListener('click', () => setStatusAndSave('Observada'));
  $('printSheetBtn').addEventListener('click', printCurrent);
}

async function isAdministrator(uid) {
  try {
    const snap = await get(ref(db, 'administradores/' + uid));
    if (!snap.exists()) return false;
    const value = snap.val();
    // Debe coincidir con las reglas de Realtime Database: solo activo === true.
    return value !== null && typeof value === 'object' && value.activo === true;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function showAccessStatus(message, uid = '') {
  if (stopListening) { stopListening(); stopListening = null; }
  if (stopPeriodListening) { stopPeriodListening(); stopPeriodListening = null; }
  records = [];
  filtered = [];
  currentId = null;
  $('accessView').hidden = false;
  $('dashboardView').hidden = true;
  $('accessMessage').textContent = message;
  $('accessUid').textContent = uid ? 'ID de este navegador: ' + uid : '';
  $('accessUid').hidden = !uid;
  if ($('sheetDialog').open) $('sheetDialog').close();
}

function showDashboard(user) {
  $('accessView').hidden = true;
  $('dashboardView').hidden = false;
  $('adminIdentity').textContent = user.email || 'Navegador autorizado · Acceso automático';
}

function setupPeriodInputs() {
  for (const id of ['adminStartMonth', 'adminEndMonth']) {
    const select = $(id);
    MONTHS.forEach((month, index) => {
      const op = document.createElement('option');
      op.value = String(index + 1);
      op.textContent = month;
      select.appendChild(op);
    });
  }
  const date = new Date();
  const year = date.getFullYear(), month = date.getMonth() + 1;
  const startYear = month >= 10 ? year : month >= 4 ? year : year - 1;
  const startMonth = month >= 10 || month < 4 ? 10 : 4;
  $('adminStartMonth').value = String(startMonth);
  $('adminStartYear').value = String(startYear);
  $('adminEndMonth').value = String(startMonth === 10 ? 3 : 9);
  $('adminEndYear').value = String(startYear + (startMonth === 10 ? 1 : 0));
}

function buildPeriodFromFields() {
  const p = {
    mesInicio: Number($('adminStartMonth').value),
    anioInicio: Number($('adminStartYear').value),
    mesFin: Number($('adminEndMonth').value),
    anioFin: Number($('adminEndYear').value)
  };
  const valid = [p.mesInicio, p.mesFin].every(n => Number.isInteger(n) && n >= 1 && n <= 12)
    && [p.anioInicio, p.anioFin].every(n => Number.isInteger(n) && n >= 2020 && n <= 2100)
    && p.anioFin * 12 + p.mesFin >= p.anioInicio * 12 + p.mesInicio;
  if (!valid) return null;
  p.etiqueta = MONTHS[p.mesInicio - 1] + ' ' + p.anioInicio + ' - ' +
    MONTHS[p.mesFin - 1] + ' ' + p.anioFin;
  p.id = p.anioInicio + '-' + String(p.mesInicio).padStart(2, '0') + '_' +
    p.anioFin + '-' + String(p.mesFin).padStart(2, '0');
  return p;
}

// La transacción garantiza que solo exista un período activo.
function applyPeriodChange(current, action, incoming) {
  const next = current && typeof current === 'object' ? {...current} : {};
  next.periodos = next.periodos && typeof next.periodos === 'object' ? {...next.periodos} : {};
  if (action === 'create') {
    if (!incoming) return;
    if (!next.periodos[incoming.id]) next.periodos[incoming.id] = {
      mesInicio: incoming.mesInicio, anioInicio: incoming.anioInicio,
      mesFin: incoming.mesFin, anioFin: incoming.anioFin,
      etiqueta: incoming.etiqueta, creadoEn: Date.now()
    };
    next.activoId = incoming.id;
  } else if (action === 'activate') {
    if (!incoming || !next.periodos[incoming.id]) return;
    next.activoId = incoming.id;
  } else if (action === 'deactivate') {
    if (!incoming || next.activoId !== incoming.id) return;
    next.activoId = null;
  } else return;
  next.modificadoEn = Date.now();
  return next;
}

async function changePeriod(action, incoming) {
  if (periodMutationBusy) return;
  if (!auth.currentUser) {
    toast('No se verificó tu autorización de administrador.');
    return;
  }
  periodMutationBusy = true;
  $('createPeriodBtn').disabled = true;
  $('periodsStatus').textContent = 'Guardando cambios en Firebase…';
  try {
    const result = await runTransaction(ref(db, PERIODS_PATH),
      value => applyPeriodChange(value, action, incoming), {applyLocally:false});
    if (result.committed) toast('Período actualizado correctamente.');
    else toast('No se realizó ningún cambio en el período.');
  } catch (error) {
    console.error(error);
    $('periodsStatus').textContent = 'No se pudo guardar. Revisa las reglas de Firebase.';
    toast('Firebase no permitió guardar el período.');
  } finally {
    periodMutationBusy = false;
    $('createPeriodBtn').disabled = false;
  }
}

function createAndActivatePeriod(event) {
  event.preventDefault();
  const period = buildPeriodFromFields();
  if (!period) {
    toast('Selecciona un período válido. El fin debe ser igual o posterior al inicio.');
    return;
  }
  changePeriod('create', period);
}

function listenPeriods() {
  if (stopPeriodListening) stopPeriodListening();
  stopPeriodListening = onValue(ref(db, PERIODS_PATH), snapshot => {
    const data = snapshot.val();
    periodConfig = data && typeof data === 'object' ? data : {periodos:{}, activoId:null};
    renderPeriodList();
  }, error => {
    console.error(error);
    $('periodsStatus').textContent = 'No se pudieron cargar los períodos. Revisa las reglas de Firebase.';
    $('periodsList').replaceChildren();
  });
}

function renderPeriodList() {
  const all = Object.entries(periodConfig.periodos || {});
  const activeId = periodConfig.activoId || null;
  $('periodsStatus').textContent = activeId && periodConfig.periodos?.[activeId]
    ? 'Activo: ' + periodConfig.periodos[activeId].etiqueta
    : 'No hay período activo. El envío de hojas está bloqueado.';
  const host = $('periodsList');
  host.replaceChildren();
  if (!all.length) {
    const empty = document.createElement('p');
    empty.className = 'muted periods-empty';
    empty.textContent = 'Todavía no hay períodos. Crea el primero para habilitar el formulario docente.';
    host.appendChild(empty);
    return;
  }
  all.sort(([a],[b]) => b.localeCompare(a)).forEach(([id,entry]) => {
    const row = document.createElement('div');
    row.className = 'period-row';
    const title = document.createElement('strong');
    title.textContent = entry.etiqueta || id;
    const label = document.createElement('span');
    const active = activeId === id;
    label.className = 'period-label' + (active ? ' active' : '');
    label.textContent = active ? 'ACTIVO' : 'Inactivo';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ' + (active ? 'secondary' : 'primary');
    button.textContent = active ? 'Desactivar' : 'Activar';
    button.disabled = periodMutationBusy;
    button.addEventListener('click', () => changePeriod(active ? 'deactivate' : 'activate', {id}));
    row.append(title,label,button);
    host.appendChild(row);
  });
}

function listenSheets() {
  if (stopListening) stopListening();
  $('syncStatus').textContent = 'Sincronizando…';
  stopListening = onValue(ref(db, 'hojasFinancieras'), snapshot => {
    const value = snapshot.val() || {};
    records = Object.entries(value).map(([id, data]) => ({ id, ...data }));
    records.sort((a, b) => Number(b.fechaEnvio || 0) - Number(a.fechaEnvio || 0));
    rebuildFilterOptions();
    updateStats();
    applyFilters();
    $('syncStatus').textContent = 'Sincronizado en tiempo real';
  }, error => {
    console.error(error);
    $('syncStatus').textContent = 'Firebase rechazó la lectura';
    toast('No se pudieron leer las hojas financieras.');
  });
}

async function refreshNow() {
  const btn = $('refreshBtn');
  btn.disabled = true;
  btn.textContent = 'Actualizando…';
  try {
    const snap = await get(ref(db, 'hojasFinancieras'));
    const value = snap.val() || {};
    records = Object.entries(value).map(([id, data]) => ({ id, ...data }));
    records.sort((a, b) => Number(b.fechaEnvio || 0) - Number(a.fechaEnvio || 0));
    rebuildFilterOptions();
    updateStats();
    applyFilters();
    $('syncStatus').textContent = 'Actualizado ahora';
  } catch (error) {
    console.error(error);
    toast('No se pudo actualizar.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Actualizar';
  }
}

function rebuildFilterOptions() {
  const currentPeriod = $('periodFilter').value;
  const currentCareer = $('careerFilter').value;
  fillSelect($('periodFilter'), unique(records.map(r => r.periodo?.etiqueta).filter(Boolean)), 'Todos', currentPeriod);
  fillSelect($('careerFilter'), unique(records.map(r => r.carrera).filter(Boolean)), 'Todas', currentCareer);
}

function fillSelect(select, values, firstLabel, selected) {
  select.replaceChildren();
  const first = document.createElement('option');
  first.value = '';
  first.textContent = firstLabel;
  select.appendChild(first);
  values.sort((a,b) => String(a).localeCompare(String(b), 'es')).forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  if ([...select.options].some(o => o.value === selected)) select.value = selected;
}

function applyFilters() {
  const q = $('searchFilter').value.trim().toLowerCase();
  const status = $('statusFilter').value;
  const period = $('periodFilter').value;
  const career = $('careerFilter').value;

  filtered = records.filter(item => {
    const haystack = (item.docente + ' ' + item.cedula).toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (status && item.estado !== status) return false;
    if (period && item.periodo?.etiqueta !== period) return false;
    if (career && item.carrera !== career) return false;
    return true;
  });
  renderTable();
}

function updateStats() {
  const total = records.length;
  const pending = records.filter(r => r.estado === 'Enviada' || r.estado === 'Revisada').length;
  const approved = records.filter(r => r.estado === 'Aprobada').length;
  const observed = records.filter(r => r.estado === 'Observada').length;
  const hours = records.reduce((sum, r) => sum + Number(r.totales?.horas || 0), 0);
  const money = records.reduce((sum, r) => sum + Number(r.totales?.valor || 0), 0);

  $('statTotal').textContent = total;
  $('statPending').textContent = pending;
  $('statApproved').textContent = approved;
  $('statObserved').textContent = observed;
  $('statHours').textContent = number(hours);
  $('statMoney').textContent = currency(money);
}

function renderTable() {
  const tbody = $('sheetRows');
  tbody.replaceChildren();
  $('resultCount').textContent = filtered.length + (filtered.length === 1 ? ' registro' : ' registros');
  $('emptyState').hidden = filtered.length !== 0;

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    addStatusCell(tr, item.estado || 'Enviada');
    addCell(tr, item.docente || '—', 'row-name');
    addCell(tr, item.cedula || '—');
    addCell(tr, item.periodo?.etiqueta || '—');
    addCell(tr, item.carrera || '—');
    addCell(tr, String(item.totales?.clases ?? item.actividades?.length ?? 0), 'num');
    addCell(tr, number(item.totales?.horas || 0), 'num');
    addCell(tr, currency(item.totales?.valor || 0), 'money');
    addCell(tr, formatDateTime(item.fechaEnvio));
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.className = 'open-btn';
    button.type = 'button';
    button.textContent = 'Revisar';
    button.addEventListener('click', () => openSheet(item.id));
    action.appendChild(button);
    tr.appendChild(action);
    tbody.appendChild(tr);
  });
}

function addCell(tr, text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  tr.appendChild(td);
}

function addStatusCell(tr, status) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.className = 'status status-' + slug(status);
  span.textContent = status;
  td.appendChild(span);
  tr.appendChild(td);
}

function openSheet(id) {
  const item = records.find(r => r.id === id);
  if (!item) return;
  currentId = id;
  $('dialogTitle').textContent = item.docente || 'Hoja financiera';
  $('dialogCode').textContent = 'Código: ' + id + ' · Enviada: ' + formatDateTime(item.fechaEnvio) + (item.origenDocente === 'manual' ? ' · DOCENTE NUEVO (verificar datos)' : '');
  $('editTeacher').value = item.docente || '';
  $('editCedula').value = item.cedula || '';
  $('editTitle').value = item.tituloSuperior || '';
  $('editCareer').value = item.carrera || '';
  $('editPeriod').value = item.periodo?.etiqueta || '';
  $('editStatus').value = item.estado || 'Enviada';
  $('editObservation').value = item.observacionAdmin || '';
  renderEditActivities(item.actividades || []);
  updateDialogTotals();
  $('sheetDialog').showModal();
}

function renderEditActivities(items) {
  const wrap = $('editActivities');
  wrap.replaceChildren();
  items.forEach((item, index) => {
    const fragment = $('editActivityTemplate').content.cloneNode(true);
    const card = fragment.querySelector('.activity-edit-card');
    card.querySelector('.n').textContent = index + 1;
    card.querySelector('.date').value = item.date || '';
    card.querySelector('.value').value = item.valueHour ?? '';
    card.querySelector('.hours').value = item.hours ?? '';
    card.querySelector('.notes').value = item.notes || '';
    card.querySelector('.evidence').value = item.evidence || '';
    card.addEventListener('input', updateDialogTotals);
    wrap.appendChild(card);
  });
}

function editedActivities() {
  return [...$('editActivities').querySelectorAll('.activity-edit-card')].map(card => ({
    date: card.querySelector('.date').value,
    valueHour: Number(card.querySelector('.value').value || 0),
    hours: Number(card.querySelector('.hours').value || 0),
    notes: card.querySelector('.notes').value.trim(),
    evidence: card.querySelector('.evidence').value.trim()
  }));
}

function updateDialogTotals() {
  const items = editedActivities();
  const hours = items.reduce((s, x) => s + x.hours, 0);
  const value = items.reduce((s, x) => s + x.hours * x.valueHour, 0);
  $('dialogTotals').textContent = items.length + ' clases · ' + number(hours) + ' horas · ' + currency(value);
}

async function saveCurrent(closeAfter = false) {
  if (!currentId) return;
  const items = editedActivities();
  if (!items.length) return toast('La hoja no tiene clases registradas.');
  if (items.some(x => !x.date || x.hours <= 0 || x.valueHour <= 0 || !x.notes)) {
    return toast('Revisa las clases: faltan datos obligatorios.');
  }
  const hours = items.reduce((s, x) => s + x.hours, 0);
  const value = items.reduce((s, x) => s + x.hours * x.valueHour, 0);
  const payload = {
    tituloSuperior: $('editTitle').value.trim(),
    carrera: $('editCareer').value.trim(),
    estado: $('editStatus').value,
    observacionAdmin: $('editObservation').value.trim(),
    actividades: items,
    evidencias: items.filter(x => x.evidence).length,
    totales: {
      clases: items.length,
      horas,
      valor: Number(value.toFixed(2))
    },
    fechaActualizacion: Date.now()
  };

  $('saveSheetBtn').disabled = true;
  try {
    await update(ref(db, 'hojasFinancieras/' + currentId), payload);
    toast('Cambios guardados.');
    if (closeAfter) $('sheetDialog').close();
  } catch (error) {
    console.error(error);
    toast('Firebase rechazó la actualización.');
  } finally {
    $('saveSheetBtn').disabled = false;
  }
}

async function setStatusAndSave(status) {
  $('editStatus').value = status;
  if (status === 'Observada' && !$('editObservation').value.trim()) {
    $('editObservation').focus();
    toast('Escribe la observación antes de marcar la hoja como observada.');
    return;
  }
  await saveCurrent(false);
}

function exportExcel() {
  if (!filtered.length) return toast('No hay registros para exportar.');
  const rows = filtered.map(r => ({
    Estado: r.estado || '',
    Docente: r.docente || '',
    Origen_docente: r.origenDocente === 'manual' ? 'Ingreso manual (verificar)' : 'Firebase / no especificado',
    Cedula: r.cedula || '',
    Titulo: r.tituloSuperior || '',
    Carrera: r.carrera || '',
    Periodo: r.periodo?.etiqueta || '',
    Clases: r.totales?.clases || 0,
    Horas: r.totales?.horas || 0,
    Valor_estimado: r.totales?.valor || 0,
    Evidencias: r.evidencias || 0,
    Observacion_admin: r.observacionAdmin || '',
    Fecha_envio: formatDateTime(r.fechaEnvio),
    Codigo: r.id
  }));

  if (window.XLSX) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Hojas financieras');
    XLSX.writeFile(book, 'Hojas_Financieras.xlsx');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(row => headers.map(h => csvValue(row[h])).join(','))].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Hojas_Financieras.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function printCurrent() {
  if (!currentId) return;
  const item = {
    ...(records.find(r => r.id === currentId) || {}),
    tituloSuperior: $('editTitle').value.trim(),
    carrera: $('editCareer').value.trim(),
    estado: $('editStatus').value,
    observacionAdmin: $('editObservation').value.trim(),
    actividades: editedActivities()
  };
  const totalHours = item.actividades.reduce((s,x) => s + x.hours, 0);
  const rows = item.actividades.map((x,i) => {
    const d = x.date ? x.date.split('-') : [];
    return '<tr><td>' + (i+1) + '</td><td>CLASES DE REFUERZO POR CARRERA</td><td>' + (d[1] || '') + '</td><td>' + (d[2] || '') + '</td><td>' + esc(x.valueHour) + '</td><td>' + esc(x.hours) + '</td><td>' + esc(x.notes) + '</td></tr>';
  }).join('');
  const win = window.open('', '_blank');
  if (!win) return toast('El navegador bloqueó la ventana de impresión.');
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Hoja financiera</title><style>body{font-family:Arial;margin:18mm;color:#000}h1,h2,p{text-align:center;margin:4px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:5px;font-size:10px;text-align:center;vertical-align:middle}.info th{text-align:left;width:28%}.material{height:55px}.sign{margin-top:45px;display:grid;gap:35px}.line{display:grid;grid-template-columns:180px 260px;gap:12px}.line span:last-child{border-bottom:1px solid #000}.obs{text-align:left}@page{size:A4;margin:10mm}</style></head><body>');
  win.document.write('<h2>INSTITUTO TECNOLÓGICO SUPERIOR QUITO METROPOLITANO</h2><p>QUITO - ECUADOR</p><h1 style="font-size:14px">REGISTRO DE PAGO DE HABERES DEL PERSONAL DIRECTIVO Y DOCENTE</h1>');
  win.document.write('<table class="info"><tr><th>PERÍODO LECTIVO:</th><td>' + esc(item.periodo?.etiqueta || '') + '</td></tr><tr><th>APELLIDOS Y NOMBRES:</th><td>' + esc(item.docente || '') + '</td></tr><tr><th>CÉDULA:</th><td>' + esc(item.cedula || '') + '</td></tr><tr><th>TÍTULO SUPERIOR:</th><td>' + esc(item.tituloSuperior || '') + '</td></tr><tr class="material"><th>MATERIAS:</th><td>CLASES DE REFUERZO POR CARRERA</td></tr></table>');
  win.document.write('<table><thead><tr><th>No.</th><th>CONCEPTO</th><th>MES</th><th>DÍA</th><th>VALOR HORA</th><th>HORAS</th><th>OBSERVACIONES</th></tr></thead><tbody>' + rows + '<tr><th colspan="5">TOTAL</th><th>' + esc(number(totalHours)) + '</th><td></td></tr></tbody></table>');
  win.document.write('<div class="sign"><div class="line"><span>FIRMA DOCENTE:</span><span></span></div><div class="line"><span>COORDINADOR DE TITULACIÓN:</span><span></span></div><div class="line"><span>VICERRECTORADO:</span><span></span></div></div>');
  win.document.write('</body></html>');
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function unique(values) { return [...new Set(values)]; }
function number(v) { return Number(v || 0).toLocaleString('es-EC', {maximumFractionDigits:2}); }
function currency(v) { return Number(v || 0).toLocaleString('en-US', {style:'currency',currency:'USD'}); }
function formatDateTime(ms) {
  if (!ms) return '—';
  const d = new Date(Number(ms));
  return d.toLocaleString('es-EC', {dateStyle:'short', timeStyle:'short'});
}
function slug(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function csvValue(v) { return '"' + String(v ?? '').replace(/"/g,'""') + '"'; }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}
