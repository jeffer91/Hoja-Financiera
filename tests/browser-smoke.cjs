'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};

test('Formulario: período activo, fechas libres, borrador, 24 clases y PDF completo', {timeout:180000}, async()=>{
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=pathname==='/'?'index.html':pathname==='/administrador/'?'administrador/index.html':pathname.slice(1);
    const target=path.resolve(root,file);
    if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    fs.readFile(target,(err,bytes)=>{
      if(err){res.writeHead(404);return res.end();}
      res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'});
      res.end(bytes);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hf-smoke-'));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({acceptDownloads:true});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.route('https://hoja-financiera-api.onrender.com/**',route=>{
      const p=new URL(route.request().url()).pathname;
      if(p==='/api/periods')return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({activoId:'2026-11_2027-05',periodos:{}})});
      if(p==='/api/health')return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({ok:true})});
      if(p==='/api/admin/stats')return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({total:0,pendientes:0,observadas:0,aprobadas:0,horas:0})});
      return route.fulfill({status:403,contentType:'application/json',body:'{"error":"No autorizado"}'});
    });
    await page.goto(base+'/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.getElementById('periodSelect')?.value==='2026-11_2027-05');
    assert.equal(await page.locator('#periodSelect option').count(),3);
    await page.locator('#cedula').fill('1713315131');
    await page.locator('#teacherLastNames').fill('Prueba Auditoria');
    await page.locator('#teacherFirstNames').fill('Persona');
    await page.locator('#teacherTitle').fill('Magíster en Pruebas');
    await page.locator('[data-next-page="2"]').click();
    const first=page.locator('.activity-card').first();
    await first.locator('.activity-date').fill('2026-09-09');
    await first.locator('.activity-topic').selectOption('Clase de metodología');
    await first.locator('.activity-evidence').fill('https://example.org/grabacion-1');
    await page.locator('[data-next-page="3"]').click();
    assert.equal(await page.locator('#wizardPageLabel').innerText(),'Paso 3 de 3');
    const firstDownload=page.waitForEvent('download',{timeout:90000});
    await page.locator('#pdfBtn').click();
    const firstFile=await firstDownload;
    const firstPath=path.join(folder,'one.pdf');
    await firstFile.saveAs(firstPath);
    assert.equal(fs.readFileSync(firstPath).subarray(0,5).toString(),'%PDF-');
    assert.equal(await page.locator('#pdfContent .official-class-row').count(),1);
    await page.reload({waitUntil:'load'});
    await page.waitForFunction(()=>document.getElementById('periodSelect')?.value==='2026-11_2027-05');
    assert.equal(await page.locator('.activity-card').count(),1);
    assert.equal(await page.locator('.activity-date').first().inputValue(),'2026-09-09');
    await page.locator('[data-next-page="2"]').click();
    await page.evaluate(()=>{
      const add=document.getElementById('addActivityBtn');
      for(let i=2;i<=24;i++){
        add.click();
        const cards=document.querySelectorAll('#activities .activity-card');
        const card=cards[cards.length-1];
        card.querySelector('.activity-date').value='2026-09-10';
        card.querySelector('.activity-topic').value='Clase de refuerzo por carrera';
        card.querySelector('.activity-evidence').value='https://example.org/grabacion-'+i;
      }
      document.querySelector('#activities .activity-card:last-child .activity-evidence')
        .dispatchEvent(new Event('change',{bubbles:true}));
    });
    assert.equal(await page.locator('.activity-card').count(),24);
    assert.match(await page.locator('#activitySummaryCount').innerText(),/24 clases/);
    await page.locator('[data-next-page="3"]').click();
    assert.equal(await page.locator('#wizardPageLabel').innerText(),'Paso 3 de 3');
    const manyDownload=page.waitForEvent('download',{timeout:90000});
    await page.locator('#pdfBtn').click();
    const manyFile=await manyDownload;
    const manyPath=path.join(folder,'twenty-four.pdf');
    await manyFile.saveAs(manyPath);
    assert.equal(fs.readFileSync(manyPath).subarray(0,5).toString(),'%PDF-');
    assert.equal(await page.locator('#pdfContent .official-class-row').count(),24);
    assert.equal(await page.locator('#pdfContent .financial-page').count(),2);
    assert.equal(await page.locator('#pdfContent .evidence-page').count(),6);
    assert.equal(await page.locator('#pdfContent .evidence-item').count(),24);
    await page.goto(base+'/administrador/',{waitUntil:'load'});
    assert.equal(await page.locator('#privatePanel').isHidden(),true);
    assert.equal(await page.locator('#privateHint').isVisible(),true);
    assert.deepEqual(errors,[],'Errores JavaScript del navegador: '+errors.join(' / '));
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
