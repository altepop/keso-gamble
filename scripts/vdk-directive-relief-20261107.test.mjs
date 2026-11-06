import test from 'node:test';
import assert from 'node:assert/strict';
import {VDK_DISCORD_ID,completeVdkSoloDeathDirective} from './vdk-directive-relief-20261107.mjs';
const fixture=(task='solo_death_unrated',status='active')=>{
  const row={id:'directive-1',guild:'guild-1',target:VDK_DISCORD_ID,task,status};
  let updates=0;
  const query=async(sql,args)=>{
    if(sql.startsWith("SELECT id,guild"))return {rows:row.status==='active'?[{...row}]:[]};
    if(sql.startsWith("SELECT task,status"))return {rows:[{task:row.task,status:row.status}]};
    if(sql.startsWith("UPDATE kp_directives")){updates++;assert.deepEqual(args,[row.id,row.guild,VDK_DISCORD_ID,'solo_death_unrated']);row.status='completed';return {meta:{changes:1}};}
    if(sql.startsWith("SELECT status,task"))return {rows:[{status:row.status,task:row.task,target:row.target}]};
    throw Error('Unexpected SQL');
  };
  return {query,row,get updates(){return updates}};
};
test('completes only active VDK solo-death-unrated, and a repeat is harmless',async()=>{
  const f=fixture();assert.equal(await completeVdkSoloDeathDirective(f.query),'completed');
  assert.equal(f.row.status,'completed');assert.equal(await completeVdkSoloDeathDirective(f.query),'already_completed');assert.equal(f.updates,1);
});
test('never completes a different active task',async()=>{
 const f=fixture('solo_competitive');await assert.rejects(completeVdkSoloDeathDirective(f.query),/differs/);assert.equal(f.updates,0);
});
test('never rewrites cancelled or absent task',async()=>{
 const f=fixture('solo_death_unrated','cancelled');await assert.rejects(completeVdkSoloDeathDirective(f.query),/No matching/);assert.equal(f.updates,0);
});
test('refuses ambiguous concurrent active directives',async()=>{
 const f=fixture();await assert.rejects(completeVdkSoloDeathDirective(async()=>({rows:[{...f.row},{...f.row,id:'another'}]})),/Ambiguous/);
});
test('refuses lost update races',async()=>{
 const f=fixture();await assert.rejects(completeVdkSoloDeathDirective((sql,args)=>sql.startsWith('UPDATE')?Promise.resolve({meta:{changes:0}}):f.query(sql,args)),/conditional completion/);
});
