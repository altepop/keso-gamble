import test from 'node:test';
import assert from 'node:assert/strict';
import {queueVdkLossPress,vdkLossPressPayload,VDK_LOSS_PRESS_ID,VDK_LOSS_PRESS_START,VDK_LOSS_PRESS_END} from '../src/vdk-bankruptcy-loss-press.ts';
import type {PostEnv} from '../src/racing-posts.ts';

test('verified VDK holdings announcement stays short, guarded and explicitly attributed',()=>{
 const {username,content,allowed_mentions}=vdkLossPressPayload();
 assert.equal(username,'等しいbot');
 assert.ok(content.length<1900);
 assert.match(content,/石原/);
 assert.match(content,/25株/);
 assert.match(content,/1,815KP/);
 assert.match(content,/1,790KP/);
 assert.match(content,/過去に損切りした人/);
 assert.deepEqual(allowed_mentions,{parse:[]});
 assert.ok(!content.includes('@everyone'));
});

test('one-off earnings queue registers once only inside date window',async()=>{
 const posts=new Map<string,string>();
 const db={prepare(sql:string){return {
  run:async()=>({meta:{changes:0}}),
  bind(...args:unknown[]){return {run:async()=>{
   if(sql.startsWith('INSERT OR IGNORE INTO kp_posts')){
    const id=String(args[0]);
    if(posts.has(id))return {meta:{changes:0}};
    posts.set(id,String(args[1]));return {meta:{changes:1}};
   }
   return {meta:{changes:0}};
  }};}
 };}};
 const env={DB:db,KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789012345678/test-token'} as unknown as PostEnv;
 const start=VDK_LOSS_PRESS_START;
 assert.equal(await queueVdkLossPress(env,start-1),false);
 assert.equal(await queueVdkLossPress({DB:db} as unknown as PostEnv,start),false);
 assert.equal(await queueVdkLossPress(env,start),true);
 assert.equal(await queueVdkLossPress(env,start+60000),false);
 assert.equal(posts.size,1);
 assert.deepEqual(JSON.parse(posts.get(VDK_LOSS_PRESS_ID)!).allowed_mentions,{parse:[]});
 assert.equal(await queueVdkLossPress(env,VDK_LOSS_PRESS_END),false);
 assert.ok(VDK_LOSS_PRESS_END>VDK_LOSS_PRESS_START);
});
