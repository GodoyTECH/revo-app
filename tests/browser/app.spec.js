import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const faction='11111111-1111-4111-8111-111111111111';
async function image(page,name='print.png') {
 const base64=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=400;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1100,400);c.fillStyle='black';c.font='bold 64px Arial';c.fillText('ALIADOS',60,90);c.fillText('FAC TESTE',60,200);c.fillText('FAMILIA TESTE',60,310);return canvas.toDataURL().split(',')[1];});
 return {name,mimeType:'image/png',buffer:Buffer.from(base64,'base64')};
}
async function open(page,route='ocr') {await page.goto('/#'+route);await expect(page.locator('#ocrFaction option')).toHaveCount(4);}
test('gallery, menu, hash refresh and responsive pages at every requested width',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,360,375,390,412,430]) {
  await page.setViewportSize({width,height:850});await open(page);
  const input=page.locator('#ocrFiles');await expect(input).not.toHaveAttribute('capture');await expect(input).toHaveAttribute('multiple','');
  await page.locator('.menu').click();await expect(page.locator('.menu')).toHaveAttribute('aria-expanded','true');await page.locator('nav a[href="#blacklist"]').click();await expect(page.locator('.menu')).toHaveAttribute('aria-expanded','false');await expect(page.locator('#blacklist')).toBeVisible();
  await page.goto('/#ocr');const file=await image(page);await input.setInputFiles(file);await expect(page.locator('#imagePreviews figure')).toHaveCount(1);await page.locator('[data-remove-image]').click();await expect(page.locator('#imagePreviews figure')).toHaveCount(0);await input.setInputFiles(file);await expect(page.locator('#imagePreviews figure')).toHaveCount(1);
  await input.setInputFiles([{...file,name:'two.png'},{...file,name:'three.png'}]);await expect(page.locator('#imagePreviews figure')).toHaveCount(3);
  for(const route of ['ocr','inimigos','aliados','divergencias','blacklist','facs','historico','admin']) {
   await page.goto('/#'+route);await page.reload();await expect(page.locator('#'+route)).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await expect(page.locator('.site-footer')).toBeVisible();
  }
  const duplicateIds=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});expect(duplicateIds).toEqual([]);
 }
 expect(errors).toEqual([]);
});
test('real OCR, human confirmation, navigation preservation, save and manual conflict resolution',async({page})=>{
 await mkdir('artifacts/screenshots',{recursive:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});await open(page);await page.locator('#ocrFaction').selectOption(faction);
 await page.locator('input[value="ALLY"]').check();await page.locator('#ocrFiles').setInputFiles(await image(page));
 await expect(page.locator('.toast')).not.toHaveClass(/visible/);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'artifacts/screenshots/ocr-mobile.png',fullPage:true});
 await page.locator('#processOcr').click();await expect(page.locator('#ocrReview')).toBeVisible({timeout:90000});
 const rows=page.locator('[data-ocr-name]');expect(await rows.count()).toBeGreaterThan(0);expect((await rows.first().inputValue()).toUpperCase()).toContain('FAC');
 await expect(page.locator('[data-confirm-row]').first()).not.toBeChecked();
 await page.locator('#confirmOcr').click();await expect(page.locator('.toast')).toContainText('confirme cada nome');
 const first=await rows.first().inputValue();await page.evaluate(()=>{location.hash='divergencias'});await expect(page.locator('#conflictList')).toContainText('GODDOY R.K');await expect(page.locator('#conflictList')).toContainText('FAMÍLIA RJ');await expect(page.locator('.toast')).not.toHaveClass(/visible/);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'artifacts/screenshots/divergencias.png',fullPage:true});
 await page.evaluate(()=>{location.hash='ocr'});await expect(rows.first()).toHaveValue(first);
 await rows.first().fill('FAC CORRIGIDA');await page.locator('#addOcrRow').click();await page.locator('[data-ocr-name]').last().fill('FAC MANUAL');
 for(const checkbox of await page.locator('[data-confirm-row]').all()) { if(!await checkbox.isChecked())await checkbox.check(); }
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.toast')).not.toHaveClass(/visible/);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'artifacts/screenshots/ocr-desktop.png',fullPage:true});
 const submission = page.waitForRequest((r)=>r.url().endsWith('/api/diplomacy-submit') && r.method()==='POST');
 await Promise.all([page.waitForEvent('dialog').then(async(dialog)=>{expect(dialog.message()).toContain('Ficarão fora');await dialog.accept();}),page.locator('#confirmOcr').click()]);const payload=(await submission).postDataJSON();expect(Object.keys(payload)).not.toContain('images');expect(JSON.stringify(payload)).not.toContain('print.png');expect(JSON.stringify(payload)).not.toContain('rawText');await expect(page.locator('#ocrSummary')).toContainText('Lista confirmada');
 await page.goto('/#fac/'+faction);await expect(page.locator('#factionDetail')).toContainText('FAC CORRIGIDA');await expect(page.locator('#factionDetail')).toContainText('FAC X');await expect(page.locator('.toast')).not.toHaveClass(/visible/);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'artifacts/screenshots/fac.png',fullPage:true});
 // Edit one entry, remove it, and save a new manual snapshot without losing enemies.
 await page.locator('#factionDetail [data-edit-list][data-type="ALLY"]').first().click();await expect(page.locator('#ocrReview')).toBeVisible();await page.locator('[data-remove-row]').first().click();
 await page.locator('#confirmOcr').click();await expect(page.locator('#ocrReview')).toBeHidden();await page.goto('/#fac/'+faction);await expect(page.locator('#factionDetail')).toContainText('FAC X');
 await page.goto('/#blacklist');await expect(page.locator('.toast')).not.toHaveClass(/visible/);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'artifacts/screenshots/blacklist.png',fullPage:true});await expect(page.locator('#relationList')).toContainText('VÓRTEX');
 expect(errors).toEqual([]);
});
test('keyboard file chooser, formats, validation, PWA and history navigation',async({page})=>{
 await open(page);await page.locator('#ocrFiles').focus();await expect(page.locator('#ocrFiles')).toBeFocused();const chooser=page.waitForEvent('filechooser',{timeout:10000});await page.locator('#ocrFiles').press('Enter');expect((await chooser).isMultiple()).toBe(true);
 await page.locator('#ocrFiles').setInputFiles({name:'bad.gif',mimeType:'image/gif',buffer:Buffer.from('bad')});await expect(page.locator('#uploadErrors')).toContainText('formato inválido');
 await page.locator('#ocrFiles').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});await expect(page.locator('#uploadErrors')).toContainText(/corrompido|preview/);await expect(page.locator('#processOcr')).toBeDisabled();
 await page.evaluate(()=>{location.hash='aliados'});await expect(page.locator('#aliados')).toBeVisible();await page.goBack();await expect(page.locator('#ocr')).toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),{timeout:10000}).toBe(true);
 await page.reload();await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 const manifest=await (await page.request.get('/manifest.webmanifest')).json();expect(manifest.display).toBe('standalone');
});
test('gallery size/quantity, real JPEG and WEBP decoding, drag/drop and accessible pages',async({page})=>{
 const {default:AxeBuilder}=await import('@axe-core/playwright');
 await open(page);const png=await image(page);
 await page.locator('#ocrFiles').setInputFiles(Array.from({length:6},(_,i)=>({...png,name:`file-${i}.png`})));await expect(page.locator('#imagePreviews figure')).toHaveCount(5);await expect(page.locator('#uploadErrors')).toContainText('limite');
 await page.reload();await page.locator('#ocrFiles').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(13*1024*1024)});await expect(page.locator('#uploadErrors')).toContainText('muito grande');
 for(const [mime,name] of [['image/jpeg','photo.jpg'],['image/webp','photo.webp']]) {
  const data=await page.evaluate((mime)=>{const c=document.createElement('canvas');c.width=20;c.height=20;return c.toDataURL(mime).split(',')[1]},mime);
  await page.locator('#ocrFiles').setInputFiles({name,mimeType:mime,buffer:Buffer.from(data,'base64')});
 }
 await expect(page.locator('#imagePreviews figure')).toHaveCount(2);await expect(page.locator('#processOcr')).toBeEnabled();
 await page.evaluate((base64)=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'drop.png',{type:'image/png'}));document.querySelector('#uploadZone').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},png.buffer.toString('base64'));await expect(page.locator('#imagePreviews figure')).toHaveCount(3);
 for(const route of ['ocr','divergencias','blacklist','facs','fac/'+faction]) {
  await page.goto('/#'+route);const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();expect(result.violations.map((v)=>({id:v.id,targets:v.nodes.map((n)=>n.target)}))).toEqual([]);
 }
});
test('PWA shell survives an offline refresh without caching API responses',async({page,context})=>{
 await open(page);await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.active),{timeout:10000}).toBe(true);await page.reload();
 await expect.poll(()=>page.evaluate(async()=>{const names=await caches.keys();const keys=(await Promise.all(names.map(async(name)=>(await(await caches.open(name)).keys()).map((r)=>r.url)))).flat();return keys.some((k)=>k.endsWith('/index.html'))&&keys.some((k)=>/main-.*\.js/.test(k));})).toBe(true);
 await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#ocr')).toBeVisible();await expect(page.locator('#dataError')).toBeVisible();
 const keys=await page.evaluate(async()=>{const names=await caches.keys();return(await Promise.all(names.map(async(n)=>(await(await caches.open(n)).keys()).map((r)=>r.url)))).flat()});expect(keys.some((url)=>url.includes('/api/'))).toBe(false);await context.setOffline(false);
});
test('manual Save confirms typed names and finishes on the FAC without individual checkboxes',async({page})=>{
 await open(page);await page.locator('#ocrFaction').selectOption(faction);await page.locator('input[value="ALLY"]').check();await page.locator('#manualList').click();
 await page.locator('[data-ocr-name]').last().fill('ALIADO MANUAL DIRETO');
 await page.locator('#addOcrRow').click();await page.locator('[data-ocr-name]').last().fill('SEGUNDO ALIADO MANUAL');
 await page.locator('#confirmOcr').click();await expect(page).toHaveURL(new RegExp('#fac/'+faction+'$'),{timeout:3000});
 await expect(page.locator('#factionDetail')).toContainText('ALIADO MANUAL DIRETO');await expect(page.locator('#factionDetail')).toContainText('SEGUNDO ALIADO MANUAL');await expect(page.locator('#factionDetail')).toContainText('FAC X');
 await expect(page.locator('#ocrReview')).toBeHidden();
 await page.locator('#factionDetail [data-edit-list][data-type="ALLY"]').first().click();await expect(page.locator('#confirmOcr')).toHaveText('SALVAR LISTA');await expect(page.locator('[data-confirm-row]')).toHaveCount(0);
 await page.locator('[data-ocr-name]').first().fill('ALIADO MANUAL EDITADO');await page.locator('#confirmOcr').click();await expect(page).toHaveURL(new RegExp('#fac/'+faction+'$'));
 await page.reload();await expect(page.locator('#factionDetail')).toContainText('ALIADO MANUAL EDITADO');await expect(page.locator('#factionDetail')).toContainText('SEGUNDO ALIADO MANUAL');await expect(page.locator('#factionDetail')).toContainText('FAC X');
});
test('manual failed Save keeps names for retry and never signals completion',async({page})=>{
 await page.request.post('/api/diplomacy-submit',{data:{sourceFactionId:faction,relationType:'ALLY',importMode:'COMPLETE',inputSource:'MANUAL',entries:[{name:'ALIADO MANUAL EDITADO',originalText:'ALIADO MANUAL EDITADO',confidence:100,confirmed:true}]}});
 await open(page);await page.locator('#ocrFaction').selectOption(faction);await page.locator('#manualList').click();await page.locator('[data-ocr-name]').last().fill('INIMIGO MANUAL RETENTATIVA');
 await page.route('**/api/diplomacy-submit',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Não foi possível salvar. Tente novamente.'})}));
 await page.locator('#confirmOcr').click();await expect(page.locator('.toast')).toContainText('Não foi possível salvar');await expect(page.locator('#ocrReview')).toBeVisible();await expect(page.locator('[data-ocr-name]').last()).toHaveValue('INIMIGO MANUAL RETENTATIVA');await expect(page.locator('#confirmOcr')).toBeEnabled();
 await page.unroute('**/api/diplomacy-submit');await page.locator('#confirmOcr').click();await expect(page).toHaveURL(new RegExp('#fac/'+faction+'$'));await expect(page.locator('#factionDetail')).toContainText('INIMIGO MANUAL RETENTATIVA');await expect(page.locator('#factionDetail')).toContainText('ALIADO MANUAL EDITADO');
});
test('duplicate names and Blacklist identify the exact blocks and still save one relation',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await open(page);await page.locator('#ocrFaction').selectOption(faction);await page.locator('#manualList').click();
 await page.locator('[data-ocr-name]').last().fill('FML BLOODS');await expect(page.locator('#reviewIssues')).toContainText('já está na Blacklist oficial');
 await page.locator('#addOcrRow').click();await page.locator('[data-ocr-name]').last().fill('fml bloods');
 await expect(page.locator('#reviewIssues')).toContainText('FML BLOODS: repetição nos blocos');const rows=page.locator('.ocr-row.has-issue');expect(await rows.count()).toBeGreaterThanOrEqual(2);await expect(page.locator('.toast')).not.toHaveClass(/visible/);await page.locator('#reviewIssues').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/screenshots/repeticoes-mobile.png'});
 await page.locator('#confirmOcr').click();await expect(page).toHaveURL(new RegExp('#fac/'+faction+'$'));
 const result=await(await page.request.get('/api/diplomacy')).json();const snapshot=result.history.find((s)=>s.source_faction_id===faction&&s.relation_type==='ENEMY');expect(snapshot.entries.filter((e)=>e.name==='FML BLOODS')).toHaveLength(1);
});
test('local crop changes the preview and OCR reads only the selected column',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await open(page);await page.locator('#ocrFaction').selectOption(faction);
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=400;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1200,400);x.fillStyle='black';x.font='bold 48px Arial';x.fillText('FAC RECORTADA',40,130);x.fillText('OUTRA FAC',40,270);x.fillText('RUIDO LATERAL',650,130);return c.toDataURL().split(',')[1];});
 await page.locator('#ocrFiles').setInputFiles({name:'crop.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});await page.locator('[data-crop-image]').click();await expect(page.locator('#cropDialog')).toBeVisible();const {default:AxeBuilder}=await import('@axe-core/playwright');expect((await new AxeBuilder({page}).include('#cropDialog').withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);await page.screenshot({path:'artifacts/screenshots/recorte-mobile.png'});
 await page.locator('#cropDialog [name=right]').fill('50');await page.locator('#cropDialog [name=right]').dispatchEvent('input');await page.locator('[data-crop-apply]').click();await expect(page.locator('#cropDialog')).not.toBeVisible();await expect(page.locator('#imagePreviews')).toContainText('RECORTADA');
 await page.locator('#processOcr').click();await expect(page.locator('#ocrReview')).toBeVisible();const names=await page.locator('[data-ocr-name]').evaluateAll((rows)=>rows.map((r)=>r.value));expect(names.join(' ')).toContain('FAC RECORTADA');expect(names.join(' ')).not.toContain('RUIDO');
});
if(process.env.REVO_OCR_EXAMPLES_DIR) test('real OCR reads the four supplied game lists as five complete names each',async({page})=>{
 test.setTimeout(120000);const {join}=await import('node:path');
 const distance=(a,b)=>{let previous=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=row;}return previous[b.length];};
 const samples=[['1-91643.jpg',['TREM DO ODIO 00','EQP PE NAPORTA','SOBERANIA','FML BLOODS','BELLADONA']],['2-91640.jpg',['TROP DO CORONEL','TROPA DO VOVO','FAMILIA VOLTURI','BOND CARPELA','OS FAIXAPRETA']],['3-91634.jpg',['MAFIA IMPERIAL','RLK NOIS MERMO','OS FORA DA LEI','OS FERRARI','TROPA DO BAR']],['4-91631.jpg',['FML ALBUQUERQUE','VOVO METRALHA','TROPA FANTASMA','MILICIA PRIME','ANJOS DA MORTE']]];
 let exact=0,total=0;
 for(const [file,expected]of samples){await open(page);await page.reload();await expect(page.locator('#ocrFaction option')).toHaveCount(4);await page.locator('#ocrFaction').selectOption(faction);await page.locator('#ocrFiles').setInputFiles(join(process.env.REVO_OCR_EXAMPLES_DIR,file));await page.locator('#processOcr').click();await expect(page.locator('#ocrReview')).toBeVisible({timeout:45000});const names=await page.locator('[data-ocr-name]').evaluateAll((rows)=>rows.map((r)=>r.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()));console.log(file,JSON.stringify(names));expect(names).toHaveLength(5);for(let i=0;i<5;i++){total++;if(names[i]===expected[i])exact++;expect(distance(names[i],expected[i])/Math.max(names[i].length,expected[i].length),`${file}: preserve the complete name, allowing OCR character mistakes for human review`).toBeLessThanOrEqual(.2);}}
 console.log(`Exact OCR names: ${exact}/${total}; all 20 cards kept whole. Character mistakes still require human correction.`);
});
test('historical list can be restored through review without deleting snapshots',async({page})=>{
 const body=(name)=>({sourceFactionId:faction,relationType:'ALLY',importMode:'COMPLETE',inputSource:'MANUAL',entries:[{name,originalText:name,confidence:100,confirmed:true}]});
 const old=await(await page.request.post('/api/diplomacy-submit',{data:body('ALIADO HISTORICO')})).json();await page.request.post('/api/diplomacy-submit',{data:body('ALIADO ATUAL')});
 await open(page,'historico');await page.locator(`[data-restore-snapshot="${old.id}"]`).evaluate((el)=>{el.closest('details').open=true;});
 await Promise.all([page.waitForEvent('dialog').then((d)=>d.accept()),page.locator(`[data-restore-snapshot="${old.id}"]`).click()]);
 await expect(page.locator('[data-ocr-name]')).toHaveValue('ALIADO HISTORICO');await page.locator('#confirmOcr').click();await expect(page).toHaveURL(new RegExp('#fac/'+faction+'$'));await page.reload();await expect(page.locator('#factionDetail')).toContainText('ALIADO HISTORICO');
 const result=await(await page.request.get('/api/diplomacy')).json();expect(result.history.some((s)=>s.id===old.id)).toBe(true);
});
test('server correspondence errors highlight the named block and preserve typed entries',async({page})=>{
 await open(page);await page.locator('#ocrFaction').selectOption(faction);await page.locator('#manualList').click();await page.locator('[data-ocr-name]').last().fill('FAC CORRESPONDENCIA');const index=await page.locator('[data-ocr-name]').count()-1;
 await page.route('**/api/diplomacy-submit',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:`Bloco ${index+1}: FAC CORRESPONDENCIA tem uma correspondência desatualizada.`,issues:[{code:'MATCH_CHANGED',name:'FAC CORRESPONDENCIA',indexes:[index],message:`Bloco ${index+1}: FAC CORRESPONDENCIA tem uma correspondência desatualizada.`}]})}));
 await page.locator('#confirmOcr').click();await expect(page.locator('.toast')).toContainText('FAC CORRESPONDENCIA');await expect(page.locator('#reviewIssues')).toContainText(`Bloco ${index+1}`);await expect(page.locator('.ocr-row[data-error=true]')).toHaveCount(1);await expect(page.locator('[data-ocr-name]').last()).toHaveValue('FAC CORRESPONDENCIA');
});
