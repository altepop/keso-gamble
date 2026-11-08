import test from 'node:test';
import {URL as NodeURL} from 'node:url';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {mahjongRank,mahjongRoast,mahjongScoreLine,mahjongMessage,parseMahjongRecords,validateMahjongConfig,monitorMahjong,flushMahjongPosts,pacing,PROVIDER_GAP} from '../src/mahjong.ts';
// Provider spacing is recorded instead of slept.
const waits:number[]=[];pacing.wait=async(ms:number)=>{waits.push(ms);};
import type {MahjongConfig,MahjongEnv,MahjongRecord} from '../src/mahjong.ts';
const pools=JSON.parse(readFileSync(new NodeURL('../mahjong-taunts.json',import.meta.url),'utf8')) as Record<string,string[][]>;
const now=Date.parse('2026-10-27T15:00:00Z');
const config:MahjongConfig={enabled:true,startedAt:now-3600_000,players:[{id:10,name:'fixture'}],modes:[11,12,23,24]};
function record(overrides:Partial<MahjongRecord>={}):MahjongRecord{return {_id:'fixture-record',modeId:12,startTime:now/1000-1800,endTime:now/1000-100,players:[{accountId:10,nickname:'A',score:40000},{accountId:20,nickname:'B',score:30000},{accountId:30,nickname:'C',score:20000},{accountId:40,nickname:'D',score:10000}],...overrides};}
function fixture(){
 const sql=new DatabaseSync(':memory:');
 class Query {
  text:string;values:unknown[];
  constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}
  bind(...values:unknown[]){return new Query(this.text,values);}
  first(){return sql.prepare(this.text).get(...this.values as never[])??null;}
  all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}
  run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}
 }
 const env:MahjongEnv={DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/token',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const result=queries.map(q=>q.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database};
 return {sql,env};
}
function fakeFetch(records:MahjongRecord[]=[record()]){
 const urls:string[]=[],sent:Array<{content:string;allowed_mentions:unknown}>=[];
 const dispatches:Array<{url:string;init?:RequestInit}>=[];let dispatchStatus=204;
 const request=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));urls.push(String(url));
  if(url.hostname==='discord.com'){sent.push(JSON.parse(String(init?.body)));return Response.json({id:'100000000000000001'});}
  if(url.hostname==='api.github.com'){dispatches.push({url:String(url),init});return new Response(null,{status:dispatchStatus});}
  assert.equal(url.hostname,'5-data.amae-koromo.com');
  assert.ok(Number(url.pathname.split('/').at(-2))>=Number(url.pathname.split('/').at(-1)));
  return Response.json(url.pathname.includes('/pl3/')?[]:records);
 }) as typeof fetch;
 return {request,urls,sent,dispatches,failDispatch:(status:number)=>{dispatchStatus=status;}};
}
const state=(sql:DatabaseSync,key:string)=>sql.prepare('SELECT value FROM mahjong_watch_state WHERE key=?').get(key)?.value;

test('unsent mahjong posts use a lease-first index to skip delayed posts without changing ready FIFO',async()=>{
 const f=fixture();
 assert.equal(await flushMahjongPosts(f.env,now),0);
 const insert=f.sql.prepare('INSERT INTO mahjong_watch_posts(id,body,at,sent,lease) VALUES(?,?,?,?,?)');
 for(let i=0;i<500;i++)insert.run('delivered:'+i,'{}',i,1,0);
 insert.run('eligible:a','{}',1000,0,0);
 insert.run('eligible:b','{}',1000,0,now-1);
 insert.run('locked','{}',800,0,now+120000);
 const query='SELECT id,body FROM mahjong_watch_posts WHERE sent=0 AND lease<=? ORDER BY lease,at,id LIMIT 4';
 const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+query).all(now).map(x=>String(x.detail)).join(' | ');
 assert.match(plan,/mahjong_watch_due/);
 assert.doesNotMatch(plan,/USE TEMP B-TREE/);
 assert.deepEqual((f.sql.prepare(query).all(now) as Array<{id:string}>).map(x=>x.id),['eligible:a','eligible:b']);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM mahjong_watch_posts').get()!.n,503);
 // A large delayed backlog should be ignored without reading or sorting it.
 for(let i=0;i<500;i++)insert.run('retry:'+i,'{}',i+1,0,now+60000);
 assert.match(f.sql.prepare('EXPLAIN QUERY PLAN '+query).all(now).map(x=>String(x.detail)).join(' | '),/SEARCH mahjong_watch_posts USING INDEX mahjong_watch_due/);
 assert.deepEqual((f.sql.prepare(query).all(now) as Array<{id:string}>).map(x=>x.id),['eligible:a','eligible:b']);
});

test('rank uses final scores and seat order for ties; three-player second is not last',()=>{
 assert.equal(mahjongRank(record(),10),1);assert.equal(mahjongRank(record(),40),4);
 const tied=record();tied.players[0].score=30000;assert.equal(mahjongRank(tied,10),1);assert.equal(mahjongRank(tied,20),2);
 const sanma=record({modeId:24,players:record().players.slice(0,3)});
 assert.match(mahjongRoast(sanma,20),/トップまで[0-9,]+点/);
 assert.match(mahjongRoast(sanma,30),/ひとつ上まで[0-9,]+点/);
 const four=new Set<string>(),three=new Set<string>();
 for(let i=0;i<4000;i++){four.add(mahjongRoast(record({_id:'v-'+i}),10));three.add(mahjongRoast(record({_id:'v-'+i,modeId:24,players:record().players.slice(0,3)}),10));}
 assert.equal(four.size,pools.first.length,'every four-player top line appears');assert.equal(three.size,[...pools.first,...pools.first3].filter(lines=>!lines.some(line=>/他の3人|4人おって/.test(line))).length,'three-player tops add their own without four-player-only sets');
 assert.ok([...three].every(line=>!/他の3人|4人おって/.test(line)));
 assert.ok([...four].every(t=>!pools.first3.some(l=>l.join('\n')===t)),'three-player lines stay out of four-player games');
});
test('every authored roast is three unique nonempty lines (four for third, five for last and bust); no fabricated deal-in or yakuman claim',()=>{
 assert.ok(Object.values(pools).flat().length>=124);
 for(const [group,list] of Object.entries(pools))for(const lines of list){const base=group.replace(/3$/,''),n=base==='last'||base==='bust'?5:base==='third'?4:3;assert.equal(lines.length,n);assert.equal(new Set(lines).size,n);assert.ok(lines.every(line=>line.length>5&&!line.includes('\n')));assert.doesNotMatch(lines.join(''),/放銃した|役満あが|振り込んだ/);}
 for(let i=0;i<100;i++){assert.equal(mahjongRoast(record({_id:'test-'+i}),10).split('\n').length,3);assert.equal(mahjongRoast(record({_id:'test-'+i}),40).split('\n').length,5);}
 const negative=record();negative.players[0].score=-1000;assert.match(mahjongRoast(negative,10),/最終1,000点のマイナス/);
});

test('two real new sanma games by one user never reuse identical three-line roast even when original hash collides',async()=>{
 const f=fixture();
 const three=(id:string,score:number,start:number,end:number):MahjongRecord=>record({
  _id:id,modeId:24,startTime:start,endTime:end,
  players:[{accountId:10,nickname:'Fhmrm',score},{accountId:20,nickname:'B',score:30000},{accountId:30,nickname:'C',score:15000}],
 });
 // Find the collision demonstrated by the screenshot without assuming one
 // particular provider match ID or weakening the randomized template pool.
 const first=three('example-0',50000,now/1000-1700,now/1000-1100);
 let second:MahjongRecord|undefined;
 for(let n=1;n<2000;n++){
  const candidate=three('example-'+n,50000,now/1000-850,now/1000-250);
  if(mahjongRoast(candidate,10)===mahjongRoast(first,10)){second=candidate;break;}
 }
 assert.ok(second,'fixture must reproduce an actual rank-one hash collision');
 assert.equal(mahjongRoast(first,10),mahjongRoast(second,10));
 assert.notEqual(mahjongRoast(second,10,mahjongRoast(first,10)),mahjongRoast(first,10));
 assert.equal(mahjongRoast(second,10,mahjongRoast(first,10)),mahjongRoast(second,10,mahjongRoast(first,10)),'alternative remains deterministic');
 const messages:Array<{content:string;allowed_mentions:unknown}>=[];
 const request=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.includes('discord.com')){
   messages.push(JSON.parse(String(init?.body)));
   return Response.json({id:String(100000000000000001n+BigInt(messages.length))});
  }
  if(url.includes('api.github.com'))return new Response(null,{status:204});
  return Response.json(url.includes('/pl3/')?[first,second]:[]);
 }) as typeof fetch;
 await monitorMahjong(f.env,now,config,request);
 assert.equal(messages.length,2);
 const firstRoast=messages[0]!.content.split('\n').slice(2,5).join('\n');
 const secondRoast=messages[1]!.content.split('\n').slice(2,5).join('\n');
 assert.notEqual(firstRoast,secondRoast);
 assert.deepEqual(messages.map(m=>m.allowed_mentions),[{parse:[]},{parse:[]}]);
 assert.match(messages[0]!.content,/50,000点/);
 assert.match(messages[1]!.content,/50,000点/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM mahjong_watch_posts').get()!.n,2);
 assert.equal((f.sql.prepare("SELECT value FROM mahjong_watch_state WHERE key='mahjong_last_roast:10'").get() as {value:string}).value,secondRoast);
 // Re-reading the same provider history cannot duplicate notifications or
 // overwrite the previous roast, and requires no extra per-game history I/O.
 await monitorMahjong(f.env,now+5*60_000,config,request);
 assert.equal(messages.length,2);
 assert.equal((f.sql.prepare("SELECT value FROM mahjong_watch_state WHERE key='mahjong_last_roast:10'").get() as {value:string}).value,secondRoast);
 f.sql.close();
});


test('score-based banter uses verified final points and keeps original line counts',()=>{
 const three=(score:number,second:number,third:number):MahjongRecord=>record({
  modeId:24,players:[{accountId:10,nickname:'A',score},{accountId:20,nickname:'B',score:second},{accountId:30,nickname:'C',score:third}]
 });
 assert.match(mahjongScoreLine(three(55800,30000,14200),10),/2着に25,800点差/);
 assert.match(mahjongScoreLine(three(50000,30000,20000),10),/2着に20,000点差/);
 assert.match(mahjongScoreLine(three(31000,30000,29000),10),/2着と1,000点差/);
 assert.match(mahjongScoreLine(three(30000,30000,10000),10),/2着と同点/);
 assert.match(mahjongScoreLine(three(30000,30000,10000),20),/トップと同点/);
 assert.match(mahjongScoreLine(three(20000,30000,15000),10),/トップまで10,000点/);
 assert.match(mahjongScoreLine(three(5000,30000,20000),10),/ひとつ上まで15,000点/);
 assert.match(mahjongScoreLine(three(-2300,30000,20000),10),/最終2,300点のマイナス/);
 const same=record({_id:'same',modeId:24,players:three(55800,30000,14200).players});
 assert.notEqual(mahjongRoast(same,10),mahjongRoast(record({...same,players:three(50000,30000,20000).players}),10));
 assert.equal(mahjongRoast(same,10).split('\n').length,3);
 const msg=mahjongMessage(same,10,'A');
 assert.match(msg,/2着に25,800点差/);
 assert.equal(msg.split('\n').length,6);
});
test('result-only texts cannot claim an unobserved riichi, win, discard or kita',()=>{
 const pattern=new RegExp("(放銃|ツモ|リーチ|北を抜|北抜きドラ|北抜きまで|北抜きのドラ|跳満|倍満|役満|当たり牌|和了|アガリ|手牌|捨て牌|打牌|河に|牌効率|押し引き|配牌|鳴き|門前|上がれず|見せ場だけ|守りに入|守備から|攻めを覚|牌の切り方|今日の打ち筋|他家に|そぶりすら|卓から叩き出|泣きながら拍手|読みが当た|上がってた|北を抜|先に打牌|下家から|ツモ切り)");
 for(const [group,entries] of Object.entries(pools))for(const lines of entries){
  assert.ok(lines.length>=3,group);
  assert.doesNotMatch(lines.join('\n'),pattern,group);
 }
});

test('message shows actual rank, points, mode, Japan time and source; names cannot inject formatting or mentions',()=>{
 const text=mahjongMessage(record(),10,'@everyone\n**fixture**');
 assert.match(text,/fixture｜1着／4人/);assert.match(text,/40,000点/);assert.match(text,/四麻・玉の間 半荘/);assert.match(text,/player\/10\/12/);assert.doesNotMatch(text,/@everyone|\n\*\*fixture/);
 assert.equal(text.split('\n').length,6);
});
test('parser rejects absent subject, incomplete/future/bad shape, duplicated players; excludes old and unselected modes',()=>{
 assert.equal(parseMahjongRecords([record()],10,[12],config.startedAt,now).length,1);
 assert.deepEqual(parseMahjongRecords([record()],10,[11],config.startedAt,now),[]);
 assert.deepEqual(parseMahjongRecords([record({startTime:now/1000-4000})],10,[12],config.startedAt,now),[]);
 for(const r of [record({endTime:now/1000+1000}),record({players:record().players.slice(0,2)}),record({endTime:0}),record({_id:'bad/id'})])assert.throws(()=>parseMahjongRecords([r],10,[12],config.startedAt,now));
 assert.throws(()=>parseMahjongRecords([record()],99,[12],config.startedAt,now));
 const duplicate=record();duplicate.players[1].accountId=10;assert.throws(()=>parseMahjongRecords([duplicate],10,[12],config.startedAt,now));
 assert.throws(()=>parseMahjongRecords({maintenance:true},10,[12],config.startedAt,now));
});
test('config only permits supported Jade modes and numeric unique provider IDs',()=>{
 assert.equal(validateMahjongConfig(config),config);
 for(const c of [{...config,modes:[99]},{...config,players:[...config.players,...config.players]},{...config,startedAt:0}])assert.throws(()=>validateMahjongConfig(c));
});
test('monitor sends only new records, deduplicates replay/renamed subject and persists three lines without pings',async()=>{
 const f=fixture(),web=fakeFetch([record(),record({startTime:now/1000-4000,_id:'old'})]);
 await monitorMahjong(f.env,now,config,web.request);
 assert.equal(web.sent.length,1);assert.deepEqual(web.sent[0].allowed_mentions,{parse:[]});assert.equal(web.sent[0].content.split('\n').length,6);
 assert.equal(state(f.sql,'last_success_at'),String(now));
 await monitorMahjong(f.env,now+30_000,config,web.request);assert.equal(web.urls.filter(u=>u.includes('player_records')).length,2,'one-minute poll gap');
 await monitorMahjong(f.env,now+5*60_000,{...config,players:[{id:10,name:'renamed'}]},web.request);assert.equal(web.sent.length,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mahjong_watch_posts').get()!.n,1);
});
test('late-arriving matches are found despite newer match already being observed',async()=>{
 const f=fixture(),a=fakeFetch();await monitorMahjong(f.env,now,config,a.request);
 const b=fakeFetch([record(),record({_id:'late',startTime:now/1000-2000,endTime:now/1000-500})]);
 await monitorMahjong(f.env,now+5*60_000,config,b.request);assert.equal(b.sent.length,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mahjong_watch_posts').get()!.n,2);
});
test('provider 429 backs off globally for at least one hour and never hops mirrors',async()=>{
 const f=fixture();let requests=0;
 const limited=(async()=>{requests++;return new Response('x-cap-token-required',{status:429});})as typeof fetch;
 await monitorMahjong(f.env,now,config,limited);assert.equal(requests,1);assert.equal(state(f.sql,'error'),'provider_http_429');
 await monitorMahjong(f.env,now+5*60_000,config,limited);assert.equal(requests,1);
 assert.equal(Number(state(f.sql,'next_poll_at')),now+3600_000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mahjong_watch_posts').get()!.n,0);
});
test('queued delivery survives provider failure and concurrent flushes claim one post',async()=>{
 const f=fixture();const fail=(async(input:RequestInfo|URL)=>String(input).includes('discord.com')?new Response('',{status:503}):Response.json(String(input).includes('/pl3/')?[]:[record()]))as typeof fetch;
 await monitorMahjong(f.env,now,config,fail);assert.equal(f.sql.prepare('SELECT sent FROM mahjong_watch_posts').get()!.sent,0);
 const web=fakeFetch();await Promise.all([flushMahjongPosts(f.env,now+120_000,web.request),flushMahjongPosts(f.env,now+120_000,web.request)]);assert.equal(web.sent.length,1);
 assert.equal(f.sql.prepare('SELECT sent FROM mahjong_watch_posts').get()!.sent,1);
});
test('overlapping cron runs have one lease; disabled configuration performs no I/O',async()=>{
 const f=fixture(),web=fakeFetch();await monitorMahjong(f.env,now,{...config,enabled:false},web.request);assert.equal(web.urls.length,0);
 await Promise.all([monitorMahjong(f.env,now,config,web.request),monitorMahjong(f.env,now,config,web.request)]);
 assert.equal(web.urls.filter(u=>u.includes('player_records')).length,2);assert.equal(web.sent.length,1);
});
test('fresh enrollment never makes an inverted API range and malformed data never gets a notification',async()=>{
 const f=fixture(),web=fakeFetch([]);await monitorMahjong(f.env,now+123_000,{...config,startedAt:now+100_000},web.request);assert.equal(web.urls.length,2);
 const broken=(async()=>Response.json({result_key:'unresolved'}))as typeof fetch;
 await monitorMahjong(f.env,now+8*60_000,config,broken);assert.equal(state(f.sql,'error'),'provider_or_data_unavailable');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mahjong_watch_posts').get()!.n,0);
});

test('the provider key is sent as a Bearer token and requests stay at most one per second',async()=>{
 const f=fixture(),seen:Array<string|null>=[];
 const request=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.hostname==='discord.com')return Response.json({id:'100000000000000001'});
  seen.push(new Headers(init?.headers).get('Authorization'));return Response.json([]);
 }) as typeof fetch;
 waits.length=0;
 await monitorMahjong({...f.env,AMAE_KOROMO_TOKEN:'fixture-provider-token'},now,{...config,players:[{id:10,name:'a'},{id:11,name:'b'}]},request);
 assert.deepEqual(seen,Array(4).fill('Bearer fixture-provider-token'));
 assert.deepEqual(waits,Array(3).fill(PROVIDER_GAP),'a gap before every request but the first');
 assert.ok(PROVIDER_GAP>=1000);
 const g=fixture();seen.length=0;await monitorMahjong(g.env,now,config,request);
 assert.deepEqual(seen,[null,null],'without a key nothing is invented');
});

test('the paipu id is kept only in the game\'s own form and queued for reading', async () => {
 const good='261027-0123abcd-4567-89ab-cdef-0123456789ab';
 const [kept]=parseMahjongRecords([{...record(),uuid:good}],10,[12],config.startedAt,now);assert.equal(kept.uuid,good);
 const [dropped]=parseMahjongRecords([{...record(),uuid:'../x'}],10,[12],config.startedAt,now);assert.equal(dropped.uuid,undefined);
 const old='261020-0123abcd-4567-89ab-cdef-0123456789ab';
 const f=fixture(),web=fakeFetch([{...record(),uuid:good},{...record(),_id:'old-game',uuid:old,startTime:now/1000-8*3600,endTime:now/1000-7*3600}]);
 await monitorMahjong(f.env,now,{...config,startedAt:now-24*3600_000},web.request);
 assert.deepEqual(f.sql.prepare('SELECT paipu,account FROM mahjong_paipu_auto').all().map(r=>({...r})),[{paipu:good,account:10}],'games older than six hours are not read automatically');
});
test('every ranked room is watched, and linked members are polled from a recent start under their in-game name',async()=>{
 const f=fixture(),web=fakeFetch([record({modeId:9})]);
 f.sql.exec('CREATE TABLE kp_mahjong_links(guild TEXT NOT NULL,user TEXT NOT NULL,account INTEGER NOT NULL,PRIMARY KEY(guild,user),UNIQUE(guild,account))');
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run('100000000000000100','100000000000000104',20);
 f.sql.prepare('INSERT INTO kp_mahjong_links VALUES(?,?,?)').run('100000000000000100','100000000000000105',10);
 await monitorMahjong(f.env,now,{...config,startedAt:now-48*3600_000},web.request);
 const polls=web.urls.filter(u=>u.includes('player_records')).map(u=>new URL(u));
 assert.deepEqual(polls.map(u=>u.pathname.split('/').at(-3)),['10','10','20','20'],'a linked registered player is not polled twice');
 assert.equal(polls[0].searchParams.get('mode'),'8,9,11,12,15,16');assert.equal(polls[1].searchParams.get('mode'),'21,22,23,24,25,26');
 assert.equal(Number(polls[0].pathname.split('/').at(-1)),now-48*3600_000);assert.equal(Number(polls[2].pathname.split('/').at(-1)),now-6*3600_000);
 assert.deepEqual(web.sent.map(m=>m.content.split('\n')[0]),['🀄 **fixture｜1着／4人**','🀄 **B｜2着／4人**']);
 assert.match(web.sent[0].content,/四麻・金の間 半荘/);
});

test('a newly found game starts the paipu reader once; without a token or a new game nothing is dispatched',async()=>{
 const uuid='261028-0123abcd-4567-89ab-cdef-0123456789ab';
 const f=fixture(),web=fakeFetch([{...record(),uuid}]),env={...f.env,PAIPU_DISPATCH_TOKEN:'fixture-github-token'};
 await monitorMahjong(env,now,config,web.request);
 assert.equal(web.dispatches.length,1);assert.match(web.dispatches[0].url,/actions\/workflows\/mahjong-paipu\.yml\/dispatches$/);
 assert.equal((web.dispatches[0].init?.headers as Record<string,string>).Authorization,'Bearer fixture-github-token');assert.deepEqual(JSON.parse(String(web.dispatches[0].init?.body)),{ref:'main'});
 await monitorMahjong(env,now+60_000,config,web.request);assert.equal(web.dispatches.length,1,'the same game is not dispatched again');
 web.failDispatch(403);const g=fixture();await monitorMahjong({...g.env,PAIPU_DISPATCH_TOKEN:'x'},now,config,web.request);
 assert.equal(state(g.sql,'dispatch_error'),'github_http_403');assert.equal(state(g.sql,'error'),'','the result post is unaffected');
 const h=fixture(),plain=fakeFetch([{...record(),uuid}]);await monitorMahjong(h.env,now,config,plain.request);assert.equal(plain.dispatches.length,0);
});

test('the delay between a game ending and it being found is kept for diagnosis',async()=>{
 const f=fixture(),web=fakeFetch();await monitorMahjong(f.env,now,config,web.request);
 assert.equal(state(f.sql,'found_delay_seconds'),'100');assert.equal(state(f.sql,'found_game_end_at'),String(now-100_000));
});
