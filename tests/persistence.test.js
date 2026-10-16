import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { applyMigrations } from '../scripts/lib/migrations.mjs';
import { submitDiplomacy, readData } from '../netlify/functions/api.mjs';
const adapter=(db)=>({query:(text,params=[])=>({text,params,then(resolve,reject){return db.query(text,params).then((r)=>r.rows).then(resolve,reject);}}),transaction:(queries)=>db.transaction(async(tx)=>{const results=[];for(const q of queries)results.push((await tx.query(q.text,q.params)).rows);return results;})});
test('automatic migrations preserve allies/enemies after database restart and repeated deployment',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'revo-persistence-'));let db;
 try{
  db=new PGlite(join(directory,'db'),{extensions:{pgcrypto}});let sql=adapter(db);await applyMigrations(sql);
  const faction='11111111-1111-4111-8111-111111111111';
  await db.query("INSERT INTO organization_factions(id,name,normalized_name) VALUES($1,'FAC PERSISTENTE','FAC PERSISTENTE')",[faction]);
  const ids=[];for(const type of ['ALLY','ENEMY']){const result=await submitDiplomacy(sql,{sourceFactionId:faction,relationType:type,importMode:'COMPLETE',inputSource:'MANUAL',entries:[{name:'NOME '+type,originalText:'NOME '+type,confidence:100,confirmed:true}]},'test');assert.equal(result.statusCode,201);ids.push(JSON.parse(result.body).id);}
  await db.query("UPDATE external_relations SET status='inactive' WHERE normalized_name='FML BLOODS'");
  await db.close();db=new PGlite(join(directory,'db'),{extensions:{pgcrypto}});sql=adapter(db);
  await applyMigrations(sql);await applyMigrations(sql);
  const result=await readData(sql,'diplomacy');assert.deepEqual(result.history.map((s)=>s.id).sort(),ids.sort());
  assert.equal(result.gangs.find((g)=>g.name==='NOME ALLY').is_ally,true);assert.equal(result.gangs.find((g)=>g.name==='NOME ENEMY').is_enemy,true);
  assert.equal((await db.query("SELECT status FROM external_relations WHERE normalized_name='FML BLOODS'")).rows[0].status,'inactive');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,3);
  const stale={sourceFactionId:faction,relationType:'ALLY',importMode:'COMPLETE',inputSource:'MANUAL',entries:[{name:'NOME ALLY',originalText:'NOME ALLY',confidence:100,confirmed:true,gangId:'22222222-2222-4222-8222-222222222222'}]};
  const error=await submitDiplomacy(sql,stale,'test');assert.equal(error.statusCode,409);const body=JSON.parse(error.body);assert.equal(body.issues[0].name,'NOME ALLY');assert.deepEqual(body.issues[0].indexes,[0]);assert.match(body.error,/Bloco 1: NOME ALLY/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM diplomacy_snapshots')).rows[0].n,2);
 }finally{await db?.close();await rm(directory,{recursive:true,force:true});}
});
