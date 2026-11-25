// Fixed v4 field paths only. Missing or malformed observations stay unknown.
// No location, account names, credits or raw provider payload is retained.
export const CAST_KEYS=['grenade','ability1','ability2','ultimate'] as const;
export const WEAPONS=['Classic','Shorty','Frenzy','Ghost','Sheriff','Stinger','Spectre','Bucky','Judge','Bulldog','Guardian','Phantom','Vandal','Marshal','Outlaw','Operator','Ares','Odin','Melee'] as const;
const obj=(v:unknown):any=>v&&typeof v==='object'&&!Array.isArray(v)?v:null;
const integer=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
const read=(v:string|null):any=>{try{return v?JSON.parse(v):null}catch{return null}};
export type RoundContext={v:1;e?:{at:number;p:Array<{u:string;v:number}>};a?:{at:number;p:Array<{u:string;grenade?:number;ability1?:number;ability2?:number;ultimate?:number}>};plant?:{at:number;event:{u:string;t:number}|null};defuse?:{at:number;event:{u:string;t:number}|null}};
export function observedWeapon(raw:unknown):string|null{
 const name=obj(raw)?.name;
 if(typeof name!=='string'||name.length>40)return null;
 const key=name.toLowerCase();return WEAPONS.find(w=>w.toLowerCase()===key)??null;
}
export function compactAbilityCasts(raw:unknown,max=10000):Partial<Record<typeof CAST_KEYS[number],number>>|null{
 const a=obj(raw);if(!a)return null;
 const values=Object.fromEntries(CAST_KEYS.filter(k=>integer(a[k],max)).map(k=>[k,a[k]]));
 return Object.keys(values).length?values:null;
}
export function observedRoundSides(raw:unknown,teams:ReadonlySet<string>){
 const r=obj(raw),team=(v:unknown)=>typeof v==='string'&&teams.has(v)?v:null;
 let attack=team(r?.attacking_team),defense=team(r?.defending_team);
 const winner=team(r?.winning_team),role=typeof r?.winning_team_role==='string'&&r.winning_team_role.length<=16?r.winning_team_role.toLowerCase():null;
 const winnerAttack=role==='attack'||role==='attacker',winnerDefense=role==='defense'||role==='defender';
 if(teams.size!==2||[...teams].some(t=>typeof t!=='string'||!t.length||t.length>80)||attack&&attack===defense)return {attack:null,defense:null,derived:false};
 if(attack||defense){
  if(winner&&(winnerAttack||winnerDefense)&&((attack&&attack!==(winnerAttack?winner:[...teams].find(t=>t!==winner)))||(defense&&defense!==(winnerDefense?winner:[...teams].find(t=>t!==winner)))))return {attack:null,defense:null,derived:false};
  return {attack,defense,derived:false};
 }
 if((r?.attacking_team!==null&&r?.attacking_team!==undefined)||(r?.defending_team!==null&&r?.defending_team!==undefined)||!winner||!winnerAttack&&!winnerDefense)return {attack:null,defense:null,derived:false};
 const other=[...teams].find(t=>t!==winner)!;attack=winnerAttack?winner:other;defense=winnerDefense?winner:other;
 return {attack,defense,derived:true};
}
export function compactRoundContext(raw:unknown,teams:ReadonlyMap<string,string>,now:number):RoundContext|null{
 const r=obj(raw);if(!r||!integer(now)||now<=0)return null;
 const result:RoundContext={v:1};
 const stats=r.stats;
 if(Array.isArray(stats)&&stats.length>0&&stats.length<=10&&stats.every(s=>typeof obj(s)?.player?.puuid==='string'&&teams.has(s.player.puuid))&&new Set(stats.map(s=>s.player.puuid)).size===stats.length){
  const economy=stats.flatMap(s=>integer(obj(s.economy)?.loadout_value,50000)?[{u:s.player.puuid,v:s.economy.loadout_value}]:[]);
  if(economy.length)result.e={at:now,p:economy};
  const abilities=stats.flatMap(s=>{const values=compactAbilityCasts(s.ability_casts,200);return values?[{u:s.player.puuid,...values}]:[];});
  if(abilities.length)result.a={at:now,p:abilities};
 }
 for(const kind of ['plant','defuse'] as const){
  if(!Object.hasOwn(r,kind))continue;
  if(r[kind]===null){result[kind]={at:now,event:null};continue;}
  const event=obj(r[kind]),id=event?.player?.puuid,side=kind==='plant'?r.attacking_team:r.defending_team;
  if(typeof id==='string'&&teams.has(id)&&integer(event?.round_time_in_ms,900000)&&(!teamsHasSide(teams,side)||teams.get(id)===side))result[kind]={at:now,event:{u:id,t:event.round_time_in_ms}};
 }
 return Object.keys(result).length>1?result:null;
}
function teamsHasSide(teams:ReadonlyMap<string,string>,side:unknown):side is string{return typeof side==='string'&&[...teams.values()].includes(side);}
export function mergeRoundContexts(previous:string|null,incoming:string|null){
 if(previous===null)return {json:incoming,compatible:true};
 const old=read(previous),fresh=read(incoming);
 if(!Array.isArray(old)||!Array.isArray(fresh)||old.length!==fresh.length||!old.every((r,i)=>obj(r)&&obj(fresh[i])&&['r','winner'].every(k=>r[k]===fresh[i][k])&&['attack','defense'].every(k=>r[k]==null||fresh[i][k]==null||r[k]===fresh[i][k])))return {json:previous,compatible:false};
 if(old.some((r,i)=>{const a=r.attack??fresh[i].attack,d=r.defense??fresh[i].defense;return a!=null&&a===d;}))return {json:previous,compatible:false};
 let changed=false;
 const merged=old.map((r,i)=>{
  const n=fresh[i];let copy=r;
  for(const key of ['attack','defense'])if(r[key]==null&&n[key]!=null){copy={...copy,[key]:n[key],...(n.sideSource==='winner-role'?{sideSource:'winner-role'}:{})};changed=true;}
  if(r.context===undefined&&n.context?.v===1){copy={...copy,context:n.context};changed=true;}
  else if(r.context?.v===1&&n.context?.v===1){
   for(const key of ['e','a','plant','defuse'])if(r.context[key]===undefined&&n.context[key]!==undefined){copy={...copy,context:{...copy.context,[key]:n.context[key]}};changed=true;}
  }
  if(i===0&&r.contextSchema===undefined&&n.contextSchema===1){copy={...copy,contextSchema:1};changed=true;}
  if(i===0&&r.contextOmitted===undefined&&n.contextOmitted==='size-cap'){copy={...copy,contextOmitted:'size-cap'};changed=true;}
  return copy;
 });
 if(!changed)return {json:previous,compatible:true};
 const encoded=JSON.stringify(merged),core=JSON.stringify(merged.map(({context,...r})=>r));
 if(new TextEncoder().encode(encoded).length-new TextEncoder().encode(core).length>65536){
  // A succession of partial snapshots must not grow past the same limit.
  // Preserve known contexts and record that new domains could not be added.
  const limited=merged.map(({context,...r},i)=>({...r,...(old[i].context===undefined?{}:{context:old[i].context}),...(i===0?{contextOmitted:'size-cap'}:{})}));
  return {json:JSON.stringify(limited),compatible:true};
 }
 return {json:encoded,compatible:true};
}

type Row={match_id:string;players_json:string;teams_json:string|null;rounds_json:string|null;kills_json:string|null;events_recorded_at?:number|null};
type Account={name:string;tag:string;puuid:string|null};
export function coachRoundContext(rows:readonly Row[],accounts:readonly Account[],verifiedCombat:ReadonlySet<string>){
 const bands=['under1000','1000to3999','4000plus'].map(key=>({key,rounds:0,knownOutcomes:0,wins:0,combatRounds:0,kills:0,deaths:0}));
 const time=()=>({recordedAt:null as {oldest:number;newest:number}|null});
 const matchAbilities=Object.fromEntries(CAST_KEYS.map(k=>[k,{casts:0,matches:0,rateCasts:0,rounds:0,rateMatches:0,...time()}])) as Record<typeof CAST_KEYS[number],{casts:number;matches:number;rateCasts:number;rounds:number;rateMatches:number;recordedAt:{oldest:number;newest:number}|null}>;
 const abilities=Object.fromEntries(CAST_KEYS.map(k=>[k,{casts:0,rounds:0,matches:0,...time()}])) as Record<typeof CAST_KEYS[number],{casts:number;rounds:number;matches:number;recordedAt:{oldest:number;newest:number}|null}>;
 const spike={plant:{events:0,rounds:0,matches:0,...time()},defuse:{events:0,rounds:0,matches:0,...time()}};
 const quality={candidateMatches:rows.length,validRoundMatches:0,candidateRounds:0,sideSources:{winnerRole:0,explicitOrLegacy:0,unknown:0},contextSizeCapMatches:0,metricCoverage:[] as Array<{metric:string;source:string;matches:number;valid:number;excluded:number;numerator:number;denominator:number;unit:string;recordedAt:{oldest:number;newest:number}|null}>,excluded:{} as Record<string,number>,economy:{matches:0,rounds:0,loadoutTotal:0,recordedAt:null as {oldest:number;newest:number}|null},abilities:{matches:0,rounds:0,recordedAt:null as {oldest:number;newest:number}|null}};
 const weapons={knownKills:0,totalKills:0,matches:0,validMatches:0,counts:[] as Array<{weapon:string;kills:number}>,...time()};const weaponCounts=new Map<string,number>();
 const pistols={definition:'competitiveの0・12番R（通常の規定ピストルR）。延長を含む全ラウンドの装備ルールを推測しない。',rounds:0,knownOutcomes:0,wins:0,kills:0,deaths:0};
 const seen=new Set<string>();let lowWithArmedPeers=0,peerComparableRounds=0,pistolCandidateRounds=0,pistolMatches=0;const pistolTime=time();
 const reject=(key:string)=>{quality.excluded[key]=(quality.excluded[key]??0)+1;};
 const stamp=(metric:{recordedAt:{oldest:number;newest:number}|null},at:number)=>{metric.recordedAt=metric.recordedAt?{oldest:Math.min(metric.recordedAt.oldest,at),newest:Math.max(metric.recordedAt.newest,at)}:{oldest:at,newest:at};};
 for(const row of rows){
  if(seen.has(row.match_id)){reject('duplicate-match');continue;}seen.add(row.match_id);
  const ps=read(row.players_json),ts=read(row.teams_json),rs=read(row.rounds_json),ks=read(row.kills_json);
  if(!Array.isArray(ps)||ps.length!==10||!Array.isArray(ts)||ts.length!==2){reject('missing-roster');continue;}
  const ids=new Map<string,any>(ps.map(p=>[p?.puuid,p]));
  const own=ps.filter(p=>accounts.some(a=>a.puuid?p?.puuid===a.puuid:p?.name===a.name&&p?.tag===a.tag));
  if(own.length!==1||ids.size!==10||ps.some(p=>typeof p?.puuid!=='string'||!p.puuid)||new Set(ts.map(t=>t?.id)).size!==2||ts.some(t=>typeof t?.id!=='string'||ps.filter(p=>p.team_id===t.id).length!==5)){reject('invalid-roster');continue;}
  const p=own[0],totalRounds=ts.every(t=>integer(t.rounds,60))?ts[0].rounds+ts[1].rounds:0;
  const matchRounds=totalRounds>0&&totalRounds<=60&&(rs===null||Array.isArray(rs)&&(!rs.length||rs.length===totalRounds&&new Set(rs.map(r=>r?.r)).size===rs.length&&rs.every(r=>integer(r?.r,60))))?totalRounds:null;
  for(const key of CAST_KEYS)if(integer(obj(p.casts)?.[key],10000)){
   const a=matchAbilities[key];a.matches++;a.casts+=p.casts[key];if(integer(p.castsAt)&&p.castsAt>0)stamp(a,p.castsAt);
   if(matchRounds!==null){a.rateMatches++;a.rateCasts+=p.casts[key];a.rounds+=matchRounds;}
  }
  if(!Array.isArray(rs)||!rs.length||rs.length>60||matchRounds===null||totalRounds!==rs.length){reject('missing-or-inconsistent-rounds');continue;}
  const teams=new Set(ts.map(t=>t.id)),combat=verifiedCombat.has(row.match_id)&&Array.isArray(ks),zeroBased=rs.every((r,i)=>r.r===i);
  const outcomesValid=ts.every(t=>rs.filter(r=>r.winner===t.id).length<=t.rounds);
  if(!outcomesValid)reject('round-outcomes-do-not-match-team');
  quality.validRoundMatches++;quality.candidateRounds+=rs.length;
  for(const r of rs){const known=r.attack!==r.defense&&(r.attack===p.team_id||r.defense===p.team_id);quality.sideSources[!known?'unknown':r.sideSource==='winner-role'?'winnerRole':'explicitOrLegacy']++;}
  if(rs[0]?.contextOmitted==='size-cap')quality.contextSizeCapMatches++;
  if(zeroBased){pistolCandidateRounds+=rs.filter(r=>r.r===0||r.r===12).length;if(combat){pistolMatches++;if(integer(row.events_recorded_at)&&row.events_recorded_at>0)stamp(pistolTime,row.events_recorded_at);}}
  const ownKills=combat?ks.filter(k=>k?.killer===p.puuid&&ids.get(k.victim)?.team_id!==p.team_id):[];
  const ownDeaths=combat?ks.filter(k=>k?.victim===p.puuid):[];
  if(combat){weapons.matches++;weapons.totalKills+=ownKills.length;for(const k of ownKills)if(WEAPONS.includes(k.w)){weapons.knownKills++;weaponCounts.set(k.w,(weaponCounts.get(k.w)??0)+1);if(integer(k.wAt)&&k.wAt>0)stamp(weapons,k.wAt);}}
  if(combat&&ownKills.some(k=>WEAPONS.includes(k.w)))weapons.validMatches++;
  let economyMatch=false;const spikeSeen=new Set<string>();
  const localAbilities=Object.fromEntries(CAST_KEYS.map(k=>[k,{casts:0,ids:new Set<number>(),...time()}])) as Record<typeof CAST_KEYS[number],{casts:number;ids:Set<number>;recordedAt:{oldest:number;newest:number}|null}>;
  for(const r of rs){
   const winKnown=outcomesValid&&teams.has(r.winner),kills=ownKills.filter(k=>k.r===r.r).length,deaths=ownDeaths.filter(k=>k.r===r.r).length;
   if(zeroBased&&combat&&(r.r===0||r.r===12)){pistols.rounds++;pistols.kills+=kills;pistols.deaths+=deaths;if(winKnown){pistols.knownOutcomes++;if(r.winner===p.team_id)pistols.wins++;}}
   const c=r.context;if(c?.v!==1)continue;
   const validRows=(d:any)=>integer(d?.at)&&d.at>0&&Array.isArray(d.p)&&d.p.length<=10&&new Set(d.p.map((s:any)=>s?.u)).size===d.p.length&&d.p.every((s:any)=>typeof s?.u==='string'&&ids.has(s.u));
   if(validRows(c.e)){
    const ownE=c.e.p.find((s:any)=>s.u===p.puuid);
    if(integer(ownE?.v,50000)){
     economyMatch=true;quality.economy.rounds++;quality.economy.loadoutTotal+=ownE.v;stamp(quality.economy,c.e.at);
     const b=bands[ownE.v<1000?0:ownE.v<4000?1:2];b.rounds++;if(winKnown){b.knownOutcomes++;if(r.winner===p.team_id)b.wins++;}if(combat){b.combatRounds++;b.kills+=kills;b.deaths+=deaths;}
     const peers=ps.filter(x=>x.team_id===p.team_id&&x.puuid!==p.puuid).map(x=>c.e.p.find((s:any)=>s.u===x.puuid)?.v);
     if(peers.every(x=>integer(x,50000))){peerComparableRounds++;if(ownE.v<1000&&peers.reduce((a,b)=>a+b,0)/4>=4000)lowWithArmedPeers++;}
    }
   }
   if(validRows(c.a)){
    const ownA=c.a.p.find((s:any)=>s.u===p.puuid);
    for(const key of CAST_KEYS)if(integer(ownA?.[key],200)){localAbilities[key].ids.add(r.r);localAbilities[key].casts+=ownA[key];stamp(localAbilities[key],c.a.at);}
   }
   for(const kind of ['plant','defuse'] as const){
    const d=c[kind];if(!integer(d?.at)||d.at<=0||!Object.hasOwn(d,'event'))continue;
    const ev=d.event,side=kind==='plant'?r.attack:r.defense;
    if(ev!==null&&(!ids.has(ev?.u)||!integer(ev?.t,900000)||teams.has(side)&&ids.get(ev.u).team_id!==side))continue;
    spike[kind].rounds++;spikeSeen.add(kind);stamp(spike[kind],d.at);if(ev?.u===p.puuid)spike[kind].events++;
   }
  }
  if(economyMatch)quality.economy.matches++;
  const abilityRounds=new Set<number>();
  for(const key of CAST_KEYS){
   const local=localAbilities[key];if(!local.ids.size)continue;
   if(local.ids.size===rs.length&&integer(obj(p.casts)?.[key],10000)&&local.casts!==p.casts[key]){reject('round-cast-total-mismatch:'+key);continue;}
   abilities[key].matches++;abilities[key].rounds+=local.ids.size;abilities[key].casts+=local.casts;
   for(const id of local.ids)abilityRounds.add(id);
   if(local.recordedAt){stamp(abilities[key],local.recordedAt.oldest);stamp(abilities[key],local.recordedAt.newest);stamp(quality.abilities,local.recordedAt.oldest);stamp(quality.abilities,local.recordedAt.newest);}
  }
  if(abilityRounds.size){quality.abilities.matches++;quality.abilities.rounds+=abilityRounds.size;}
  for(const key of spikeSeen)spike[key as 'plant'|'defuse'].matches++;
 }
 quality.metricCoverage=[{metric:'装備額',source:'rounds.stats.economy.loadout_value',matches:quality.economy.matches,valid:quality.economy.rounds,excluded:quality.candidateRounds-quality.economy.rounds,numerator:quality.economy.loadoutTotal,denominator:quality.economy.rounds,unit:'R',recordedAt:quality.economy.recordedAt},
 ...CAST_KEYS.map(key=>({metric:'スキル（R） '+key,source:'rounds.stats.ability_casts.'+key,matches:abilities[key].matches,valid:abilities[key].rounds,excluded:quality.candidateRounds-abilities[key].rounds,numerator:abilities[key].casts,denominator:abilities[key].rounds,unit:'R',recordedAt:abilities[key].recordedAt})),
 ...CAST_KEYS.map(key=>({metric:'スキル（試合） '+key,source:'players.ability_casts.'+key,matches:matchAbilities[key].matches,valid:matchAbilities[key].matches,excluded:rows.length-matchAbilities[key].matches,numerator:matchAbilities[key].casts,denominator:matchAbilities[key].matches,unit:'試合',recordedAt:matchAbilities[key].recordedAt})),
 ...(['plant','defuse'] as const).map(key=>({metric:key==='plant'?'設置':'解除',source:'rounds.'+key+'.player / round_time_in_ms',matches:spike[key].matches,valid:spike[key].rounds,excluded:quality.candidateRounds-spike[key].rounds,numerator:spike[key].events,denominator:spike[key].rounds,unit:'R',recordedAt:spike[key].recordedAt})),
 {metric:'撃破手段',source:'verified kills.weapon.name',matches:weapons.validMatches,valid:weapons.knownKills,excluded:weapons.totalKills-weapons.knownKills,numerator:weapons.knownKills,denominator:weapons.totalKills,unit:'敵キル',recordedAt:weapons.recordedAt},
 {metric:'通常ピストルR勝敗',source:'competitive round id 0/12 + verified kills',matches:pistolMatches,valid:pistols.rounds,excluded:pistolCandidateRounds-pistols.rounds,numerator:pistols.wins,denominator:pistols.knownOutcomes,unit:'R',recordedAt:pistolTime.recordedAt}];
 weapons.counts=[...weaponCounts].map(([weapon,kills])=>({weapon,kills})).sort((a,b)=>b.kills-a.kills||a.weapon.localeCompare(b.weapon));
 const notes=peerComparableRounds>=20&&lowWithArmedPeers>=5?[{category:'装備の合わせ方',status:'context',title:'味方と装備額が離れたラウンド',evidence:`本人の装備額1,000未満・同チームの他4人平均4,000以上が${lowWithArmedPeers}/${peerComparableRounds}R。`,nextAction:'該当試合の録画で、購入忘れ・武器の受け渡し・意図した節約のどれだったか確認する。',reason:'記録された装備額の関連記録。残高・購入指示・VC・武器受け渡しの意図を取得しておらず、金額だけで判断ミスとは断定しない。'}]:[];
 return {quality,bands,abilities,matchAbilities,spike,weapons,pistols,peerComparableRounds,lowWithArmedPeers,notes,limitations:['装備額別の区分は独自の参考区分。所持金・購入意図を含む公式のエコ/フルバイ判定ではない。','スキルの使用回数から有効性やスキル由来アシストを断定しない。','武器別は確認できた敵キルの内訳。発射数・命中率・ダメージ効率は未取得。','設置/解除の記録とチーム勝敗だけで個人の因果的貢献を決めない。']};
}
