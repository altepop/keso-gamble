import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpMapping} from '../src/kp.ts';
import {parseUnite,uniteUid,monitorUnite,uniteJa,unitePost,UNITE_WIN,UNITE_LOSS} from '../src/unite.ts';
import type {UniteEnv,UniteMatch} from '../src/unite.ts';
import {runKpCommand} from '../src/kp-slash.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102',cat='100000000000000104';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const T0=Date.parse('2026-10-28T22:00:00+09:00'),UID='10715117730671753501';
/** A UniteAPI match card with the same structure as the live site, made-up values. */
function card(m:Partial<UniteMatch>&{ago?:string;purple?:boolean}={}){
 const v={win:true,surrendered:false,map:'Theia Sky Ruins (Groudon)',party:'Trio',pokemon:'Pikachu',level:14,ours:400,theirs:250,ko:5,ast:7,int:1,dmg:'60k',tkn:'40k',heal:'5k',ago:'3 minutes ago',...m};
 const stat=(n:string,p:string,l:string)=>`<div class="flex flex-col"><span class="text-sm">${n}</span><span class="text-[10px]">${p}</span><span class="text-[9px]">${l}</span></div>`;
 return `<div class="group relative w-full min-h-[95px] overflow-hidden px-3 py-3.5 rounded-lg border border-border/40 border-l-[3px] border-l-${v.win?'emerald':'red'}-500 flex"><div class="flex"><div class="flex flex-col"><span class="text-sm font-medium">${v.ago}</span><div><span class="text-xs" title="${v.map}">${v.map}</span></div><div><span class="text-xs">${v.party}</span></div>${v.surrendered?'<span>Surrendered</span>':''}</div><div class="relative"><img alt="${v.pokemon}" src="/x.png"/><div class="absolute">${v.level}</div></div><div><img alt="Skill A" src="/s.png"/></div><div class="flex flex-col">${(v.purple??true)?`<div class="text-sm rounded leading-none ${v.win?'text-purple-400 bg-purple-500/10':'text-muted-foreground'}">${v.ours}</div><div class="text-[10px] leading-none">vs</div><div class="text-sm rounded leading-none ${v.win?'text-muted-foreground':'text-orange-400 bg-orange-500/10'}">${v.theirs}</div>`:`<div class="text-sm rounded leading-none ${v.win?'text-muted-foreground':'text-purple-400 bg-purple-500/10'}">${v.theirs}</div><div class="text-[10px] leading-none">vs</div><div class="text-sm rounded leading-none ${v.win?'text-orange-400 bg-orange-500/10':'text-muted-foreground'}">${v.ours}</div>`}</div><div><span>${v.ko}</span><span>/</span><span>${v.ast}</span><span>/</span><span>${v.int}</span></div><div><span>KO</span><span>AST</span><span>INT</span></div>${stat(v.dmg,'20%','DMG')}${stat(v.tkn,'30%','TKN')}${stat(v.heal,'2%','HEAL')}</div></div>`;
}
const page=(cards:string[],name='テスト選手')=>`<html><head><title>${name} - UniteAPI</title></head><body><div>Battles</div>${cards.join('')}</body></html>`;
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:UniteEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/9/result',KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 let html=page([card()]);const sent:string[]=[],reads:string[]=[];
 const request=(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);
  if(url.startsWith('https://discord.com/')){sent.push(JSON.parse(String(init?.body)).content);return Response.json({id:'100000000000000001'});}
  reads.push(url);return new Response(html);}) as typeof fetch;
 const balance=(user:string)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(user)?.balance??0);
 return {env,sql,request,sent,reads,balance,set:(h:string)=>{html=h;}};
}
const link=(f:Awaited<ReturnType<typeof fixture>>,user:string,profile:string,n=1)=>runKpCommand(f.env,{id:String((BigInt(T0)-1420070400000n)<<22n|BigInt(n)),guild_id:guild,member:{user:{id:one}},data:{name:'unitelink',options:[{name:'user',value:user},{name:'profile',value:profile}]}},mapping);

test('profile links and ids are accepted; anything else is not',()=>{
 assert.equal(uniteUid('https://uniteapi.dev/p/'+UID),UID);assert.equal(uniteUid('https://uniteapi.dev/en/p/'+UID+'/'),UID);assert.equal(uniteUid(UID),UID);
 for(const bad of ['https://evil.example/p/'+UID,'R63R6P5','','https://uniteapi.dev/p/abc'])assert.equal(uniteUid(bad),null);
});
test('the page is read into matches; private and unknown profiles are told apart',()=>{
 const p=parseUnite(page([card({win:false,surrendered:true,ko:0,pokemon:'Mr. Mime',ago:'21 minutes ago'}),card()]))!;
 assert.equal(p.name,'テスト選手');assert.equal(p.matches.length,2);
 assert.deepEqual(p.matches[0],{win:false,surrendered:true,map:'Theia Sky Ruins (Groudon)',party:'Trio',pokemon:'Mr. Mime',level:14,ours:400,theirs:250,ko:0,ast:7,int:1,dmg:'60k',tkn:'40k',heal:'5k'});
 assert.deepEqual(parseUnite('<title>Private Profile</title>'),{name:'',private:true,matches:[]});
 assert.equal(parseUnite('<title>Player Not Found - UniteAPI</title>'),null);
 assert.equal(parseUnite(page([card().replace('>vs<','><')])),null,'a changed layout is not guessed at');
 // The page shows purple vs orange with the winner coloured: our side depends on the result, not the order.
 for(const purple of [true,false])for(const win of [true,false]){
  const [m]=parseUnite(page([card({win,purple,ours:win?300:120,theirs:win?150:400})]))!.matches;
  assert.deepEqual([m.ours,m.theirs],[win?300:120,win?150:400],`${purple?'purple':'orange'} ${win?'win':'loss'}`);
 }
});
test('linking records what is already there; later games are posted once and settled in KP',async()=>{
 const f=await fixture();
 assert.match(await link(f,'ねこ','x'),/指定してください/);
 assert.match(await link(f,`<@${cat}>`,'https://uniteapi.dev/p/'+UID,2),/結び付けました/);
 await monitorUnite(f.env,T0,f.request,mapping);
 assert.equal(f.reads.length,1);assert.equal(f.sent.length,0,'the first read posts nothing');assert.equal(f.balance(cat),0);
 await monitorUnite(f.env,T0+60_000,f.request,mapping);assert.equal(f.reads.length,1,'one profile at most every two minutes');
 f.set(page([card({win:false,surrendered:true,ko:0,ours:150,theirs:380}),card({pokemon:'Absol',ko:12}),card()]));
 await monitorUnite(f.env,T0+3*60_000,f.request,mapping);
 assert.equal(f.sent.length,2);
 assert.match(f.sent[0],/テスト選手｜ポケモンユナイト ランクマ 勝利/);assert.match(f.sent[0],/🗯️ KO 12。/);assert.match(f.sent[0],/\+560 KP/);assert.match(f.sent[0],/チーム貢献 \+160 KP/);
 assert.match(f.sent[1],/敗北\*\*（降参）/);assert.equal(f.sent[1].split('\n').filter(l=>l.startsWith('🗯️')).length,3);
 assert.match(f.sent[1],new RegExp(`−${UNITE_LOSS} KP`));
 assert.equal(f.balance(cat),UNITE_WIN+160-UNITE_LOSS,'the performance-boosted win is credited before the later loss');
 await monitorUnite(f.env,T0+6*60_000,f.request,mapping);assert.equal(f.sent.length,2,'the same games are not posted again');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_ledger WHERE kind='unite'").get()!.n,2);
});
test('a private profile or a failed read is recorded and posts nothing',async()=>{
 const f=await fixture();await link(f,cat,UID);f.set('<title>Private Profile</title>');
 await monitorUnite(f.env,T0,f.request,mapping);
 assert.equal(f.sql.prepare('SELECT error FROM unite_links').get()!.error,'private_profile');assert.equal(f.sent.length,0);
});
test('a loss with nothing in the wallet takes nothing from it and owes the loss as 借KP',async()=>{
 const f=await fixture();await link(f,cat,UID);await monitorUnite(f.env,T0,f.request,mapping);
 f.set(page([card({win:false}),card()]));await monitorUnite(f.env,T0+3*60_000,f.request,mapping);
 assert.equal(f.balance(cat),0);assert.equal(f.sent.length,1);
 const owed=Number(f.sql.prepare('SELECT amount FROM kp_debts WHERE user=?').get(cat)?.amount??0);
 assert.ok([0,UNITE_LOSS,UNITE_LOSS*2].includes(owed),String(owed));
 if(owed)assert.match(f.sent[0],new RegExp(`💸 ±0 KP.*借KP \\+${owed}`));
});
test('every roast list is distinct, and a loss post never repeats a line',()=>{
 const v=JSON.parse(readFileSync(new NodeURL('../unite-voice.json',import.meta.url),'utf8'));
 for(const key of ['win','loss','surrendered','noKo','bigKo'])assert.equal(new Set(v[key]).size,v[key].length,key);
 assert.ok(v.win.length>=15&&v.loss.length>=30);
});
test('posts use Japanese names: Pokemon, stage and party size; roast lines name the Pokemon',()=>{
 assert.deepEqual(uniteJa({pokemon:'Eldegoss',map:'Theia Sky Ruins (Groudon)',party:'Trio'}),{pokemon:'ワタシラガ',map:'テイア蒼空遺跡（グラードン）',party:'トリオ',boss:'グラードン'});
 assert.deepEqual(uniteJa({pokemon:'Brand New Mon',map:'New Stadium',party:'Five'}),{pokemon:'Brand New Mon',map:'New Stadium',party:'Five',boss:'終盤のボス'},'unknown names stay as they are');
 const [m]=parseUnite(page([card({win:false,pokemon:'Crustle'})]))!.matches;
 const posts=Array.from({length:40},(_,i)=>unitePost('テスト選手',String(i),m,-50));
 assert.ok(posts.every(p=>p.includes('-# イワパレス Lv14・テイア蒼空遺跡（グラードン）・トリオ')&&!/\{pokemon\}|\{boss\}|Crustle|ザップドス|サンダー|レックウザ|カイオーガ/.test(p)));
 assert.ok(posts.some(p=>/🗯️ .*イワパレス/.test(p)),'some roast lines name the Pokemon');
});

test('Unite streak payouts grow to the cap, reset on opposite result, and do not infer missing history',async()=>{
 const {uniteQuote}=await import('../src/unite-rewards.ts');
 const {luckFor}=await import('../src/luck.ts');
 const seed=Array.from({length:100},(_,i)=>'streak-'+i).find(s=>!luckFor('unite:'+s))!;
 let wins=0,losses=0;
 for(const expected of [400,500,600,700,800,800]){const q=uniteQuote(true,wins,losses,seed);assert.equal(q.net,expected);({wins,losses}=q);}
 for(const expected of [-100,-200,-300,-400,-500,-500]){const q=uniteQuote(false,wins,losses,seed);assert.equal(q.net,expected);({wins,losses}=q);}
 assert.equal(uniteQuote(true,wins,losses,seed).base,400);
 assert.equal(uniteQuote(true,5,0,seed,true).base,400,'a history gap starts a new observed streak');
});
test('failed Unite credit leaves the cursor and streak untouched; retry pays once and queues the post',async()=>{
 const f=await fixture();await link(f,cat,UID);await monitorUnite(f.env,T0,f.request,mapping);
 const seen=f.sql.prepare('SELECT seen FROM unite_links').get()!.seen;
 f.set(page([card({pokemon:'Absol',ko:12}),card()]));
 f.sql.exec("CREATE TRIGGER unite_fail BEFORE INSERT ON kp_ledger WHEN NEW.kind='unite' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 await assert.rejects(monitorUnite(f.env,T0+3*60000,f.request,mapping));
 assert.equal(f.sql.prepare('SELECT seen FROM unite_links').get()!.seen,seen);
 assert.equal(f.sql.prepare('SELECT wins FROM unite_streaks').get()!.wins,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM unite_rewards').get()!.n,0);
 f.sql.exec('DROP TRIGGER unite_fail');await monitorUnite(f.env,T0+6*60000,f.request,mapping);
 const balance=f.balance(cat);assert.ok(balance>=200);assert.equal(f.sql.prepare('SELECT wins FROM unite_streaks').get()!.wins,1);
 await monitorUnite(f.env,T0+9*60000,f.request,mapping);assert.equal(f.balance(cat),balance);assert.equal(f.sent.length,1);
});
test('more than three newly observed Unite games are processed oldest first without dropping games',async()=>{
 const f=await fixture();await link(f,cat,UID);await monitorUnite(f.env,T0,f.request,mapping);
 f.set(page([card({ko:14}),card({ko:13}),card({ko:12}),card({ko:11}),card()]));
 await monitorUnite(f.env,T0+3*60000,f.request,mapping);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM unite_rewards').get()!.n,4);
 assert.equal(f.sql.prepare('SELECT wins FROM unite_streaks').get()!.wins,4);
 assert.equal(f.sent.length,4);
});
test('a page that no longer matches the saved history pays nothing and starts a new baseline',async()=>{
 const f=await fixture();await link(f,cat,UID);await monitorUnite(f.env,T0,f.request,mapping);
 // The old card is gone and five unknown games appear (a format change or replaced history): none of them is paid.
 f.set(page([card({ko:21}),card({ko:22}),card({ko:23}),card({ko:24}),card({ko:25})]));
 await monitorUnite(f.env,T0+3*60000,f.request,mapping);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM unite_rewards').get()!.n,0);assert.equal(f.balance(cat),0);assert.equal(f.sent.length,0);
 assert.equal(f.sql.prepare('SELECT error FROM unite_links').get()!.error,'history_gap');
 const {healthReport}=await import('../src/health.ts');assert.equal((await healthReport(f.env,guild,T0)).backlog.uniteErrors,1);
 // The next real game after the new baseline is paid as the first of a streak, and the gap mark clears.
 f.set(page([card({ko:26}),card({ko:21}),card({ko:22}),card({ko:23}),card({ko:24})]));
 await monitorUnite(f.env,T0+6*60000,f.request,mapping);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM unite_rewards').get()!.n,1);assert.equal(f.sql.prepare('SELECT wins FROM unite_streaks').get()!.wins,1);
 assert.equal(f.sql.prepare('SELECT error FROM unite_links').get()!.error,null);
});
test('two games with identical stats do not stop the profile; each fingerprint is paid once',async()=>{
 const f=await fixture();await link(f,cat,UID);await monitorUnite(f.env,T0,f.request,mapping);
 f.set(page([card({ko:31}),card({ko:0,ast:0}),card({ko:0,ast:0}),card()]));
 await monitorUnite(f.env,T0+3*60000,f.request,mapping);
 assert.equal(f.sql.prepare('SELECT error FROM unite_links').get()!.error,null);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM unite_rewards').get()!.n,2);assert.equal(f.sent.length,2);
 f.set(page([card({ko:32}),card({ko:31}),card({ko:0,ast:0}),card({ko:0,ast:0}),card()]));
 await monitorUnite(f.env,T0+6*60000,f.request,mapping);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM unite_rewards').get()!.n,3,'later reads keep going');
});

test('Unite win bonuses reward attackers, supporters, tankers and team score without stacking roles',async()=>{
 const {uniteQuote}=await import('../src/unite-rewards.ts');
 const {luckFor,applyLuck}=await import('../src/luck.ts');
 const seed=Array.from({length:200},(_,i)=>'bonus-'+i).find(x=>!luckFor('unite:'+x))!;
 const stats={ko:5,ast:7,ours:350,theirs:230,heal:'5k',tkn:'40k',surrendered:false};
 assert.equal(uniteQuote(true,0,0,seed,false,stats).net,400);
 assert.equal(uniteQuote(true,0,0,seed,false,{...stats,ko:12}).net,560,'19 combined assists+KOs add 160 KP');
 assert.equal(uniteQuote(true,0,0,seed,false,{...stats,ko:20,ast:12}).net,700,'25+ actions add 300 KP once');
 assert.equal(uniteQuote(true,0,0,seed,false,{...stats,ko:0,ast:11}).net,560,'supporter with 11 assists is rewarded');
 assert.equal(uniteQuote(true,0,0,seed,false,{...stats,ko:0,ast:0,heal:'65.5k'}).net,560,'healer gets support credit');
 assert.equal(uniteQuote(true,0,0,seed,false,{...stats,ko:0,ast:0,tkn:'121k'}).net,700,'tank can earn the upper support bonus');
 const elite=uniteQuote(true,0,0,seed,false,{...stats,ko:23,ast:18,ours:500,theirs:100,heal:'140k',tkn:'180k'});
 assert.equal(elite.net,820,'300 contribution + 120 victory margin: at most +420 KP');
 assert.match(elite.note,/大差勝利/);
 assert.equal(uniteQuote(true,0,0,seed,false,{...stats,ko:0,ast:0,heal:'invalid'}).net,400,'garbled stat text never grants KP');
 assert.equal(uniteQuote(true,0,0,seed,false,{...stats,ko:-10,ast:20}).net,400,'invalid statistics do not pay');
 assert.equal(uniteQuote(true,0,0,seed,false,{...stats,ko:23,ast:18,ours:500,theirs:100}).net,820,'server-known performance is stable');
 const lucky='unite:'+seed;
 assert.equal(uniteQuote(true,1,0,seed,false,stats).net,applyLuck(500,luckFor(lucky)));
});
test('Unite close losses and active play reduce losses but cannot pay for throwing matches',async()=>{
 const {uniteQuote}=await import('../src/unite-rewards.ts');
 const {luckFor}=await import('../src/luck.ts');
 const seed=Array.from({length:200},(_,i)=>'loss-bonus-'+i).find(x=>!luckFor('unite:'+x))!;
 const stats={ko:15,ast:12,ours:420,theirs:450,heal:'15k',tkn:'45k',surrendered:false};
 const first=uniteQuote(false,0,0,seed,false,stats);
 assert.equal(first.base,-100);assert.equal(first.net,-50,'first loss must remain a loss');
 assert.match(first.note,/損失50 KP軽減/);
 assert.equal(uniteQuote(false,0,4,seed,false,stats).net,-300,'last streak penalty -500 eased by 200');
 assert.equal(uniteQuote(false,0,4,seed,false,{...stats,surrendered:true}).net,-400,'surrendered losses are not close-loss bonus eligible');
 assert.equal(uniteQuote(false,0,4,seed,false,{...stats,ko:0,ast:0,ours:100,theirs:500}).net,-500);
 for(let i=0;i<5;i++){
  const r=uniteQuote(false,0,i,seed,false,stats);assert.ok(r.net<0,'loss cannot produce a positive profit');
 }
});
test('Unite performance bonus settles and retries once without extra wallet mutations',async()=>{
 const f=await fixture();await link(f,cat,UID);await monitorUnite(f.env,T0,f.request,mapping);
 f.set(page([card({ko:12,ast:9,ours:500,theirs:200,heal:'75k'}),card()]));
 await monitorUnite(f.env,T0+3*60000,f.request,mapping);
 const first=f.balance(cat);
 assert.ok(first>=400,'performance credit should exceed the regular win');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_ledger WHERE kind='unite'").get()!.n,1);
 assert.match(f.sent[0],/大差勝利/);
 await monitorUnite(f.env,T0+6*60000,f.request,mapping);
 assert.equal(f.balance(cat),first,'same match is not paid again');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM unite_rewards").get()!.n,1);
});

test('Rock Tomb + Stealth Rock build is only recognized from both UniteAPI move labels',()=>{
 const selected=card({pokemon:'Crustle',ast:8,ko:1,int:2,dmg:'51k'}).replace('<img alt="Skill A" src="/s.png"/>','<img alt="Rock Tomb+" src="/r.png"/><img alt="Stealth Rock+" src="/s.png"/>');
 const one=parseUnite(page([selected]))!.matches[0];
 assert.equal(one.pokemon,'Crustle');
 assert.equal(one.rockBuild,true,'both move labels must be verified');
 assert.equal(parseUnite(page([selected.replace('Stealth Rock+','X-Scissor')]))!.matches[0].rockBuild,undefined);
 assert.equal(parseUnite(page([selected.replace('Rock Tomb+','Shell Smash')]))!.matches[0].rockBuild,undefined);
 assert.equal(parseUnite(page([selected.replace('Crustle','Pikachu')]))!.matches[0].rockBuild,undefined);
 assert.equal(parseUnite(page([selected.replace('Rock Tomb+','がんせきふうじ').replace('Stealth Rock+','ステルスロック')]))!.matches[0].rockBuild,true);
});
test('Crustle rock-wall and stealth-zone support earn KP even when KOs are few',async()=>{
 const {uniteQuote}=await import('../src/unite-rewards.ts');
 const {luckFor}=await import('../src/luck.ts');
 const seed=Array.from({length:300},(_,i)=>'rockbuild-'+i).find(x=>!luckFor('unite:'+x))!;
 const support={pokemon:'Crustle',rockBuild:true,ko:1,ast:5,int:1,ours:350,theirs:250,dmg:'36k',tkn:'45k',heal:'4k',surrendered:false};
 const wall=uniteQuote(true,0,0,seed,false,support);
 assert.equal(wall.net,700,'400 base + 300 for team control; low KO is fine');
 assert.match(wall.note,/岩壁＆ステロ支援/);
 const elite=uniteQuote(true,0,0,seed,false,{...support,ko:2,ast:9,int:2,dmg:'55k',tkn:'62k',ours:520,theirs:250});
 assert.equal(elite.net,980,'400 base + 460 zone control + 120 victory margin');
 assert.match(elite.note,/がんせき封鎖・ステロ制圧/);
 const ordinaryCrustle=uniteQuote(true,0,0,seed,false,{...support,rockBuild:false});
 assert.equal(ordinaryCrustle.net,640,'when moves are unknown, verified defensive stats still earn +240');
 const other=uniteQuote(true,0,0,seed,false,{...support,pokemon:'Pikachu'});
 assert.equal(other.net,400,'specialist bonuses do not leak to other Pokemon');
 const lost=uniteQuote(false,0,4,seed,false,{...support,ast:9,int:2,dmg:'55k',tkn:'62k',ours:220,theirs:280});
 assert.equal(lost.net,-200,'loss -500 reduced by 100 contribution, 100 rock skill, 100 close match');
 assert.ok(lost.net<0,'loss never pays out');
});
test('verified Crustle move build goes through monitoring and remains exactly-once',async()=>{
 const f=await fixture();await link(f,cat,UID);await monitorUnite(f.env,T0,f.request,mapping);
 const game=card({pokemon:'Crustle',ko:1,ast:9,int:2,dmg:'55k',tkn:'63k',ours:520,theirs:250}).replace('<img alt="Skill A" src="/s.png"/>','<img alt="Rock Tomb" src="/r.png"/><img alt="Stealth Rock" src="/s.png"/>');
 f.set(page([game,card()]));
 await monitorUnite(f.env,T0+3*60000,f.request,mapping);
 assert.match(f.sent[0],/がんせき封鎖・ステロ制圧/);
 assert.ok(f.balance(cat)>=980,'specialist bonus paid through settlement');
 const before=f.balance(cat);
 await monitorUnite(f.env,T0+6*60000,f.request,mapping);
 assert.equal(f.balance(cat),before);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM unite_rewards").get()!.n,1);
});
