import {createServer} from 'node:http';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {initializeApp, cert, applicationDefault} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {getStorage} from 'firebase-admin/storage';

export const APP_ORIGIN = 'https://jeffer91.github.io';
export const DB_URL = 'https://repaso-fire-d8ceb-default-rtdb.firebaseio.com';
export const STATES = Object.freeze({received:'Recibida', observed:'Observada', approved:'Aprobada'});
const MAX_BODY=16*1024*1024;
const MAX_PDF=10*1024*1024;
const MAX_HOURLY_UPLOADS=5;
const INITIAL_PERIOD_ID = '2026-02_2026-08';
const INITIAL_PERIOD = Object.freeze({
  id: INITIAL_PERIOD_ID,
  mesInicio: 2, anioInicio: 2026,
  mesFin: 8, anioFin: 2026,
  etiqueta: 'Febrero 2026 - Agosto 2026'
});
const rate=new Map();
let db, bucket, initializationError;
try {
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw&&!process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('Falta una credencial de servicio de Firebase en Render');
  const cred=raw ? cert(JSON.parse(raw)) : applicationDefault();
  const project=raw?JSON.parse(raw).project_id:process.env.GOOGLE_CLOUD_PROJECT;
  if(project && project!=='repaso-fire-d8ceb')throw Error('Proyecto Firebase inesperado');
  initializeApp({credential:cred,databaseURL:DB_URL,storageBucket:process.env.FIREBASE_STORAGE_BUCKET || 'repaso-fire-d8ceb.firebasestorage.app'});
  db=getDatabase();
  bucket=getStorage().bucket();
} catch(e) {
  initializationError=e;
  console.error('Firebase Admin sin configurar:',e.message);
}

function reply(res,status,payload) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(payload));
}
function error(res,status,msg) {reply(res,status,{error:msg});}
function hash(value) {return createHash('sha256').update(value).digest('hex');}
function secureEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
  const aa=Buffer.from(hash(a),'hex'), bb=Buffer.from(hash(b),'hex');
  return timingSafeEqual(aa,bb);
}
function adminAuthorized(req) {
  const token=process.env.ADMIN_ACCESS_TOKEN;
  return typeof token==='string'&&token.length>=32&&secureEqual(req.headers['x-admin-capability'],token);
}
function sanitizeString(x,max=200) {return typeof x==='string'?x.trim().slice(0,max):'';}
function validPeriod(p) {
  return p && typeof p.id==='string' && /^\d{4}-\d{2}_\d{4}-\d{2}$/.test(p.id);
}
export function verifySheet(data,period) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Datos de la hoja incompletos');
  const cedula=sanitizeString(data.cedula,10);
  const docente=sanitizeString(data.docente,150);
  const titulo=sanitizeString(data.tituloSuperior,200);
  const carrera=sanitizeString(data.carrera,180);
  if(!/^\d{10}$/.test(cedula)||docente.length<5||!titulo)throw Error('Verifica cédula, nombres y título superior');
  if(!validPeriod(period))throw Error('No existe período autorizado');
  if(!Array.isArray(data.actividades)||data.actividades.length<1||data.actividades.length>80)throw Error('Se requieren entre 1 y 80 clases');
  const start=Date.UTC(period.anioInicio,period.mesInicio-1,1);
  const end=Date.UTC(period.anioFin,period.mesFin,0);
  const actividades=data.actividades.map(a=>{
    if(!a||typeof a.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(a.date))throw Error('Fecha de clase inválida');
    const date=new Date(a.date+'T00:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==a.date||date.getTime()<start||date.getTime()>end)
      throw Error('Una fecha está fuera del período');
    const hours=Number(a.hours), notes=sanitizeString(a.notes,1200), evidence=sanitizeString(a.evidence,2048);
    if(!Number.isFinite(hours)||hours<=0||hours>24||Math.round(hours*4)!==hours*4||!notes)throw Error('Revisa horas y observaciones');
    if(evidence&&!/^https:\/\/[^\s]+$/i.test(evidence))throw Error('El enlace de grabación debe comenzar por https://');
    return {date:a.date,hours,notes,evidence,valueHour:null};
  });
  return {version:3,origen:'Hoja-Financiera',cedula,docente,tituloSuperior:titulo,carrera,
    origenDocente:data.origenDocente==='manual'?'manual':'firebase',
    concepto:'Clases de refuerzo por carrera',actividades,
    totales:{clases:actividades.length,horas:actividades.reduce((s,a)=>s+a.hours,0),valor:0},
    evidencias:actividades.filter(a=>a.evidence).length};
}
export function readPdf(value) {
  if(typeof value!=='string'||!value.startsWith('data:application/pdf;base64,'))throw Error('Solo se aceptan archivos PDF');
  const encoded=value.slice('data:application/pdf;base64,'.length);
  if(encoded.length>Math.ceil(MAX_PDF*4/3)+8||!/^[-A-Za-z0-9+/=]+$/.test(encoded))throw Error('PDF demasiado grande o inválido');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length<100||bytes.length>MAX_PDF||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('El archivo no es un PDF válido');
  return bytes;
}
function throttle(req,res) {
  const ip=req.socket.remoteAddress||'unknown';
  const now=Date.now(), history=(rate.get(ip)||[]).filter(t=>now-t<60*60*1000);
  if(history.length>=MAX_HOURLY_UPLOADS){error(res,429,'Has alcanzado el límite de cargas. Inténtalo más tarde.');return false;}
  history.push(now);rate.set(ip,history);
  if(rate.size>10000)for(const [key,h] of rate)if(h.every(t=>now-t>=60*60*1000))rate.delete(key);
  return true;
}
function fileKey(id,version) {return 'hojas-financieras/'+id+'/firmadas/v'+version+'.pdf';}
async function body(req) {
  let size=0, parts=[];
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>MAX_BODY)throw Error('Solicitud mayor a 16 MB');
    parts.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('Solicitud JSON inválida');}
}
function safeFilename(id,version) {return 'Hoja_Financiera_'+id+'_v'+version+'.pdf';}
async function storePdf(id,version,bytes) {
  const path=fileKey(id,version);
  await bucket.file(path).save(bytes,{resumable:false,validation:'md5',metadata:{
    contentType:'application/pdf',cacheControl:'private, no-store',
    metadata:{version:String(version),documentId:id}
  }});
  return path;
}
function availablePeriods(source) {
  const available = {[INITIAL_PERIOD_ID]: {...INITIAL_PERIOD}};
  for (const [id,period] of Object.entries(source?.periodos || {})) {
    if (/^\d{4}-\d{2}_\d{4}-\d{2}$/.test(id) && validPeriod({...period,id})
      && Number.isInteger(period.mesInicio) && Number.isInteger(period.mesFin)
      && Number.isInteger(period.anioInicio) && Number.isInteger(period.anioFin)
      && period.mesInicio>=1 && period.mesInicio<=12 && period.mesFin>=1 && period.mesFin<=12
      && period.anioFin*12+period.mesFin>=period.anioInicio*12+period.mesInicio) {
      available[id] = {...period,id};
    }
  }
  return available;
}
export function selectedPeriod(source,id) {
  if (typeof id!=='string') return null;
  return availablePeriods(source)[id] || null;
}
async function submit(req,res) {
  if(!throttle(req,res))return;
  const input=await body(req);
  const periodSnap=await db.ref('periodosHojaFinanciera').get();
  const period=selectedPeriod(periodSnap.val(),input.periodoId);
  if(!period)throw Error('Selecciona un período lectivo válido');
  const sheet=verifySheet(input.hoja,period),bytes=readPdf(input.pdf);
  const id=db.ref('hojasFinancieras').push().key;
  const capability=randomBytes(32).toString('base64url');
  const record={...sheet,periodo:period,estado:STATES.received,observacionAdmin:'',
    versionActual:1,archivoActual:fileKey(id,1),versiones:{v1:{archivo:fileKey(id,1),fecha:Date.now(),estado:STATES.received}},
    fechaEnvio:Date.now(),fechaActualizacion:Date.now(),capabilityHash:hash(capability),
    historialCambios:{inicial:{fecha:Date.now(),tipo:'PDF firmado recibido',version:1}}};
  await storePdf(id,1,bytes);
  try {await db.ref('hojasFinancieras/'+id).set(record);}
  catch(e){await bucket.file(record.archivoActual).delete({ignoreNotFound:true}).catch(()=>{});throw e;}
  reply(res,201,{ok:true,id,capability,estado:record.estado});
}
async function status(res,url) {
  const cedula=url.searchParams.get('cedula')||'';
  if(!/^\d{10}$/.test(cedula))return error(res,400,'Ingresa la cédula de 10 dígitos');
  const snap=await db.ref('hojasFinancieras').orderByChild('cedula').equalTo(cedula).limitToLast(30).get();
  const matches=Object.entries(snap.val()||{}).map(([id,d])=>({
    id,estado:d.estado||'Enviada',periodo:d.periodo?.etiqueta||'',fecha:d.fechaActualizacion||d.fechaEnvio||0
  })).sort((a,b)=>b.fecha-a.fecha);
  reply(res,200,{hojas:matches});
}
async function revise(req,res) {
  if(!throttle(req,res))return;
  const input=await body(req),id=sanitizeString(input.id,128);
  if(!/^[-A-Za-z0-9_]{12,128}$/.test(id))return error(res,400,'Hoja inválida');
  const node=db.ref('hojasFinancieras/'+id);
  const snap=await node.get(),old=snap.val();
  if(!old)return error(res,404,'Hoja inexistente');
  if(typeof input.capability!=='string'||hash(input.capability)!==old.capabilityHash)
    return error(res,403,'Se requiere el enlace privado de esta hoja');
  if(old.estado!==STATES.observed)return error(res,409,'Solo se puede corregir una hoja devuelta');
  const sheet=verifySheet(input.hoja,old.periodo);
  if(sheet.cedula!==old.cedula)return error(res,400,'La cédula de la hoja no puede modificarse');
  const bytes=readPdf(input.pdf);
  const version=Number(old.versionActual||1)+1,path=await storePdf(id,version,bytes),now=Date.now();
  const change={...sheet,estado:STATES.received,observacionAdmin:'',versionActual:version,
    archivoActual:path,fechaActualizacion:now,
    ['versiones/v'+version]:{archivo:path,fecha:now,estado:STATES.received},
    ['historialCambios/'+db.ref().push().key]:{fecha:now,tipo:'PDF corregido y firmado recibido',version}};
  try{await node.update(change);}
  catch(e){await bucket.file(path).delete({ignoreNotFound:true}).catch(()=>{});throw e;}
  reply(res,200,{ok:true,id,estado:STATES.received,version});
}
async function getPeriods(res) {
  const snap=await db.ref('periodosHojaFinanciera').get();
  const v=snap.val()||{};
  reply(res,200,{periodos:availablePeriods(v),activoId:v.activoId||null});
}
async function changeAdminPeriod(req,res) {
  const payload=await body(req);
  const operation=payload.action, p=payload.period||{};
  const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const valid=Number.isInteger(p.mesInicio)&&p.mesInicio>=1&&p.mesInicio<=12&&
    Number.isInteger(p.mesFin)&&p.mesFin>=1&&p.mesFin<=12&&
    Number.isInteger(p.anioInicio)&&p.anioInicio>=2020&&p.anioInicio<=2100&&
    Number.isInteger(p.anioFin)&&p.anioFin>=2020&&p.anioFin<=2100&&
    p.anioFin*12+p.mesFin>=p.anioInicio*12+p.mesInicio;
  if(!['crear','activar','desactivar'].includes(operation))return error(res,400,'Acción inválida');
  if(operation==='crear'&&!valid)return error(res,400,'Período inválido');
  const result=await db.ref('periodosHojaFinanciera').transaction(value=>{
    const state=value&&typeof value==='object'?{...value}:{};
    state.periodos={...(state.periodos||{})};
    if(operation==='crear') {
      const id=p.anioInicio+'-'+String(p.mesInicio).padStart(2,'0')+'_'
        +p.anioFin+'-'+String(p.mesFin).padStart(2,'0');
      if(!state.periodos[id])state.periodos[id]={mesInicio:p.mesInicio,anioInicio:p.anioInicio,
        mesFin:p.mesFin,anioFin:p.anioFin,etiqueta:months[p.mesInicio-1]+' '+p.anioInicio+' - '+months[p.mesFin-1]+' '+p.anioFin,creadoEn:Date.now()};
      state.activoId=id;
    } else if(operation==='activar') {
      if(typeof p.id!=='string'||!state.periodos[p.id])return;
      state.activoId=p.id;
    } else {
      if(typeof p.id!=='string'||state.activoId!==p.id)return;
      state.activoId=null;
    }
    state.modificadoEn=Date.now();
    return state;
  },undefined,false);
  reply(res,200,{ok:result.committed,activoId:result.snapshot.val()?.activoId||null});
}
async function privateSheet(req,res,url) {
  const id=url.searchParams.get('id')||'';
  if(!/^[-A-Za-z0-9_]{12,128}$/.test(id))return error(res,400,'Identificador inválido');
  const doc=(await db.ref('hojasFinancieras/'+id).get()).val();
  if(!doc)return error(res,404,'La hoja no existe');
  const token=req.headers['x-sheet-capability'];
  if(typeof token!=='string'||hash(token)!==doc.capabilityHash)
    return error(res,403,'Enlace privado de la hoja inválido');
  reply(res,200,{id,estado:doc.estado,observacionAdmin:doc.observacionAdmin||'',
    cedula:doc.cedula,docente:doc.docente,tituloSuperior:doc.tituloSuperior,carrera:doc.carrera,
    origenDocente:doc.origenDocente,actividades:doc.actividades,periodo:doc.periodo});
}
async function stats(res) {
  const snap=await db.ref('hojasFinancieras').get();
  const values=Object.values(snap.val()||{}).filter(d=>d?.archivoActual&&Number(d.versionActual)>=1);
  const count=v=>values.filter(d=>d.estado===v).length;
  reply(res,200,{total:values.length,pendientes:count(STATES.received),observadas:count(STATES.observed),
    aprobadas:count(STATES.approved),horas:values.reduce((s,d)=>s+Number(d.totales?.horas||0),0)});
}
async function sheets(res) {
  const snap=await db.ref('hojasFinancieras').get();
  const data=Object.entries(snap.val()||{}).filter(([,x])=>x?.archivoActual&&Number(x.versionActual)>=1).map(([id,x])=>({id,...x}));
  for(const item of data)delete item.capabilityHash;
  reply(res,200,{hojas:data});
}
async function action(req,res) {
  const input=await body(req),id=sanitizeString(input.id,128),type=input.action;
  if(!/^[-A-Za-z0-9_]{12,128}$/.test(id)||!['observar','aprobar'].includes(type))return error(res,400,'Acción inválida');
  const note=sanitizeString(input.observacion,1200);
  if(type==='observar'&&!note)return error(res,400,'Escribe observaciones para devolver la hoja');
  const node=db.ref('hojasFinancieras/'+id),s=await node.get();
  if(!s.exists())return error(res,404,'Hoja inexistente');
  const prev=s.val();
  if(!prev.archivoActual)return error(res,409,'No se puede aprobar un registro sin PDF firmado');
  if(prev.estado===STATES.approved)return error(res,409,'La hoja aprobada está bloqueada');
  if(type==='aprobar'&&prev.estado!==STATES.received)return error(res,409,'Solo se puede aprobar una hoja recibida');
  const newState=type==='aprobar'?STATES.approved:STATES.observed,now=Date.now(),pushKey=node.child('historialCambios').push().key;
  const updates={estado:newState,observacionAdmin:type==='observar'?note:'',fechaActualizacion:now,
    ['historialCambios/'+pushKey]:{fecha:now,tipo:type==='observar'?'Devuelta con observaciones':'Aprobación administrativa',
      anterior:prev.estado,nuevo:newState,observacion:note}};
  await node.update(updates);
  reply(res,200,{ok:true,estado:newState});
}
async function pdf(req,res,url) {
  const id=url.searchParams.get('id')||'',v=url.searchParams.get('version')||'';
  if(!/^[-A-Za-z0-9_]{12,128}$/.test(id))return error(res,400,'Identificador inválido');
  const doc=(await db.ref('hojasFinancieras/'+id).get()).val();
  if(!doc)return error(res,404,'No existe la hoja');
  const version=v?Number(v):doc.versionActual, entry=doc.versiones?.['v'+version];
  if(!Number.isInteger(version)||!entry?.archivo||entry.archivo!==fileKey(id,version))return error(res,404,'Versión no disponible');
  const [bytes]=await bucket.file(entry.archivo).download();
  res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="'+safeFilename(id,version)+'"',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  res.end(bytes);
}
function cors(req,res) {
  const origin=req.headers.origin;
  if(origin && origin!==APP_ORIGIN)return false;
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Admin-Capability,X-Sheet-Capability');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  return true;
}
export async function handler(req,res) {
  if(!cors(req,res))return error(res,403,'Origen no permitido');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const url=new URL(req.url,'https://hoja-financiera.example');
  if(url.pathname==='/api/health') {
    if(initializationError||!db||!bucket)
      return reply(res,200,{ok:false,configured:false,databaseReady:false,storageReady:false,
        reason:'credentials-required'});
    try {
      await db.ref('periodosHojaFinanciera/activoId').get();
      const [storageReady]=await bucket.exists();
      return reply(res,200,{ok:storageReady,configured:true,databaseReady:true,storageReady,
        reason:storageReady?'ready':'storage-unavailable'});
    } catch(healthError) {
      console.error('Firebase health check failed:',healthError.code||healthError.message);
      return reply(res,200,{ok:false,configured:true,databaseReady:false,storageReady:false,
        reason:'firebase-unavailable'});
    }
  }
  if(req.method==='GET' && url.pathname==='/api/periods' && !db)
    return reply(res,200,{periodos:availablePeriods(null),activoId:null});
  if(!db||!bucket)return error(res,503,'El servicio todavía requiere la configuración privada de Firebase');
  try {
    if(req.method==='GET'&&url.pathname==='/api/periods')return await getPeriods(res);
    if(req.method==='GET'&&url.pathname==='/api/status')return await status(res,url);
    if(req.method==='GET'&&url.pathname==='/api/admin/stats')return await stats(res);
    if(req.method==='POST'&&url.pathname==='/api/submit')return await submit(req,res);
    if(req.method==='POST'&&url.pathname==='/api/revise')return await revise(req,res);
    if(req.method==='GET'&&url.pathname==='/api/private/sheet')return await privateSheet(req,res,url);
    if(url.pathname.startsWith('/api/admin/')) {
      if(!adminAuthorized(req))return error(res,403,'Usa tu enlace privado de administración');
      if(req.method==='GET'&&url.pathname==='/api/admin/sheets')return await sheets(res);
      if(req.method==='GET'&&url.pathname==='/api/admin/periods')return await getPeriods(res);
      if(req.method==='POST'&&url.pathname==='/api/admin/period-action')return await changeAdminPeriod(req,res);
      if(req.method==='POST'&&url.pathname==='/api/admin/action')return await action(req,res);
      if(req.method==='GET'&&url.pathname==='/api/admin/pdf')return await pdf(req,res,url);
    }
    return error(res,404,'Ruta inexistente');
  } catch(e) {
    console.error('Error en la API:',e.message);
    return error(res, /incompletos|Inválid|inválid|deben|requieren|Revisa|fuera del período|PDF demasiado|solo se aceptan|no existe período|No hay período|https/.test(e.message)?400:500,e.message);
  }
}
if(process.env.NODE_ENV!=='test') {
  const port=Number(process.env.PORT)||3000;
  createServer((req,res)=>{void handler(req,res);}).listen(port,'0.0.0.0',()=>{
    console.log('Hoja financiera API escucha en puerto',port,'· Firebase configurado:',!initializationError);
  });
}
