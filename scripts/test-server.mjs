// Disposable PostgreSQL and assets for browser tests. Never connects to Neon.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { submitDiplomacy, readData } from '../netlify/functions/api.mjs';
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(await readFile('database/neon-complete-setup.sql','utf8'));
const sql = { query: (text, params=[]) => ({ text, params, then(resolve, reject) { return db.query(text,params).then((r)=>r.rows).then(resolve,reject); } }), transaction: (queries) => db.transaction(async(tx) => { const results=[]; for(const q of queries) results.push((await tx.query(q.text,q.params)).rows); return results; }) };
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
for (const [i,name] of ['GODDOY R.K','FAMÍLIA RJ','VÓRTEX'].entries()) {
 const gang=await db.query('INSERT INTO gangs(canonical_name,normalized_name) VALUES($1,$1) RETURNING id',[name]);
 await db.query('INSERT INTO organization_factions(id,gang_id,name,normalized_name) VALUES($1,$2,$3,$3)',[ids[i],gang.rows[0].id,name]);
}
for (const [source,type,names] of [[ids[0],'ALLY',['FAC B','AFRICA DO SUL']],[ids[1],'ENEMY',['FAC B','AFRICA DO SUL']],[ids[0],'ENEMY',['FAC X']]]) {
 await submitDiplomacy(sql,{sourceFactionId:source,relationType:type,importMode:'COMPLETE',inputSource:'MANUAL',images:[],entries:names.map((name)=>({name,originalText:name,confidence:100,confirmed:true,imageIndexes:[]}))},'browser-test');
}
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.gz':'application/octet-stream'};
createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,'http://local'), pathname=decodeURIComponent(url.pathname);
 if(pathname.startsWith('/api/')) {
   const route=pathname.slice(5);let result;
   if(req.method==='GET') result={statusCode:200,body:JSON.stringify(await readData(sql,route))};
   else if(route==='diplomacy-submit') { let body='';for await(const chunk of req)body+=chunk;result=await submitDiplomacy(sql,JSON.parse(body),'browser-test'); }
   else result={statusCode:401,body:JSON.stringify({error:'Credencial inválida.'})};
   res.writeHead(result.statusCode,{'content-type':'application/json','cache-control':'no-store'});res.end(result.body);return;
 }
 let root=resolve('dist'), file=resolve(root,'.'+pathname);
 if(file!==root && !file.startsWith(root+'/')) {res.writeHead(403);res.end();return;}
 if(pathname==='/')file=resolve(root,'index.html');
 let body;try{body=await readFile(file);}catch{body=await readFile(resolve(root,'index.html'));file='index.html';}
 res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(body);
 }catch(error){console.error(error);res.writeHead(500);res.end('Test server failure');}
}).listen(4174,'127.0.0.1',()=>console.log('Isolated test database ready on 4174'));
