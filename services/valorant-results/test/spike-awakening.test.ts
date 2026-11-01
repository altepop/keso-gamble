import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {initialSpikeProfile,quoteSpike,spikeProgress,SPIKE_ROSTER} from '../src/spikerush-growth.ts';
import type {SpikeProfile,SpikeMatch} from '../src/spikerush-growth.ts';
import {blankTrials,safeTrials,isOverdrive,nextSpikeTrials,purchaseSpikeHint,spikeStatus,ensureSpikeAwakening,hydrateSpikeControllerHistory, SPIKE_HINT_COST} from '../src/spike-awakening.ts';
import {initializeKp,syncKpAccounts,collectKpMatch,kpEventId} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {ledgerHistory} from '../src/kp-history.ts';
import type {Match} from '../src/results.ts';
const guild='100000000000000100',one='100000000000000101';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one}]};
const duelist=SPIKE_ROSTER.agents.find(a=>a.role==='Duelist')!,initiator=SPIKE_ROSTER.agents.find(a=>a.role==='Initiator')!,controller=SPIKE_ROSTER.agents.find(a=>a.role==='Controller')!,sentinel=SPIKE_ROSTER.agents.find(a=>a.role==='Sentinel')!;
const START=Date.parse('2026-10-29T03:00:00Z');
const m=(agent=duelist.id,extra:Partial<SpikeMatch>={}):SpikeMatch=>({agent,kills:6,assists:2,deaths:6,win:true,startedAt:START,endedAt:START+8*60000,...extra});
const complete=():SpikeProfile=>({...initialSpikeProfile(),games:60,
 counts:Object.fromEntries(SPIKE_ROSTER.agents.map(a=>[a.id,2])),
 unlocked:['Duelist','Initiator','Controller','Sentinel'],
 trials:{duelist:true,initiator:true,controllerWins:SPIKE_ROSTER.agents.filter(a=>a.role==='Controller').map(a=>a.id),controllerWinCounts:Object.fromEntries(SPIKE_ROSTER.agents.filter(a=>a.role==='Controller').map(a=>[a.id,3])),controllerKdAgents:SPIKE_ROSTER.agents.filter(a=>a.role==='Controller').map(a=>a.id),sentinel:true}});
const raw=(id:string,extra:Partial<SpikeMatch>={}):Match=>{
 const v=m(duelist.id,extra);
 return {metadata:{match_id:id,is_completed:true,queue:{id:'spikerush'},started_at:new Date(v.startedAt).toISOString(),game_length_in_ms:v.endedAt-v.startedAt},
  players:Array.from({length:10},(_,i)=>({puuid:i===0?'p-one':'p-'+i,team_id:i<5?'red':'blue',agent:i===0?{id:v.agent,name:'Jett'}:{name:'Jett'},
   stats:{kills:i===0?v.kills:4,assists:i===0?v.assists:2,deaths:i===0?v.deaths:5}})),
  teams:[{team_id:'red',won:v.win,rounds:{won:v.win?4:2}},{team_id:'blue',won:!v.win,rounds:{won:v.win?2:4}}]} as Match;
};
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())
  sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{
  text:string;values:unknown[];
  constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}
  bind(...v:unknown[]){return new Query(this.text,v);}
  first(){return sql.prepare(this.text).get(...this.values as never[])??null;}
  all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}
  run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}
 }
 const env:KpEnv={DB:{prepare:(x:string)=>new Query(x),batch:(xs:Query[])=>{
  sql.exec('BEGIN');try{const result=xs.map(x=>x.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}
 }} as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 sql.exec("UPDATE kp_settings SET value='0' WHERE key IN ('starts_at','spikerush_growth_started_at');UPDATE kp_accounts SET linked_at=0");
 const seed=(p:SpikeProfile)=>sql.prepare('INSERT INTO spike_profiles(guild,puuid,user,data) VALUES(?,?,?,?) ON CONFLICT(guild,puuid) DO UPDATE SET data=excluded.data').run(guild,'p-one',one,JSON.stringify(p));
 const credit=(amount:number)=>sql.prepare('INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(?,?,?,?,?,?)').run('seed:'+amount+':'+Math.random(),guild,one,amount,'test',START);
 const balance=()=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,one)!.balance);
 return {sql,env,seed,credit,balance,close:()=>sql.close()};
}
test('each of four trials has a unique verifiable achievement and old profiles remain safe',()=>{
 let p=complete();p.trials=blankTrials();
 assert.equal(spikeProgress(p).filter(x=>x.awakened).length,0);
 p.trials=nextSpikeTrials(p,m(duelist.id,{kills:12}));assert.equal(p.trials.duelist,true);
 p.trials=nextSpikeTrials(p,m(initiator.id,{assists:7}));assert.equal(p.trials.initiator,true);
 p.trials=nextSpikeTrials(p,m(sentinel.id,{kills:5,deaths:0}));assert.equal(p.trials.sentinel,true);
 const controllers=SPIKE_ROSTER.agents.filter(a=>a.role==='Controller');
 for(const agent of controllers)p.trials=nextSpikeTrials(p,m(agent.id,{win:true,kills:3,deaths:2}));
 assert.equal(p.trials.controllerKdAgents?.length,0,'K/D below 2 never qualifies, even with a win');
 for(const agent of controllers.slice(0,6))p.trials=nextSpikeTrials(p,m(agent.id,{win:false,kills:4,deaths:2}));
 assert.equal(p.trials.controllerKdAgents?.length,6);
 assert.equal(isOverdrive(p),false,'all seven different controllers must qualify');
 p.trials=nextSpikeTrials(p,m(controllers[6].id,{win:false,kills:1,deaths:0}));
 assert.equal(isOverdrive(p),true,'positive kills with zero deaths qualify');
 p.trials=nextSpikeTrials(p,m(controllers[0].id,{win:true,kills:6,deaths:3}));
 assert.equal(p.trials.controllerKdAgents?.length,7,'repeated qualifying games do not add duplicates');
 const zero=nextSpikeTrials({...p,trials:blankTrials()},m(controllers[0].id,{kills:0,deaths:0,assists:2}));
 assert.equal(zero.controllerKdAgents?.length,0,'zero kills and zero deaths do not qualify');
 const old=complete();delete old.trials;assert.equal(isOverdrive(old),false,'old stored data does not silently gain new trials');
});
test('fully awakened matches average 800 KP and never fatigue after 10 or repeat agents',()=>{
 const p=complete();
 const win=quoteSpike(p,m(),1),loss=quoteSpike(p,m(duelist.id,{win:false}),1);
 assert.equal(win.amount,813);assert.equal(loss.amount,788);
 assert.ok(Math.abs((win.amount+loss.amount)/2-800)<=1);
 for(const game of [1,10,11,16,100]){
  const repeated={...p,recent:Array(4).fill(duelist.id)};
  assert.equal(quoteSpike(repeated,m(),game).amount,win.amount);
  assert.equal(quoteSpike(repeated,m(duelist.id,{win:false}),game).amount,loss.amount);
 }
 assert.equal(quoteSpike(p,m(duelist.id,{kills:1000,assists:1000,deaths:0}),1).amount,980);
 const almost={...p,trials:{...p.trials!,duelist:false}};
 assert.equal(spikeProgress(almost).filter(r=>r.awakened).length,3);
 assert.ok(quoteSpike(almost,m(),1).amount>600&&quoteSpike(almost,m(),1).amount<800,'three awakenings each grant a quarter of the boost');
});

test('each awakened role earns an equal quarter of the 555 KP bonus',()=>{
 const p=complete();
 const stages=[blankTrials(),
  {...blankTrials(),duelist:true},
  {...blankTrials(),duelist:true,initiator:true},
  {...blankTrials(),duelist:true,initiator:true,sentinel:true},
  p.trials!];
 const quoted=stages.map(trials=>quoteSpike({...p,trials,carryN:'0',carryD:'1'},m(),1));
 assert.deepEqual(quoted.map(q=>q.breakdown.awakenings),[0,1,2,3,4]);
 const exact=quoted.map(q=>q.amount+Number(q.next.carryN)/Number(q.next.carryD));
 for(let i=1;i<exact.length;i++)assert.ok(Math.abs(exact[i]-exact[i-1]-138.75)<1e-8);
 assert.equal(quoted[4].amount,813);
});

test('legacy controller wins are backfilled from rewarded matches without changing other trials',async()=>{
 const a=SPIKE_ROSTER.agents.filter(v=>v.role==='Controller');
 const original=complete();
 original.trials={duelist:true,initiator:true,controllerWins:[a[0].id,a[1].id],sentinel:true};
 const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:[{agent:a[0].id,wins:3},{agent:a[1].id,wins:2},{agent:a[2].id,wins:1}]})})})}} as unknown as KpEnv;
 const fixed=await hydrateSpikeControllerHistory(env,guild,'p-one',original);
 assert.equal(safeTrials(fixed).controllerWinCounts?.[a[0].id],3);
 assert.equal(safeTrials(fixed).controllerWinCounts?.[a[1].id],2);
 assert.equal(safeTrials(fixed).controllerWinCounts?.[a[2].id],1);
 assert.equal(safeTrials(fixed).initiator,true);
 assert.equal(spikeProgress(fixed).find(x=>x.role==='Controller')?.awakened,false);
 const again=await hydrateSpikeControllerHistory({DB:{prepare:()=>{throw Error('unexpected scan');}}} as unknown as KpEnv,guild,'p-one',fixed);
 assert.equal(again,fixed);
});

test('hidden trial clues cost 10k once per role and reveal private exact progress',async()=>{
 const f=await fixture();f.seed(complete());
 const invisible=await spikeStatus(f.env,guild,one);
 assert.match(invisible,/Duelist/);assert.match(invisible,/Controller/);
 assert.match(invisible,/🔒 未公開/);assert.doesNotMatch(invisible,/12キル以上|7アシスト以上|7人のコントローラー全員/);
 assert.equal(invisible.length<1950,true,'Discord body must fit');
 f.credit(10000);
 const pay=await purchaseSpikeHint(f.env,guild,one,'Duelist',START);
 assert.match(pay,/10,000 KP/);assert.equal(f.balance(),0);
 const learned=await spikeStatus(f.env,guild,one);
 assert.match(learned,/12キル以上/);assert.doesNotMatch(learned,/7アシスト以上/);
 assert.match(await purchaseSpikeHint(f.env,guild,one,'Duelist',START+1),/購入済み/);
 assert.equal(f.balance(),0);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_ledger WHERE kind='spike-hint'").get()!.n,1);
 assert.match(await purchaseSpikeHint(f.env,guild,one,'Initiator',START+2),/不足/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_hint_unlocks').get()!.n,1);
 f.close();
});
test('legacy 425 check survives, OVERDRIVE gets a separate atomic 813/788 ledger and one game receipt',async()=>{
 const f=await fixture();f.seed(complete());
 assert.equal(await collectKpMatch(f.env,mapping,raw('overdrive-win'),'p-one'),813);
 assert.equal(await collectKpMatch(f.env,mapping,raw('overdrive-win'),'p-one'),813);
 assert.equal(f.balance(),813);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_rewards').get()!.n,0);
 assert.equal(f.sql.prepare('SELECT amount FROM spike_overdrive_rewards').get()!.amount,813);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_events').get()!.n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()!.n,1);
 const rows=await ledgerHistory(f.env,guild,one);
 assert.equal(rows[0].delta,813);assert.match(rows[0].detail,/OVERDRIVE/);
 assert.equal(await collectKpMatch(f.env,mapping,raw('overdrive-loss',{win:false}),'p-one'),788);
 assert.equal(f.balance(),1601);
 const daily=f.sql.prepare('SELECT detail FROM spike_overdrive_rewards WHERE match=?').get('overdrive-loss') as {detail:string};
 assert.equal(JSON.parse(daily.detail).dayGame,2,'v1 + v2 day counter remains consistent');
 f.close();
});
test('overdrive transaction failure leaves wallet, profile, receipt and day counter untouched',async()=>{
 const f=await fixture();f.seed(complete());
 f.sql.exec("CREATE TRIGGER fail_overdrive BEFORE INSERT ON kp_events BEGIN SELECT RAISE(ABORT,'fixture-rollback'); END");
 assert.equal(await collectKpMatch(f.env,mapping,raw('failed-event'),'p-one'),null);
 assert.equal(f.balance(),0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM spike_overdrive_rewards').get()!.n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_events').get()!.n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_inbox').get()!.n,1);
 f.sql.exec('DROP TRIGGER fail_overdrive');
 assert.equal(await collectKpMatch(f.env,mapping,raw('failed-event'),'p-one'),813);
 assert.equal(f.balance(),813);
 f.close();
});

test('secret controller trial progress never creates a public notification',async()=>{
 const f=await fixture();
 assert.equal(await collectKpMatch(f.env,mapping,raw('secret-controller',{agent:controller.id,kills:4,deaths:2,win:false}),'p-one'),20);
 assert.deepEqual(f.sql.prepare('SELECT id FROM mahjong_watch_posts').all(),[]);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM spike_profiles').get()!.n,1);
 assert.equal(f.sql.prepare('SELECT data FROM spike_profiles').get()!.data.includes(controller.id),true);
 f.close();
});

test('new role awakening and overdrive produce only two sanitized, once-only result-bot messages',async()=>{
 const f=await fixture(),p=complete();
 p.trials!.initiator=false;
 f.seed(p);
 const match=raw('spike-last-awakening',{agent:initiator.id,kills:3,assists:7,deaths:2,win:true});
 const payout=await collectKpMatch(f.env,mapping,match,'p-one');
 assert.ok(typeof payout==='number'&&payout>0);
 const posts=f.sql.prepare("SELECT id,body FROM mahjong_watch_posts WHERE id LIKE 'spike-%' ORDER BY id").all() as Array<{id:string;body:string}>;
 assert.equal(posts.length,2,'role awakening and overdrive each have their own post');
 const messages=posts.map(x=>JSON.parse(x.body).content as string);
 assert.ok(messages.some(x=>x.includes('イニシエーター覚醒')));
 assert.ok(messages.some(x=>x.includes('OVERDRIVE解放')));
 for(const message of messages)assert.doesNotMatch(message,/7アシスト|12キル|K\/D|試練|3勝|21勝|2回使用/);
 for(const entry of posts)assert.deepEqual(JSON.parse(entry.body).allowed_mentions,{parse:[]});
 assert.equal(await collectKpMatch(f.env,mapping,match,'p-one'),payout,'repeated settlement returns same reward');
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM mahjong_watch_posts WHERE id LIKE 'spike-%'").get()!.n,2,'no duplicated milestones');
 f.close();
});
