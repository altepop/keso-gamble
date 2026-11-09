import test from 'node:test';
import assert from 'node:assert/strict';
import {relicPressBody,queueRelicPress,RELIC_PRESS_ID,RELIC_PRESS_END,RELIC_PRESS_START} from '../src/relic-press.ts';
import {NORMAL_RELIC_BY_ID} from '../src/relic-catalog.ts';
import {evaluateRelicBonus,type RelicCollection} from '../src/relics.ts';
import type {PostEnv} from '../src/racing-posts.ts';

test('Discord relic press is readable and under the single-message limit',()=>{
 const post=relicPressBody();
 assert.ok(post.length<1900,'too long: '+post.length);
 for(const phrase of ['900%','307 KP → 3,070 KP','1回200 KP','通常148種類',
  '1/4,096','1/40,000','5,000 KP','毎朝9時','翌日も遺物の対象外',
  '検証済みの確定報酬','KESO PLAY'])assert.ok(post.includes(phrase),phrase);
 assert.equal(post.includes('@everyone'),false);
 assert.equal(post.includes('@here'),false);
 assert.equal(post.includes('<@'),false);
});
test('the advertised 307→3070 calculation is the actual single frenzy relic effect',()=>{
 const def=NORMAL_RELIC_BY_ID.get('normal.pact.frenzy')!;
 assert.equal(def.percent,900);
 const c:RelicCollection={totalSummons:0,items:{[def.id]:{...def,origin:'normal',count:1}},equipped:[def.id]};
 const event=evaluateRelicBonus(c,'competitive',{amount:307,win:true});
 assert.equal(event.bonus,2763);
 assert.equal(307+event.bonus,3070);
});
test('the press is queued just once per isolate using the existing earnings channel; no webhook=no post',async()=>{
 const sql:string[]=[];
 const db={
  prepare:(q:string)=>({bind:(...args:unknown[])=>({
   run:async()=>{sql.push(q+' '+args.map(String).join(','));return {meta:{changes:1}}}
  }),run:async()=>{sql.push(q);return {meta:{changes:1}}}})
 };
 const env={DB:db,KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/123/example'} as unknown as PostEnv;
 const now=Date.parse('2026-11-03T13:00:00+09:00');
 assert.equal(await queueRelicPress(env,now),true);
 assert.equal(sql.filter(x=>x.includes('INSERT OR IGNORE INTO kp_posts')).length,1);
 assert.ok(sql.some(x=>x.includes(RELIC_PRESS_ID)));
 assert.equal(await queueRelicPress(env,now+60_000),false);
 assert.equal(sql.filter(x=>x.includes('INSERT OR IGNORE INTO kp_posts')).length,1);
 assert.equal(await queueRelicPress(env,RELIC_PRESS_END),false);
 assert.equal(await queueRelicPress({DB:db} as unknown as PostEnv,now),false);
 assert.ok(RELIC_PRESS_END>RELIC_PRESS_START);
});
