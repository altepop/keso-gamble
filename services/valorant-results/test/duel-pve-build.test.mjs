import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readPveBuild,savePveBuild} from '../src/duel-pve-build.ts';

test('only owned PvE relics can equip a persisted style, scoped to the authenticated player',async()=>{
 const db=new DatabaseSync(':memory:');
 const env={DB:{prepare(sql){
   const statement=db.prepare(sql);
   const execute=args=>({
    first:async()=>statement.get(...args)??null,
    run:async()=>statement.run(...args),
    all:async()=>({results:statement.all(...args)}),
   });
   return {...execute([]),bind:(...args)=>execute(args)};
 }}};
 try {
  await assert.rejects(savePveBuild(env,'guild','alice',{game:'poker',style:'attack'}),/PvE攻略遺物/);
  db.exec("INSERT INTO kp_duel_reward_collection VALUES ('guild','alice','pvp','poker'),('guild','alice','pve','othello')");
  await assert.rejects(savePveBuild(env,'guild','alice',{game:'poker',style:'attack'}),/PvE攻略遺物/);
  await assert.rejects(savePveBuild(env,'guild','bob',{game:'othello',style:'attack'}),/PvE攻略遺物/);
  await assert.rejects(savePveBuild(env,'other','alice',{game:'othello',style:'attack'}),/PvE攻略遺物/);
  await assert.rejects(savePveBuild(env,'guild','alice',{game:'othello',style:'reveal'}),/攻略ビルド/);
  for(const style of ['attack','attack','defense']){
   await savePveBuild(env,'guild','alice',{game:'othello',style});
   assert.deepEqual((await readPveBuild(env,'guild','alice')).map(row=>({...row})),[{game:'othello',style}]);
  }
  await savePveBuild(env,'guild','alice',{game:'othello',style:null});
  assert.deepEqual(await readPveBuild(env,'guild','alice'),[]);
 }finally{db.close();}
});
