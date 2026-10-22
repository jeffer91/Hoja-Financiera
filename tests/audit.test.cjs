'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const teacher=read('app.js'), admin=read('administrador/admin.js');
const teacherHtml=read('index.html'), adminHtml=read('administrador/index.html');
const stripped=code=>code.replace(/^import .*?;\s*$/gm,'');
const ids=code=>[...code.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);

function functionSource(code,name) {
  let start=code.indexOf('function '+name+'(');
  assert.ok(start>=0,'Falta función '+name);
  if(code.slice(start-6,start)==='async ')start-=6;
  const end=code.indexOf('\n}\n',start);
  assert.ok(end>start,'Cierre de función '+name);
  return code.slice(start,end+2);
}
function make(code,name,args=[],values=[]) {
  return new Function(...args,functionSource(code,name)+'\nreturn '+name)(...values);
}

test('Ambos scripts tienen sintaxis válida',()=>{
  new vm.Script(stripped(teacher));
  new vm.Script(stripped(admin));
});
test('Todos los ID de controles existen sin duplicados y hay logotipo',()=>{
  for(const [html,js] of [[teacherHtml,teacher],[adminHtml,admin]]) {
    const set=ids(html);
    assert.equal(new Set(set).size,set.length);
    for(const m of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(set.includes(m[1]),m[1]);
  }
  assert.ok(fs.existsSync(path.join(root,'assets/logo-itsqmet.jpg')));
});
test('Docente no puede editar períodos y el administrador usa transacciones',()=>{
  for(const id of ['startMonth','startYear','endMonth','endYear','reviewPeriod'])
    assert.ok(!ids(teacherHtml).includes(id));
  assert.match(teacher,/onValue\(ref\(db, PERIODS_PATH\)/);
  assert.match(admin,/runTransaction\(ref\(db, PERIODS_PATH\)/);
});
test('Solo se activa un período y los anteriores quedan guardados',()=>{
  const change=make(admin,'applyPeriodChange');
  const a={id:'a',mesInicio:10,anioInicio:2026,mesFin:3,anioFin:2027};
  const b={...a,id:'b'};
  const first=change(null,'create',a);
  const second=change(first,'create',b);
  assert.equal(first.activoId,'a');
  assert.equal(second.activoId,'b');
  assert.equal(Object.keys(second.periodos).length,2);
  const inactive=change(second,'deactivate',{id:'b'});
  assert.equal(inactive.activoId,null);
  assert.equal(change(inactive,'activate',{id:'a'}).activoId,'a');
});
test('La selección docente acepta únicamente el período activo válido',()=>{
  const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const select=new Function('MONTHS',
    functionSource(teacher,'validPeriod')+'\n'+functionSource(teacher,'selectActivePeriod')+'\nreturn selectActivePeriod')(months);
  const id='2026-10_2027-03';
  const data={activoId:id,periodos:{[id]:{mesInicio:10,anioInicio:2026,mesFin:3,anioFin:2027}}};
  assert.equal(select(data).etiqueta,'Octubre 2026 - Marzo 2027');
  assert.equal(select({...data,activoId:null}),null);
  assert.equal(select({activoId:id,periodos:{[id]:{mesInicio:13,anioInicio:2026,mesFin:3,anioFin:2027}}}),null);
});
test('Fechas fuera del período, días inexistentes y URLs peligrosas se rechazan',()=>{
  const valid=make(teacher,'validClassDate',['activePeriod'],[
    {mesInicio:10,anioInicio:2026,mesFin:3,anioFin:2027}]);
  assert.equal(valid('2026-10-22'),true);
  assert.equal(valid('2027-03-31'),true);
  assert.equal(valid('2026-09-30'),false);
  assert.equal(valid('2027-04-01'),false);
  assert.equal(valid('2027-02-30'),false);
  const url=make(teacher,'validEvidenceUrl');
  assert.equal(url(''),true);
  assert.equal(url('https://teams.microsoft.com/recording'),true);
  assert.equal(url('www.tarjetiva.com'),false);
  assert.equal(url('javascript:alert(1)'),false);
});
test('Revisión sin tarifa se guarda; aprobación exige tarifa y registra historial',async()=>{
  const period={mesInicio:10,anioInicio:2026,mesFin:3,anioFin:2027};
  const records=[{id:'r1',periodo:period,tituloSuperior:'Magíster',carrera:'Mecánica',
    estado:'Enviada',observacionAdmin:'',actividades:[]}];
  let rows=[{date:'2026-10-22',valueHour:null,hours:2,notes:'Refuerzo',evidence:''}];
  let status='Revisada'; const writes=[];
  const elements={
    editTitle:{value:'Magíster'},editCareer:{value:'Mecánica'},
    editStatus:{get value(){return status}},editObservation:{value:''},
    saveSheetBtn:{disabled:false},sheetDialog:{close(){}}
  };
  const save=new Function('records','currentId','editedActivities','validActivityDate','validEvidenceUrl',
    '$','toast','push','ref','db','auth','update','renderHistory','console',
    functionSource(admin,'saveCurrent')+'\nreturn saveCurrent')(
    records,'r1',()=>rows,make(admin,'validActivityDate'),make(admin,'validEvidenceUrl'),
    id=>elements[id],()=>{},()=>({key:'h1'}),(_,value)=>value,{},
    {currentUser:{uid:'test-uid'}},async(_,payload)=>writes.push(payload),()=>{},console
  );
  assert.equal(await save(),true);
  assert.equal(writes[0].actividades[0].valueHour,null);
  assert.ok(writes[0]['historialCambios/h1']);
  status='Aprobada';
  assert.equal(await save(),false);
  assert.equal(writes.length,1);
  rows=[{...rows[0],valueHour:7.5}];
  assert.equal(await save(),true);
  assert.equal(writes.length,2);
  assert.equal(writes[1].totales.valor,15);
});
test('Envíos concurrentes e idénticos no producen duplicados',async()=>{
  const p={id:'a',mesInicio:10,anioInicio:2026,mesFin:3,anioFin:2027,etiqueta:'Octubre 2026 - Marzo 2027'};
  const elements={submitAdminBtn:{disabled:false,textContent:''},cedula:{value:'1711111111'},
    teacherName:{value:'DOCENTE'},teacherTitle:{value:'MAGÍSTER'},teacherCareer:{value:'MECÁNICA'}};
  const store=new Map(),writes=[]; let next=0;
  const fn=new Function('validateForm','db','$','get','ref','PERIODS_PATH','selectActivePeriod',
    'setActivePeriod','toast','renderPeriodAvailability','updateAll','validateActivityCards',
    'reportValidationError','activities','CONCEPT','teacherSource','localStorage','push','set',
    'saveDraft','setSubmissionNote','console',
    'let submissionInProgress=false;let activePeriod='+JSON.stringify(p)+';let periodState="ready";\n'+
    functionSource(teacher,'submitToAdmin')+'\nreturn submitToAdmin')(
    ()=>true,{},id=>elements[id],
    async()=>({val:()=>({activoId:p.id,periodos:{[p.id]:p}})}),(_,id)=>id,
    'periodosHojaFinanciera',()=>p,()=>{},()=>{},()=>{},()=>{},()=>true,()=>{},
    ()=>[{date:'2026-10-22',valueHour:null,hours:2,notes:'Refuerzo',evidence:''}],
    'Clases de refuerzo por carrera','manual',
    {getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    ()=>({key:'r'+(++next)}),async(_,payload)=>writes.push(payload),
    ()=>{},()=>{},{error(){},warn(){}}
  );
  await Promise.all([fn(),fn()]);
  assert.equal(writes.length,1);
  await fn();
  assert.equal(writes.length,1);
});
test('Reglas documentadas niegan lectura pública de hojas y escritura de períodos',()=>{
  const md=read('FIREBASE-ADMIN.md');
  const fence=String.fromCharCode(96).repeat(3);
  const match=md.match(new RegExp(fence+'json\\n([\\s\\S]*?)\\n'+fence));
  assert.ok(match,'Falta JSON de reglas de Firebase');
  const rules=JSON.parse(match[1]);
  assert.notEqual(rules.hojasFinancieras['.read'],true);
  assert.notEqual(rules.periodosHojaFinanciera['.write'],true);
  const validation = rules.hojasFinancieras['$id']['.validate'];
  assert.ok(validation.includes("newData.child('estado').val() === 'Enviada'"));
  assert.ok(validation.includes("newData.child('totales').child('valor').val() === 0"));
});
test('El despliegue está condicionado a la ejecución de las pruebas',()=>{
  assert.match(read('.github/workflows/pages.yml'),/node --test tests\/audit\.test\.cjs/);
});
