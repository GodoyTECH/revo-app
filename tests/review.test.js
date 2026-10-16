import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGang, reviewNotices } from '../src/review.js';
import { TesseractOcrProvider } from '../src/ocr-provider.js';
import { listRegions } from '../src/ocr-layout.js';
test('canonical and alias resolution is deterministic even with an overlapping alias',()=>{
 const catalog=[{id:'alias',name:'OUTRA',aliases:['FAC X']},{id:'canonical',name:'FAC X',aliases:[]}];
 assert.equal(resolveGang('Fac X',catalog).id,'canonical');assert.equal(resolveGang('OUTRA',catalog).id,'alias');
});
test('review identifies duplicate block numbers, existing names and Blacklist without rejecting entries',()=>{
 const catalog=[{id:'b',name:'FML BLOODS',aliases:['BLOODS']}];
 const notices=reviewNotices([{name:'FML BLOODS'},{name:'BLOODS'}],{catalog,blacklist:[{gang_id:'b',status:'active'}],current:[{target_gang_id:'b'}],relationType:'ENEMY'});
 assert.deepEqual(notices.find((n)=>n.code==='DUPLICATE').indexes,[0,1]);assert.match(notices[0].message,/FML BLOODS.*1, 2/);
 assert.ok(notices.some((n)=>n.code==='EXISTING'));assert.ok(notices.some((n)=>n.code==='BLACKLIST'&&n.message.includes('Não precisa cadastrar novamente')));
});
test('card OCR keeps a wrapped name including a numeric suffix as one entity',()=>{
 const provider=new TesseractOcrProvider();const result={data:{blocks:[{paragraphs:[{lines:[{text:'TREM DO ODIO',confidence:94},{text:'00',confidence:90}]}]}]}};
 assert.deepEqual(provider.extract(result,true),[{name:'TREM DO ODIO 00',originalText:'TREM DO ODIO 00',confidence:92}]);
});
test('horizontal separators define whole cards; plain lists are never sliced by height',()=>{
 const width=90,height=100,data=new Uint8ClampedArray(width*height*4).fill(180);
 for(const y of [30,31,62,63]) for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 const regions=listRegions({data,width,height});assert.equal(regions.length,3);assert.deepEqual(regions.map((r)=>r.height),[30,30,36]);assert.ok(regions.every((r)=>r.card));
 const plain=listRegions({data:new Uint8ClampedArray(width*height*4).fill(255),width,height});assert.deepEqual(plain,[{top:0,height,left:0,width,card:false}]);
});
