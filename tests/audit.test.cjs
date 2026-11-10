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
test('El flujo docente termina en generar y no sube documentos',()=>{
  assert.match(form,/id="pdfBtn"/);
  assert.doesNotMatch(form,/signedPdfFile|submitAdminBtn|statusLookupBtn/);
  assert.doesNotMatch(teacher,/\/api\/submit|\/api\/revise|checkDocumentService|firebasejs/);
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

});
test('Una hoja observada puede corregirse con enlace privado y guarda nuevas versiones',()=>{
  assert.match(api,/\/api\/private\/sheet/);
  assert.match(api,/\/api\/revise/);
  assert.match(api,/old\.estado!==STATES\.observed/);
  assert.match(api,/versionActual/);


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
  assert.ok(teacher.includes("'evidencePage').hidden = ev.length === 0"));
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
  assert.equal(fn({...sheet,actividades:[{...sheet.actividades[0],hours:1.35}]},period).totales.horas,1.35);
  assert.equal(fn({...sheet,actividades:[{...sheet.actividades[0],hours:0.01}]},period).totales.horas,0.01);
  assert.equal(fn({...sheet,actividades:[{...sheet.actividades[0],hours:1.35},{...sheet.actividades[0],hours:2.45}]},period).totales.horas,3.8);
  assert.throws(()=>fn({...sheet,actividades:[{...sheet.actividades[0],hours:1.235}]},period));
  assert.throws(()=>fn({...sheet,actividades:[{...sheet.actividades[0],hours:0}]},period));
  assert.throws(()=>fn({...sheet,actividades:[{...sheet.actividades[0],date:'2026-09-01'}]},period));
  assert.throws(()=>fn({...sheet,actividades:[{...sheet.actividades[0],hours:25}]},period));
});
test('Dos decimales en horas y concepto fijo conservado solo en el documento',()=>{
  assert.match(form,/class="activity-hours"[^>]*min="0\.01"[^>]*step="0\.01"/);
  assert.doesNotMatch(form,/<h2>Actividad<\/h2>|class="fixed-value"/);
  assert.match(teacher,/const CONCEPT = 'Clases de refuerzo por carrera'/);
  assert.match(teacher,/minimumFractionDigits:2/);
  assert.match(form,/id="pvActivities"/);
});
test('Salida fiel a plantilla oficial en Carta con páginas adicionales sin perder filas',()=>{
  assert.match(form,/class="financial-sheet"/);
  assert.match(form,/REGISTRO DE PAGO DE HABERES DEL PERSONAL DIRECTIVO Y DOCENTE/);
  assert.match(form,/<th>MATERIAS:<\/th>/);
  assert.match(form,/COORDINADOR DE TITULACIÓN:/);
  assert.match(form,/<th rowspan="2" class="col-value">VALOR HORA<\/th>/);
  assert.match(teacher,/const OFFICIAL_NUMBERED_ROWS = 23/);
  assert.match(teacher,/const OFFICIAL_SPACER_ROWS = 7/);
  assert.match(teacher,/function paginateFinancialRows\(rows\)/);
  assert.match(teacher,/function renderOfficialFinancialPages\(rows\)/);
  assert.match(teacher,/rowOffset \+= batch\.length/);
  assert.match(teacher,/numbered && \(row \|\| isLast\)/);
  assert.match(teacher,/format:'letter'/);
  assert.match(read('styles.css'),/@page \{ size: letter; margin: 0; \}/);
  const paginate=pure(teacher,'paginateFinancialRows',['OFFICIAL_NUMBERED_ROWS'],[23]);
  for(const n of [1,23,24,80]) {
    const data=Array.from({length:n},(_,i)=>({notes:'Clase '+i}));
    const pages=paginate(data);
    assert.equal(pages.reduce((total,group)=>total+group.length,0),n);
    assert.ok(pages.every(group=>group.length<=23));
    if(n>23) assert.ok(pages.length>1);
  }
});
test('Evidencia obligatoria por clase, horas coincidentes y permisos para revisión',()=>{
  const evidenceField=form.match(/<input class="activity-evidence"[^>]*\/>/)?.[0];
  assert.ok(evidenceField,'Falta el campo de enlace');
  assert.match(evidenceField,/type="url"/);
  assert.match(evidenceField,/required/);
  assert.doesNotMatch(form,/Enlace de grabación o evidencia <span class="optional">opcional<\/span>/);
  assert.match(form,/Las horas declaradas deben coincidir/);
  assert.match(form,/permisos de visualización/);
  assert.match(form,/no serán validadas para el pago/);
  assert.match(teacher,/const badEvidence = !evidence\.value\.trim\(\)/);
  assert.doesNotMatch(teacher,/La evidencia es opcional/);
  const clean=pure(api,'sanitizeString');
  const validPeriod=pure(api,'validPeriod');
  const verify=pure(api,'verifySheet',['sanitizeString','validPeriod'],[clean,validPeriod]);
  const period={id:'2026-02_2026-08',mesInicio:2,anioInicio:2026,mesFin:8,anioFin:2026};
  const base={cedula:'1718435009',docente:'Docente de Prueba Completo',tituloSuperior:'Magíster',
    actividades:[{date:'2026-02-12',hours:2.25,notes:'Clase de refuerzo',evidence:'https://example.org/grabacion'}]};
  assert.equal(verify(base,period).evidencias,1);
  for(const evidence of ['', ' ', 'http://example.org/grabacion', 'javascript:alert(1)', 'https://']) {
    assert.throws(()=>verify({...base,actividades:[{...base.actividades[0],evidence}]},period));
  }
});
test('Comprobación de páginas está condicionada a las pruebas automáticas',()=>{
  assert.match(read('.github/workflows/pages.yml'),/node --test tests\/audit\.test\.cjs/);
});


test('El docente puede seleccionar Febrero 2026 - Agosto 2026, incluso sin período activo',()=>{
  assert.match(form,/id="periodSelect"/);
  assert.match(form,/value="2026-02_2026-08"/);
  assert.match(teacher,/INITIAL_PERIOD_ID = '2026-02_2026-08'/);

  assert.match(teacher,/periodId:activePeriod\?\.id/);
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


test('Enlaces seguros HTTP y HTTPS, fechas reales y almacenamiento bloqueado',()=>{
  const valid=pure(teacher,'validEvidenceUrl');
  assert.equal(valid('https://example.org/video?q=1'),true);
  assert.equal(valid(''),false);
  assert.equal(valid('  '),false);
  assert.equal(valid('http://example.org/video'),false);
  assert.equal(valid('javascript:alert(1)'),false);
  const date=pure(teacher,'validClassDate',['activePeriod'],[null]);
  assert.equal(date('2026-02-30'),false);
  assert.equal(date('2026-02-28'),true);
  const cedula={value:'1718-435 009'};
  const sanitize=pure(teacher,'sanitizeCedula',['$'],[()=>cedula]);
  sanitize();
  assert.equal(cedula.value,'1718435009');

});

test('El docente ingresa apellidos y nombres por separado sin consulta automática',()=>{
  for(const id of ['teacherLastNames','teacherFirstNames']) {
    const field=form.match(new RegExp('<input id="'+id+'"[^>]*>'))?.[0];
    assert.ok(field,'Falta campo '+id);
    assert.match(field,/required/);
    assert.doesNotMatch(field,/readonly/);
  }
  assert.match(form,/<select id="teacherCareer">/);
  assert.match(form,/<option value="__other__">/);
  assert.match(form,/id="teacherCareerOther"/);
  assert.doesNotMatch(form,/id="(?:lookupBtn|manualTeacherBtn|firebaseStatus|lookupMessage)"/);
  assert.doesNotMatch(teacher,/lookupTeacher|findRecord|patrociniosGenerados|rememberTitle|restoreTitle|lookupSequence|teacherSource|setFirebaseStatus/);
  assert.match(teacher,/addEventListener\('input', sanitizeCedula\)/);
  assert.match(teacher,/function careerValue\(\)/);
  assert.match(teacher,/function fullTeacherName\(\)/);
  assert.match(teacher,/\['teacherLastNames','teacherFirstNames','teacherTitle'\]/);
  assert.match(teacher,/d\.teacherName/); // Migración sin pérdida de borradores antiguos.
});
test('El nombre completo se compone para el PDF en orden apellidos y nombres',()=>{
  const full=pure(teacher,'fullTeacherName',['$','clean'],[
    id=>({value:id==='teacherLastNames'?'  De   la Cruz  ': '  María   Fernanda '}),
    str=>String(str||'').replace(/\s+/g,' ').trim()
  ]);
  assert.equal(full(),'De la Cruz María Fernanda');
  assert.match(teacher,/pvName'\)\.textContent = fullTeacherName\(\)/);
  assert.match(teacher,/evName'\)\.textContent = fullTeacherName\(\)/);
});

test('El formulario inicia sin mostrar aviso de verificación falso',()=>{
  assert.ok(form.includes('class="period-warning" role="alert" hidden'));
  assert.doesNotMatch(form,/Verificando disponibilidad del formulario/);
  assert.ok(read('styles.css').includes('.period-warning[hidden] { display:none !important; }'));
});
test('El PDF utiliza la carrera seleccionada en MATERIAS y mantiene el concepto',()=>{
  assert.ok(form.includes('<td id="pvSubject">'));
  assert.ok(teacher.includes("$('pvSubject').textContent = careerValue() || CONCEPT;"));
  assert.ok(teacher.includes("const CONCEPT = 'Clases de refuerzo por carrera';"));
  assert.ok(form.includes('class="teacher-career-choice"'));
  assert.ok(read('styles.css').includes('.teacher-grid .teacher-career-choice'));
});

test('El logotipo institucional original existe y se usa en hoja y evidencias',()=>{
  const asset=path.join(root,'assets/logo-formato-institucional.jpg');
  assert.ok(fs.existsSync(asset),'Logotipo original ausente');
  const bytes=fs.readFileSync(asset);
  assert.equal(bytes.length,26711,'El logotipo original cambió');
  assert.deepEqual([...bytes.subarray(0,3)],[255,216,255],'Archivo JPEG inválido');
  assert.ok(form.includes('class="doc-logo-wrap"><img src="assets/logo-formato-institucional.jpg"'));
  assert.ok(form.includes('<img src="assets/logo-formato-institucional.jpg" alt="Logotipo institucional original"'));
  const css=read('styles.css');
  assert.ok(css.includes('width: 132mm;'));
  assert.ok(css.includes('height: 25.2mm;'));
  assert.ok(css.includes('object-fit: fill;'));
  assert.ok(css.includes('border-top: 0;'));
});
