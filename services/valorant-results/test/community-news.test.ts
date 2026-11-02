import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMUNITY_NEWS_STORIES,communityNewsPayload,communityNewsSlot,queueCommunityNews} from '../src/community-news.ts';

const jst=(d:string,t:string)=>Date.parse(d+'T'+t+':00+09:00');

test('fictional newspaper only publishes three slots per JST day and avoids false financial claims',()=>{
  assert.ok(COMMUNITY_NEWS_STORIES.length>=50);
  assert.equal(new Set(COMMUNITY_NEWS_STORIES.map(s=>s[1])).size,COMMUNITY_NEWS_STORIES.length);
  assert.equal(communityNewsSlot(jst('2026-11-02','12:06')),null,'not before activation');
  for(const clock of ['12:06','19:06','23:06']){
    const now=jst('2026-11-03',clock);
    const slot=communityNewsSlot(now),a=communityNewsPayload(now),b=communityNewsPayload(now);
    assert.ok(slot);assert.deepEqual(a,b);
    assert.match(a!.body,/全編フィクション/);
    assert.match(a!.body,/株価・馬券・試合結果への影響は一切ない/);
    assert.ok(a!.body.length<2000);
    assert.equal(a!.id,slot!.id);
  }
  for(const clock of ['00:00','12:05','12:12','18:00','20:06','23:12'])assert.equal(communityNewsPayload(jst('2026-11-03',clock)),null);
  const today=['12:06','19:06','23:06'].map(clock=>communityNewsPayload(jst('2026-11-03',clock))!);
  assert.equal(new Set(today.map(s=>s.body)).size,3,'three different stories on the same day');
  assert.equal(communityNewsPayload(jst('2026-11-04','12:06'))?.id!==today[0].id,true);
});

test('scheduled news uses existing deduplicated post queue and does not ping anyone',async()=>{
  const posts=new Map<string,string>();
  const db={prepare(sql:string){
    return {
      bind(...values:unknown[]){return {run:async()=>{
        if(sql.startsWith('INSERT OR IGNORE INTO kp_posts')){
          const id=String(values[0]);
          if(posts.has(id))return {meta:{changes:0}};
          posts.set(id,String(values[1]));return {meta:{changes:1}};
        }
        return {meta:{changes:0}};
      }};},
      run:async()=>({meta:{changes:0}}),
    };
  }};
  const env={DB:db,KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789012345678/test'} as unknown as Parameters<typeof queueCommunityNews>[0];
  assert.equal(await queueCommunityNews(env,jst('2026-11-03','12:00')),false);
  assert.equal(posts.size,0);
  assert.equal(await queueCommunityNews(env,jst('2026-11-03','12:06')),true);
  assert.equal(await queueCommunityNews(env,jst('2026-11-03','12:07')),true);
  assert.equal(posts.size,1);
  const body=JSON.parse([...posts.values()][0]);
  assert.deepEqual(body.allowed_mentions,{parse:[]});
  assert.match(body.content,/町内新聞/);
  assert.equal(await queueCommunityNews(env,jst('2026-11-03','19:06')),true);
  assert.equal(posts.size,2);
  assert.equal(await queueCommunityNews({...env,KP_EARNINGS_WEBHOOK_URL:undefined},jst('2026-11-03','23:06')),false);
  assert.equal(posts.size,2);
});
