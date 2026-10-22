import {apiRequest,API_BASE} from '../api-config.js';

const $=id=>document.getElementById(id);
const state={records:[],filtered:[],periods:{},activeId:null,token:''};
const query=new URLSearchParams(window.location.hash.slice(1));
const linkToken=query.get('clave')||'';
if(linkToken.length>=32) {
  state.token=linkToken;
  try{sessionStorage.setItem('hf_admin_capability',state.token);}catch{}
} else {
  try{state.token=sessionStorage.getItem('hf_admin_capability')||'';}catch{}
}
function notice(message,kind='info') {
  $('statusMessage').textContent=message;
  $('statusMessage').dataset.kind=kind;
  $('statusMessage').hidden=!message;
}
function text(id,value) {$(id).textContent=String(value);}
function date(ms) {return ms?new Date(ms).toLocaleString('es-EC'):'—';}
function safe(v) {return String(v??'');}
function label(v) {return safe(v||'—');}
async function check() {
  try {
    const health=await apiRequest('/api/health');
    if(!health.ok)notice(health.reason==='credentials-required'
      ? 'Configuración pendiente: conectar Firebase al servicio Render para activar los documentos firmados.'
      : 'El servicio no puede acceder correctamente a Firebase Database o Storage.', 'error');
  } catch(err) {notice('Servicio no disponible: '+err.message,'error');}
}
async function refreshStats() {
  try {
    const v=await apiRequest('/api/admin/stats');
    for(const [id,key] of [['kTotal','total'],['kPending','pendientes'],['kObserved','observadas'],['kApproved','aprobadas'],['kHours','horas']])
      text(id,v[key]??0);
  } catch(e) {notice('No se pudieron consultar las estadísticas: '+e.message,'error');}
}
async function refreshPrivate() {
  if(!state.token) {
    $('privatePanel').hidden=true;
    $('privateHint').hidden=false;
    return;
  }
  try {
    const [a,p]=await Promise.all([
      apiRequest('/api/admin/sheets',{adminToken:state.token}),
      apiRequest('/api/admin/periods',{adminToken:state.token})
    ]);
    state.records=a.hojas||[];
    state.periods=p.periodos||{};
    state.activeId=p.activoId||null;
    $('privatePanel').hidden=false;
    $('privateHint').hidden=true;
    $('adminIdentity').textContent='Gestión privada habilitada mediante enlace de acceso';
    renderPeriods();
    applyFilters();
    notice('');
  } catch(e) {
    $('privatePanel').hidden=true;
    $('privateHint').hidden=false;
    notice('El enlace privado no está autorizado o la API no tiene Firebase configurado: '+e.message,'error');
  }
}
function renderPeriods() {
  const p=state.activeId&&state.periods[state.activeId];
  text('activePeriod',p?.etiqueta||'Ninguno activo');
  const area=$('periodsList');area.replaceChildren();
  for(const [id,item] of Object.entries(state.periods).sort(([a],[b])=>b.localeCompare(a))) {
    const div=document.createElement('div');div.className='period-entry';
    const span=document.createElement('span');span.textContent=item.etiqueta||id;
    const btn=document.createElement('button');btn.className='btn secondary';
    if(id==='2026-02_2026-08' && id!==state.activeId) {
      btn.textContent='Disponible para docentes';
      btn.disabled=true;
    } else {
      btn.textContent=id===state.activeId?'Desactivar':'Activar';
      btn.addEventListener('click',()=>periodAction(id===state.activeId?'desactivar':'activar',{id}));
    }
    div.append(span,btn);area.appendChild(div);
  }
}
function applyFilters() {
  const search=$('search').value.trim().toLowerCase(),filter=$('stateFilter').value;
  state.filtered=state.records.filter(x=>
    (!search||[x.docente,x.cedula,x.carrera].some(t=>safe(t).toLowerCase().includes(search)))&&
    (!filter||x.estado===filter)
  ).sort((a,b)=>(b.fechaActualizacion||0)-(a.fechaActualizacion||0));
  text('resultCount',state.filtered.length+' hojas');
  const tb=$('sheetRows');tb.replaceChildren();
  for(const item of state.filtered) {
    const tr=document.createElement('tr');
    for(const val of [item.docente,item.cedula,item.carrera,item.periodo?.etiqueta,item.estado,
      item.totales?.horas,date(item.fechaActualizacion||item.fechaEnvio)]) {
      const td=document.createElement('td');td.textContent=label(val);tr.appendChild(td);
    }
    const action=document.createElement('td');
    const btn=document.createElement('button');btn.textContent='Revisar PDF';btn.className='btn small';
    btn.addEventListener('click',()=>showDetail(item.id));
    action.append(btn);tr.append(action);tb.append(tr);
  }
  $('emptyState').hidden=state.filtered.length!==0;
}
function rowText(label,value) {
  const li=document.createElement('div');li.className='item-line';
  const b=document.createElement('strong');b.textContent=label;
  const span=document.createElement('span');span.textContent=safe(value);
  li.append(b,span);return li;
}
let opened=null;
function showDetail(id) {
  const rec=state.records.find(x=>x.id===id);if(!rec)return;
  opened=rec;
  $('detailTitle').textContent=rec.docente||'Hoja financiera';
  const host=$('detailInfo');host.replaceChildren();
  for(const [name,val] of [['Cédula',rec.cedula],['Carrera',rec.carrera],['Período',rec.periodo?.etiqueta],
    ['Estado',rec.estado],['Horas',rec.totales?.horas],['Recibido',date(rec.fechaEnvio)]])host.append(rowText(name,val));
  const history=$('history');history.replaceChildren();
  const versions=rec.versiones||{};
  for(const [key,version] of Object.entries(versions).sort(([a],[b])=>Number(b.slice(1))-Number(a.slice(1)))) {
    const button=document.createElement('button');
    button.className='btn secondary';button.textContent='Ver PDF firmado · '+key+' · '+date(version.fecha);
    button.addEventListener('click',()=>viewPDF(id,key.slice(1)));history.append(button);
  }
  const log=$('log');log.replaceChildren();
  for(const evt of Object.values(rec.historialCambios||{}).sort((a,b)=>(b.fecha||0)-(a.fecha||0))) {
    const p=document.createElement('p');
    p.textContent=date(evt.fecha)+' · '+(evt.tipo||'Actualización')+(evt.observacion?' · '+evt.observacion:'');
    log.append(p);
  }
  $('returnBtn').disabled=rec.estado==='Aprobada';
  $('approveBtn').disabled=rec.estado!=='Recibida';
  $('observation').value=rec.observacionAdmin||'';
  $('reviewDialog').showModal();
}
async function viewPDF(id,version) {
  try {
    const url=API_BASE+'/api/admin/pdf?id='+encodeURIComponent(id)+'&version='+encodeURIComponent(version);
    const response=await fetch(url,{headers:{'X-Admin-Capability':state.token},cache:'no-store'});
    if(!response.ok)throw Error('No se pudo descargar el PDF: '+response.status);
    const file=await response.blob();
    if(file.type&&!file.type.includes('pdf'))throw Error('Respuesta no es PDF');
    const objectUrl=URL.createObjectURL(file);
    const a=document.createElement('a');a.href=objectUrl;
    a.download='Hoja_financiera_'+id+'_v'+version+'.pdf';a.click();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
  } catch(e) {notice(e.message,'error');}
}
async function reviewAction(action) {
  if(!opened)return;
  const observation=$('observation').value.trim();
  if(action==='observar'&&!observation){$('observation').focus();return notice('Escribe observaciones para devolver la hoja.','error');}
  try {
    await apiRequest('/api/admin/action',{method:'POST',adminToken:state.token,
      data:{id:opened.id,action,observacion:observation}});
    $('reviewDialog').close();
    await Promise.all([refreshStats(),refreshPrivate()]);
    notice(action==='observar'?'Hoja devuelta con observaciones.':'Hoja aprobada correctamente.','success');
  }catch(e){notice('No se pudo registrar la revisión: '+e.message,'error');}
}
async function periodAction(action,period) {
  try {
    const out=await apiRequest('/api/admin/period-action',{method:'POST',adminToken:state.token,data:{action,period}});
    if(!out.ok)throw Error('No se realizaron cambios');
    await refreshPrivate();notice('Período actualizado.','success');
  } catch(e) {notice('No se pudo actualizar el período: '+e.message,'error');}
}
function submitPeriod(e) {
  e.preventDefault();
  const f=e.currentTarget,p={mesInicio:Number(f.startMonth.value),anioInicio:Number(f.startYear.value),
    mesFin:Number(f.endMonth.value),anioFin:Number(f.endYear.value)};
  void periodAction('crear',p);
}
function exportExcel() {
  if(!state.filtered.length)return notice('No hay hojas para exportar.','error');
  const rows=state.filtered.map(x=>({Docente:x.docente,Cedula:x.cedula,Carrera:x.carrera,
    Periodo:x.periodo?.etiqueta,Estado:x.estado,Horas:x.totales?.horas,
    Fecha_recepcion:date(x.fechaEnvio),Versiones:Object.keys(x.versiones||{}).length,
    Origen_docente:x.origenDocente,Observacion:x.observacionAdmin||''}));
  if(!window.XLSX)return notice('No se cargó la biblioteca Excel.','error');
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Hojas');
  XLSX.writeFile(wb,'Hojas_Financieras_ITSQMET.xlsx');
}
$('search').addEventListener('input',applyFilters);
$('stateFilter').addEventListener('change',applyFilters);
$('refreshBtn').addEventListener('click',()=>{void Promise.all([refreshStats(),refreshPrivate()]);});
$('periodForm').addEventListener('submit',submitPeriod);
$('exportBtn').addEventListener('click',exportExcel);
$('returnBtn').addEventListener('click',()=>void reviewAction('observar'));
$('approveBtn').addEventListener('click',()=>void reviewAction('aprobar'));
$('closeDetail').addEventListener('click',()=>$('reviewDialog').close());
void check();
void refreshStats();
void refreshPrivate();
