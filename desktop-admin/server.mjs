// Administrador local: solo escucha en 127.0.0.1; no expone credenciales al navegador.
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {execFile} from 'node:child_process';
import {initializeApp, cert} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADDRESS='127.0.0.1';
const PORT=8765;
const URL_BASE='http://'+ADDRESS+':'+PORT;
const DATABASE_URL='https://repaso-fire-d8ceb-default-rtdb.firebaseio.com';
const KEYFILE=process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!KEYFILE || !existsSync(KEYFILE)) {
  console.error('\nFALTA LA CREDENCIAL PRIVADA DE FIREBASE.');
  console.error('Configura GOOGLE_APPLICATION_CREDENTIALS con el archivo JSON de cuenta de servicio.');
  console.error('Lee desktop-admin/INSTRUCCIONES.md. Nunca publiques esa credencial en GitHub.\n');
  process.exit(1);
}
let key;
try {
  key=JSON.parse(await readFile(KEYFILE, 'utf8'));
  if(key.type!=='service_account'||key.project_id!=='repaso-fire-d8ceb') {
    throw new Error('El archivo debe ser una cuenta de servicio de repaso-fire-d8ceb.');
  }
} catch (error) {
  console.error('La credencial local no es válida:',error.message);
  process.exit(1);
}
const app=initializeApp({credential:cert(key),databaseURL:DATABASE_URL});
const db=getDatabase(app);
const token=randomBytes(32).toString('hex');
const validHost=new Set(['127.0.0.1:'+PORT,'localhost:'+PORT]);
const jsonHeaders={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer'
};
const staticRoutes={
 '/desktop-admin/admin.js':['desktop-admin/admin.js','text/javascript; charset=utf-8'],
 '/desktop-admin/local-db.js':['desktop-admin/local-db.js','text/javascript; charset=utf-8'],
 '/administrador/admin.css':['administrador/admin.css','text/css; charset=utf-8'],
 '/assets/logo-itsqmet.jpg':['assets/logo-itsqmet.jpg','image/jpeg']
};
function reply(res, code, value) {
  res.writeHead(code, jsonHeaders);
  res.end(JSON.stringify(value));
}
function httpError(res, code, message) {reply(res,code,{error:message});}
function isSameOriginRequest(req) {
  const remote=req.socket.remoteAddress;
  if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return false;
  if(!validHost.has(req.headers.host))return false;
  if(req.headers.origin && ![URL_BASE,'http://localhost:'+PORT].includes(req.headers.origin))return false;
  return true;
}
function validToken(candidate) {
  if(typeof candidate!=='string'||candidate.length!==token.length)return false;
  return timingSafeEqual(Buffer.from(candidate),Buffer.from(token));
}
function allowedRead(path) {
  return path==='hojasFinancieras' || path==='periodosHojaFinanciera';
}
function validatePeriod(data) {
  if(!data || typeof data!=='object')return false;
  const values=['mesInicio','mesFin'];
  const years=['anioInicio','anioFin'];
  return values.every(k=>Number.isInteger(data[k])&&data[k]>=1&&data[k]<=12)
    && years.every(k=>Number.isInteger(data[k])&&data[k]>=2020&&data[k]<=2100)
    && data.anioFin*12+data.mesFin>=data.anioInicio*12+data.mesInicio
    && data.anioFin*12+data.mesFin <= data.anioInicio*12+data.mesInicio+36;
}
function changePeriod(original, action, incoming) {
  const next=original && typeof original==='object'?{...original}:{};
  next.periodos=next.periodos && typeof next.periodos==='object'?{...next.periodos}:{};
  if(action==='create') {
    if(!validatePeriod(incoming))return;
    const id=incoming.anioInicio+'-'+String(incoming.mesInicio).padStart(2,'0')+'_'
      +incoming.anioFin+'-'+String(incoming.mesFin).padStart(2,'0');
    if(incoming.id!==id)return;
    if(!next.periodos[id])next.periodos[id]={
      mesInicio:incoming.mesInicio,anioInicio:incoming.anioInicio,
      mesFin:incoming.mesFin,anioFin:incoming.anioFin,
      etiqueta:incoming.etiqueta,creadoEn:Date.now()
    };
    next.activoId=id;
  } else if(action==='activate') {
    if(typeof incoming?.id!=='string'||!next.periodos[incoming.id])return;
    next.activoId=incoming.id;
  } else if(action==='deactivate') {
    if(next.activoId!==incoming?.id)return;
    next.activoId=null;
  } else return;
  next.modificadoEn=Date.now();
  return next;
}
function validateChanges(changes) {
  if(!changes || typeof changes!=='object'||Array.isArray(changes))return false;
  const allowed=new Set(['tituloSuperior','carrera','estado','observacionAdmin','actividades',
    'evidencias','totales','fechaActualizacion']);
  const keys=Object.keys(changes);
  if(keys.length<1 || keys.length>15 ||
    keys.some(key=>!allowed.has(key)&&!/^historialCambios\/[a-zA-Z0-9_-]{8,80}$/.test(key)))return false;
  const activities=changes.actividades;
  if(!Array.isArray(activities)||activities.length<1||activities.length>500)return false;
  if(activities.some(v=>!v||typeof v!=='object'
    ||typeof v.date!=='string'||!Number.isFinite(Date.parse(v.date))
    ||!Number.isFinite(v.hours)||v.hours<=0||v.hours>24
    ||(v.valueHour!==null && (!Number.isFinite(v.valueHour)||v.valueHour<0))
    ||typeof v.notes!=='string'||!v.notes.trim()
    ||typeof v.evidence!=='string'||(v.evidence&&!/^https?:\/\//i.test(v.evidence))))return false;
  if(!['Enviada','Revisada','Observada','Aprobada'].includes(changes.estado))return false;
  if(changes.estado==='Aprobada'&&activities.some(v=>v.valueHour===null||v.valueHour<=0))return false;
  if(changes.estado==='Observada' && !String(changes.observacionAdmin||'').trim())return false;
  if(!changes.totales||changes.totales.clases!==activities.length)return false;
  const hours=activities.reduce((sum,v)=>sum+v.hours,0);
  const total=Number(activities.reduce((sum,v)=>sum+v.hours*(v.valueHour||0),0).toFixed(2));
  if(Math.abs(changes.totales.horas-hours)>1e-7||Math.abs(changes.totales.valor-total)>0.001)return false;
  return true;
}
async function readBody(req) {
  let chunks=[],size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>2*1024*1024)throw new Error('Solicitud demasiado grande (máximo 2 MB).');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function api(req,res,path,url) {
  if(!validToken(req.headers['x-local-admin']))return httpError(res,403,'Solicitud local no autorizada.');
  try {
    if(path==='/api/read' && req.method==='GET') {
      const location=url.searchParams.get('path')||'';
      if(!allowedRead(location))return httpError(res,400,'Ruta de consulta no permitida.');
      const snapshot=await db.ref(location).get();
      return reply(res,200,{value:snapshot.val()});
    }
    if(path==='/api/period-change' && req.method==='POST') {
      const payload=await readBody(req);
      if(!['create','activate','deactivate'].includes(payload.action)) {
        return httpError(res,400,'Acción inválida.');
      }
      if(payload.action==='create' && !validatePeriod(payload.incoming))
        return httpError(res,400,'Período inválido.');
      const result=await db.ref('periodosHojaFinanciera').transaction(
        current=>changePeriod(current,payload.action,payload.incoming),undefined,false);
      return reply(res,200,{committed:result.committed});
    }
    if(path==='/api/update'&&req.method==='POST') {
      const payload=await readBody(req);
      if(typeof payload.path!=='string'||!/^hojasFinancieras\/[-A-Za-z0-9_]{1,128}$/.test(payload.path)) {
        return httpError(res,400,'Solo se permite actualizar una hoja existente.');
      }
      if(!validateChanges(payload.changes))return httpError(res,400,'Datos financieros no válidos.');
      const target=db.ref(payload.path);
      if(!(await target.get()).exists())return httpError(res,404,'La hoja ya no existe.');
      const patch={...payload.changes};
      // El servidor fija la hora y el tipo de actor; nunca expone la credencial.
      patch.fechaActualizacion=Date.now();
      for(const k of Object.keys(patch))if(k.startsWith('historialCambios/')) {
        patch[k]={...patch[k],fecha:Date.now(),uid:'operador-local',
          actor:'Operador de este equipo; no se verifica identidad individual'};
      }
      await target.update(patch);
      return reply(res,200,{ok:true});
    }
    return httpError(res,404,'Operación desconocida.');
  } catch(error) {
    console.error('Error al gestionar datos:',error);
    return httpError(res,500,'No se pudo completar la operación en Firebase: '+error.message);
  }
}
async function serveStatic(req,res,path) {
  if(req.method!=='GET')return httpError(res,405,'Método no permitido.');
  if(path==='/'||path==='/administrador/') {
    res.writeHead(302,{Location:'/desktop-admin/','Cache-Control':'no-store'});
    return res.end();
  }
  if(path==='/desktop-admin/'||path==='/desktop-admin/index.html') {
    let html=await readFile(join(ROOT,'desktop-admin/index.html'),'utf8');
    html=html.replace('</head>','<meta name="local-admin-token" content="'+token+'"></head>');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' https://cdn.sheetjs.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    return res.end(html);
  }
  const resource=staticRoutes[path];
  if(!resource)return httpError(res,404,'Recurso no encontrado.');
  const content=await readFile(join(ROOT,resource[0]));
  res.writeHead(200,{'Content-Type':resource[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(content);
}
const server=createServer(async(req,res)=>{
  if(!isSameOriginRequest(req))return httpError(res,403,'Acceso permitido solo desde esta computadora.');
  const url=new URL(req.url,URL_BASE);
  try {
    if(url.pathname.startsWith('/api/'))await api(req,res,url.pathname,url);
    else await serveStatic(req,res,url.pathname);
  } catch(error) {
    console.error('Error de servidor:',error);
    httpError(res,500,'Error interno del administrador local.');
  }
});
server.listen(PORT,ADDRESS,()=>{
  console.log('\nAdministrador de Hoja Financiera activo en '+URL_BASE+'/desktop-admin/');
  console.log('Acceso directo: no requiere Firebase Authentication ni iniciar sesión.');
  console.log('No cierres esta ventana mientras trabajas.\n');
  if(process.platform==='win32') {
    execFile('cmd.exe',['/c','start','','"'+URL_BASE+'/desktop-admin/"'],{windowsHide:true},()=>{});
  }
});
