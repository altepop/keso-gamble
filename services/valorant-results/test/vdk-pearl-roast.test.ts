import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VDK_PEARL_MATCH,VDK_PEARL_RIOT,VDK_PEARL_RECEIPT,vdkPearlPayload,findVdkPearlAccount,isVerifiedVdkPearlNotice,queueVdkPearlRoast} from '../src/vdk-pearl-roast.ts';

const MATCH_WIN = {outcome:'win',mode:'spikerush',message:'🎉 VDKは4対1で勝ち！！（スパイクラッシュ）\n🗺️ Pearl｜Chamber\n🔫 7K / 1D / 0A｜ACS 367'};
const USER='123456789012345678';
const mapping={guildId:'987654321098765432',accounts:[{riotId:'Dolly#SDGs',discordUserId:USER}]};

test('roast corrects VDK to winning Dolly and safely mentions only one user',()=>{
  assert.equal(VDK_PEARL_MATCH,'db6a45fe-7699-4fb3-b4b8-0d7499b26412');
  assert.equal(VDK_PEARL_RIOT,'dolly#sdgs');
  assert.match(VDK_PEARL_RECEIPT,/^oneoff:vdk-pearl-chamber:/);
  const payload=vdkPearlPayload(USER);
  assert.equal(payload.username,'等しいbot');
  assert.deepEqual(payload.allowed_mentions,{parse:[],users:[USER]});
  assert.ok(payload.content.includes('<@'+USER+'>'));
  assert.match(payload.content,/7キル \/ 1デス/);
  assert.match(payload.content,/ACS 367/);
  assert.match(payload.content,/4–1 勝利/);
  assert.match(payload.content,/0デス.*失敗/);
  assert.doesNotMatch(payload.content,/ACS 86|1キル \/ 5デス|1–4の敗北/);
  assert.ok(payload.content.length<=2000,'Discord message must fit in one post');
  assert.throws(()=>vdkPearlPayload('@everyone'));
});

test('only a 4-1 winning Pearl Chamber 7K 1D Spike Rush result permits post',()=>{
  assert.equal(isVerifiedVdkPearlNotice(MATCH_WIN),true);
  for(const notice of [
    {...MATCH_WIN,mode:'competitive'},
    {...MATCH_WIN,outcome:'loss'},
    {...MATCH_WIN,message:MATCH_WIN.message.replace('Pearl','Haven')},
    {...MATCH_WIN,message:MATCH_WIN.message.replace('Chamber','Jett')},
    {...MATCH_WIN,message:MATCH_WIN.message.replace('4対1','1対4')},
    {...MATCH_WIN,message:MATCH_WIN.message.replace('7K / 1D','1K / 5D')},
  ])assert.equal(isVerifiedVdkPearlNotice(notice),false);
  assert.equal(isVerifiedVdkPearlNotice(null),false);
});

test('Dolly#SDGs is the sole mention target, never the losing Chamber or nickname',()=>{
  assert.equal(findVdkPearlAccount({...mapping,accounts:[]}),null);
  assert.deepEqual(findVdkPearlAccount(mapping),mapping.accounts[0]);
  assert.equal(findVdkPearlAccount({...mapping,accounts:[{riotId:'fur1an#1204',discordUserId:USER}]}),null);
  assert.equal(findVdkPearlAccount({...mapping,accounts:[{riotId:'VDK#JP1',discordUserId:USER}]}),null);
  assert.equal(findVdkPearlAccount({...mapping,accounts:[mapping.accounts[0],{riotId:'dolly#sdgs',discordUserId:'123456789012345679'}]}),null);
});

test('verified notice queues once, mistaken loss never queues, and event expires',async()=>{
  function fakeDB(notice:typeof MATCH_WIN|null){
    const posts=new Map<string,string>();
    const statements:string[]=[];
    const db={prepare(sql:string){
      statements.push(sql);
      return {
        bind(...params:unknown[]){
          return {
            first:async()=>{
              if(sql.startsWith('SELECT 1 FROM kp_posts'))return posts.has(String(params[0]))?{exists:1}:null;
              if(sql.startsWith('SELECT outcome,mode,message FROM notifications')) {
                assert.equal(params[0],VDK_PEARL_MATCH);
                assert.equal(params[1],'Dolly#SDGs');
                return notice;
              }
              return null;
            },
            run:async()=>{
              if(sql.startsWith('INSERT OR IGNORE INTO kp_posts')){
                const key=String(params[0]);
                if(posts.has(key))return {meta:{changes:0}};
                posts.set(key,String(params[1]));
                return {meta:{changes:1}};
              }
              return {meta:{changes:0}};
            },
          };
        },
        run:async()=>({meta:{changes:0}}),
      };
    }};
    return {db,posts,statements};
  }
  const envBase={KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789012345678/test-token'};
  const now=Date.parse('2026-11-02T12:35:00+09:00');
  const okay=fakeDB(MATCH_WIN);
  const env={...envBase,DB:okay.db} as unknown as Parameters<typeof queueVdkPearlRoast>[0];
  assert.equal(await queueVdkPearlRoast(env,mapping,now),true);
  assert.equal(await queueVdkPearlRoast(env,mapping,now+60000),false);
  assert.equal(okay.posts.size,1);
  const posted=JSON.parse(okay.posts.get(VDK_PEARL_RECEIPT)!);
  assert.deepEqual(posted.allowed_mentions.users,[USER]);
  const wrong=fakeDB({...MATCH_WIN,outcome:'loss'});
  assert.equal(await queueVdkPearlRoast({...envBase,DB:wrong.db} as unknown as Parameters<typeof queueVdkPearlRoast>[0],mapping,now),false);
  assert.equal(wrong.posts.size,0);
  const expired=fakeDB(MATCH_WIN);
  assert.equal(await queueVdkPearlRoast({...envBase,DB:expired.db} as unknown as Parameters<typeof queueVdkPearlRoast>[0],mapping,Date.parse('2026-11-03T00:00:00+09:00')),false);
  assert.equal(expired.statements.length,0);
});
