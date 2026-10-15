import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { consolidate, currentSnapshots } from '../src/diplomacy.js';
import { validateFiles } from '../src/gallery.js';
import { TesseractOcrProvider } from '../src/ocr-provider.js';
const factions = [{id:'godoy', name:'GODDOY R.K', gang_id:'g', status:'active'}, {id:'rj',name:'FAMÍLIA RJ',gang_id:'r',status:'active'}, {id:'v',name:'VÓRTEX',status:'active'},{id:'off',name:'Inativa',status:'inactive'}];
const snap = (id, source, type, targets, date = '2026-10-15T12:00:00Z', status = 'CONFIRMED') => ({id,source_faction_id:source,relation_type:type,confirmed_at:date,status,entries:targets.map((id) => ({target_gang_id:id,name:id}))});
test('latest confirmed snapshots replace only the same source and relation type', () => {
 const snapshots = [snap('1','godoy','ALLY',['old']),snap('2','godoy','ENEMY',['enemy']),snap('3','godoy','ALLY',['new'],'2026-10-16'),snap('4','godoy','ALLY',['draft'],'2026-10-17','REVIEW')];
 assert.deepEqual(currentSnapshots(snapshots).map((s)=>s.id).sort(),['2','3']);
 let gangs = consolidate({factions,snapshots}); assert.equal(gangs.find((g)=>g.id==='enemy').is_enemy,true); assert.ok(!gangs.find((g)=>g.id==='old'));
 snapshots.push(snap('5','godoy','ENEMY',[],'2026-10-18')); gangs=consolidate({factions,snapshots}); assert.equal(gangs.find((g)=>g.id==='new').is_ally,true); assert.ok(!gangs.find((g)=>g.id==='enemy'));
});
test('divergence and critical alerts retain FAC names, types, dates and snapshot IDs', () => {
 const snapshots=[snap('a','godoy','ALLY',['B','X']),snap('b','rj','ENEMY',['B','X']),snap('c','v','ALLY',['A'])];
 const gangs=consolidate({factions,snapshots,blacklist:[{gang_id:'X',status:'active'}]}); const b=gangs.find((g)=>g.id==='B'), x=gangs.find((g)=>g.id==='X');
 assert.equal(b.divergence,true); assert.equal(b.critical,false); assert.equal(x.critical,true);
 assert.deepEqual(b.ally_of,[{id:'godoy',name:'GODDOY R.K',snapshot_id:'a',date:snapshots[0].confirmed_at,relation_type:'ALLY'}]); assert.equal(b.enemy_of[0].name,'FAMÍLIA RJ');
 assert.equal(gangs.find((g)=>g.id==='A').divergence,false);
});
test('Blacklist missing FACs exclude inactive FACs and self alliance is not expected', () => {
 const gangs=consolidate({factions,catalog:[{id:'X',name:'X'},{id:'g',name:'GODDOY R.K'}],blacklist:[{gang_id:'X',status:'active'}],snapshots:[snap('a','rj','ENEMY',['X']),snap('b','rj','ALLY',['g']),snap('c','v','ALLY',['g'])]});
 const x=gangs.find((g)=>g.id==='X'); assert.deepEqual(x.missing.map((f)=>f.name),['GODDOY R.K','VÓRTEX']); assert.equal(x.coverage,33);
 const own=gangs.find((g)=>g.id==='g'); assert.equal(own.expected,2); assert.equal(own.percentage,100);
});
test('gallery accepts three formats and reports distinct size, quantity and format errors', () => {
 const file=(name,type,size=10)=>({name,type,size,lastModified:1}); const good=[file('a.png','image/png'),file('b.jpeg','image/jpeg'),file('c.webp','image/webp')];
 assert.equal(validateFiles(good).accepted.length,3);
 const result=validateFiles([...good,file('bad.gif','image/gif'),file('large.png','image/png',13*1024*1024),file('empty.png','image/png',0),file('d.png','image/png'),file('e.png','image/png'),file('f.png','image/png')]);
 assert.equal(result.accepted.length,5); for(const message of ['formato inválido','muito grande','corrompido','limite']) assert.ok(result.errors.some((e)=>e.includes(message)));
 assert.equal(validateFiles([good[0]],[]).accepted.length,1);
});
test('Tesseract 6 blocks produce actual names, dropping headings and numbers', () => {
 const provider=new TesseractOcrProvider(); const rows=provider.extract({data:{blocks:[{paragraphs:[{lines:[{text:'ALIADOS',confidence:99},{text:'FAC TESTE',confidence:88},{text:'123',confidence:98}]}]}]}});
 assert.deepEqual(rows,[{name:'FAC TESTE',originalText:'FAC TESTE',confidence:88}]);
});
test('gallery markup is accessible, multiple and never forces capture', async () => {
 const html=await readFile('index.html','utf8'); const input=html.match(/<input[\s\S]*?id="ocrFiles"[\s\S]*?\/>/)[0];
 assert.doesNotMatch(input,/\bcapture\s*=/); assert.match(input,/multiple/); assert.match(input,/accept="image\/png,image\/jpeg,image\/webp"/); assert.match(input,/aria-label/);
});
