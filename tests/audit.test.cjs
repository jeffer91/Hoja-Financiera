'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const teacher=read('app.js'),form=read('index.html');
const admin=read('administrador/dashboard.js'),panel=read('administrador/index.html');
const api=read('backend/server.mjs'),config=read('api-config.js');
const ids=html=>[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const strip=source=>source.replace(/^import .*?;\s*$/gm,'');
function functionSource(code,name) {
  let start=code.indexOf('function '+name+'(');
  assert.ok(start>=0,'Falta función '+name);
  if(code.slice(start-6,start)==='async ')start-=6;
  const end=code.indexOf('\n}\n',start);
  assert.ok(end>start,'Cierre faltante de '+name);
  return code.slice(start,end+2);
}
function pure(code,name,parameters=[],values=[]) {
  return new Function(...parameters,functionSource(code,name)+'\nreturn '+name)(...values);
}
test('Los módulos JavaScript tienen sintaxis válida',()=>{
  for(const file of ['app.js','api-config.js','administrador/dashboard.js','backend/server.mjs']) {
    const check=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
    assert.equal(check.status,0,file+' '+check.stderr);
  }
});
test('Ningún control del formulario o administrador falta o se duplica',()=>{
  for(const [markup,script] of [[form,teacher],[panel,admin]]) {
    const all=ids(markup);
    assert.equal(new Set(all).size,all.length,'Duplicados');
    for(const m of script.matchAll(/\$\('([^']+)'\)/g)) {
      assert.ok(all.includes(m[1]),'Falta '+m[1]);
    }
  }
  assert.ok(fs.existsSync(path.join(root,'assets/logo-itsqmet.jpg')));
});
test('El administrador abre directamente en GitHub Pages sin instalador o pantalla de login',()=>{
  assert.match(panel,/id="privatePanel"/);
  assert.match(panel,/id="kPending"/);
  assert.doesNotMatch(panel,/127\.0\.0\.1|instalar administrador|Authentication|password/i);
  assert.doesNotMatch(admin,/getAuth|signInAnonymously/);
});
test('Estadísticas públicas y datos privados están separados',()=>{
  assert.match(api,/\/api\/admin\/stats/);
  assert.match(api,/\/api\/admin\/sheets/);
  assert.match(api,/adminAuthorized\(req\)/);
  assert.match(api,/x-admin-capability/);
  assert.match(admin,/state\.token/);
  assert.match(admin,/privateHint/);
});
test('Los docentes descargan PDF primero y solo después pueden subir uno firmado',()=>{
  assert.match(form,/id="pdfBtn"/);
  assert.match(form,/id="signedPdfFile"/);
  assert.match(form,/id="submitAdminBtn"/);
  assert.match(teacher,/readSignedPdf\(file\)/);
  assert.match(teacher,/\/api\/submit/);
  assert.match(api,/function readPdf/);
  assert.doesNotMatch(teacher,/set\(target,\s*payload\)/);
});
test('Solo PDF firmado se almacena en Storage y las versiones tienen nombre fijo',()=>{
  assert.match(api,/hojas-financieras\/.*firmadas\/v/);
  assert.match(api,/bucket\.file\(path\)\.save/);
  assert.match(api,/versiones/);
  assert.match(api,/archivoActual/);
  assert.match(api,/MAX_PDF/);
});
test('La consulta por cédula no entrega cédulas ni documentos completos',()=>{
  const src=functionSource(api,'status');
  assert.match(src,/cedula/);
  assert.match(src,/estado/);
  assert.doesNotMatch(src,/pdfBase64|capabilityHash|observacionAdmin/);
  assert.match(teacher,/\/api\/status\?cedula=/);
});
test('Una hoja observada puede corregirse con enlace privado y guarda nuevas versiones',()=>{
  assert.match(api,/\/api\/private\/sheet/);
  assert.match(api,/\/api\/revise/);
  assert.match(api,/old\.estado!==STATES\.observed/);
  assert.match(api,/versionActual/);
  assert.match(teacher,/loadCorrection/);
  assert.match(teacher,/correctionTarget\?\.periodo/);
  assert.match(admin,/\/api\/admin\/action/);
});
test('Las hojas aprobadas no pueden editarse ni devolverse',()=>{
  assert.match(api,/prev\.estado===STATES\.approved/);
  assert.match(api,/prev\.estado!==STATES\.received/);
  assert.match(api,/Observada/);
  assert.match(api,/Aprobada/);
});
test('La tarifa por hora queda vacía para el docente',()=>{
  assert.match(teacher,/valueHour:\s*null/);
  assert.match(api,/valueHour:null/);
  assert.match(form,/VALOR HORA/);
});
test('PDF institucional tiene ambas páginas y tres firmas',()=>{
  for(const id of ['financialPage','evidencePage'])assert.ok(ids(form).includes(id));
  for(const term of ['FIRMA DOCENTE','COORDINADOR DE TITULACIÓN','VICERRECTORADO'])
    assert.ok(form.includes(term));
  assert.ok(teacher.includes("'evidencePage').hidden = false"));
  assert.match(teacher,/pagebreak/);
});
test('No se consulta o escribe Firebase con secretos administrativos en el navegador',()=>{
  assert.ok(!config.includes('service-account'));
  assert.ok(!config.includes('ADMIN_ACCESS_TOKEN'));
  assert.match(api,/FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(api,/ADMIN_ACCESS_TOKEN/);
  assert.match(api,/APP_ORIGIN/);
  assert.match(api,/MAX_BODY/);
});
test('No se puede crear un documento fuera del período ni con horas inválidas',()=>{
  const clean=pure(api,'sanitizeString');
  const validPeriod=pure(api,'validPeriod');
  const fn=pure(api,'verifySheet',['sanitizeString','validPeriod'],[clean,validPeriod]);
  const period={id:'2026-10_2027-03',anioInicio:2026,mesInicio:10,anioFin:2027,mesFin:3};
  const sheet={cedula:'1718435009',docente:'Stalin Fabricio Llumiquinga Oña',
    tituloSuperior:'Ingeniero Automotriz',carrera:'Mecánica',
    actividades:[{date:'2026-10-22',hours:2,notes:'Clase de refuerzo',evidence:'https://example.org/video'}]};
  const verified=fn(sheet,period);
  assert.equal(verified.totales.horas,2);
  assert.equal(verified.actividades[0].valueHour,null);
  assert.throws(()=>fn({...sheet,actividades:[{...sheet.actividades[0],date:'2026-09-01'}]},period));
  assert.throws(()=>fn({...sheet,actividades:[{...sheet.actividades[0],hours:25}]},period));
});
test('Comprobación de páginas está condicionada a las pruebas automáticas',()=>{
  assert.match(read('.github/workflows/pages.yml'),/node --test tests\/audit\.test\.cjs/);
});


test('El docente puede seleccionar Febrero 2026 - Agosto 2026, incluso sin período activo',()=>{
  assert.match(form,/id="periodSelect"/);
  assert.match(form,/value="2026-02_2026-08"/);
  assert.match(teacher,/INITIAL_PERIOD_ID = '2026-02_2026-08'/);
  assert.match(teacher,/periodoId:activePeriod\?\.id/);
  assert.match(teacher,/periodId:correctionTarget\?\.periodo\?\.id\|\|activePeriod\?\.id/);
  assert.match(api,/selectedPeriod\(periodSnap\.val\(\),input\.periodoId\)/);
  assert.match(api,/\/api\/periods/);
});
test('El servidor acepta un período disponible pero rechaza uno inventado por el docente',()=>{
  const cleanPeriod=pure(api,'validPeriod');
  const p={id:'2026-02_2026-08',mesInicio:2,anioInicio:2026,mesFin:8,anioFin:2026,etiqueta:'Febrero 2026 - Agosto 2026'};
  const available=pure(api,'availablePeriods',['INITIAL_PERIOD_ID','INITIAL_PERIOD','validPeriod'],[p.id,p,cleanPeriod]);
  const selected=pure(api,'selectedPeriod',['availablePeriods'],[available]);
  assert.equal(selected(null,p.id).etiqueta,p.etiqueta);
  assert.equal(selected(null,'2027-01_2027-06'),null);
  const custom={id:'2026-10_2027-03',mesInicio:10,anioInicio:2026,mesFin:3,anioFin:2027,etiqueta:'Octubre 2026 - Marzo 2027'};
  assert.equal(selected({periodos:{[custom.id]:custom}},custom.id).id,custom.id);
  assert.equal(selected({periodos:{[custom.id]:custom}},p.id).id,p.id);
});
test('Las fechas de clase se validan contra el período Febrero–Agosto elegido',()=>{
  const clean=pure(api,'sanitizeString'),periodCheck=pure(api,'validPeriod');
  const verify=pure(api,'verifySheet',['sanitizeString','validPeriod'],[clean,periodCheck]);
  const period={id:'2026-02_2026-08',mesInicio:2,anioInicio:2026,mesFin:8,anioFin:2026};
  const base={cedula:'1718435009',docente:'Stalin Fabricio Llumiquinga Oña',tituloSuperior:'Ingeniero Automotriz',
    actividades:[{date:'2026-08-26',hours:2,notes:'Tutoría presencial',evidence:'https://example.org/video'}]};
  assert.equal(verify(base,period).totales.horas,2);
  assert.throws(()=>verify({...base,actividades:[{...base.actividades[0],date:'2026-10-22'}]},period));
});
