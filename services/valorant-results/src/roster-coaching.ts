// Read-only coaching statistics from archived competitive rosters.
// No Henrik calls, Discord posts, player registration, or KP mutations.
type Outcome='win'|'loss'|'draw';
export interface ArchivedCoachingRow {
  match_id:string; outcome:Outcome; map:string|null; players_json:string;
}
type Member={puuid?:string|null;name?:string|null;tag?:string|null;team_id?:string|null;party_id?:string|null;
  k?:number|null;d?:number|null;a?:number|null};
type Count={win:number;loss:number;draw:number};
const empty=():Count=>({win:0,loss:0,draw:0});
const add=(c:Count,v:Outcome)=>{if(v in c)c[v]++;};
const normalize=(s:string)=>s.trim().toLowerCase();
const memberId=(m:Member)=>normalize((m.name??'')+'#'+(m.tag??''));
const isRecord=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const asMembers=(s:string):Member[]=>{
  try {const x:unknown=JSON.parse(s);return Array.isArray(x)?x.filter(isRecord) as Member[]:[];}
  catch{return [];}
};
export interface CoachingSummary{
  totalRows:number; analyzed:number; missingIdentity:number;
  overall:Count; recentTen:Count; previousTen:Count; partySizes:Record<string,number>;
  partyResults:Record<string,Count>;
  kd:{kills:number;deaths:number;assists:number;games:number};
  maps:{name:string;games:number;result:Count}[];
  partner?:{id:string;withTeam:Count;withParty:Count;opponent:Count;without:Count;
    teamGames:number;partyGames:number;unknownPartyGames:number};
}
export function analyzeArchivedCoaching(rows:ArchivedCoachingRow[],riotId:string,puuid:string|null,
 companionRiotId?:string|null):CoachingSummary{
  const wanted=normalize(riotId),other=companionRiotId?normalize(companionRiotId):null;
  const knownCompanions=new Set<string>(),seen=new Set<string>();
  // Match-by-match name/tag establishes identity; the same PUUID persists across renamed accounts.
  if(other)for(const row of rows){
    for(const m of asMembers(row.players_json))
      if(memberId(m)===other&&m.puuid)knownCompanions.add(m.puuid);
  }
  const mapCounts=new Map<string,{games:number;result:Count}>();
  const result:CoachingSummary={totalRows:rows.length,analyzed:0,missingIdentity:0,
    overall:empty(),recentTen:empty(),previousTen:empty(),partySizes:{},partyResults:{},
    kd:{kills:0,deaths:0,assists:0,games:0},maps:[]};
  if(other)result.partner={id:companionRiotId!,withTeam:empty(),withParty:empty(),
    opponent:empty(),without:empty(),teamGames:0,partyGames:0,unknownPartyGames:0};
  for(const row of rows){
    if(seen.has(row.match_id))continue;
    seen.add(row.match_id);
    const players=asMembers(row.players_json);
    const subject=players.find(p=>Boolean(puuid)&&p.puuid===puuid)
       ??players.find(p=>memberId(p)===wanted);
    if(!subject||!subject.team_id||!['win','loss','draw'].includes(row.outcome)){
      result.missingIdentity++;continue;
    }
    result.analyzed++;add(result.overall,row.outcome);
    if(result.analyzed<=10)add(result.recentTen,row.outcome);
    else if(result.analyzed<=20)add(result.previousTen,row.outcome);
    const ownParty=subject.party_id;
    if(ownParty){
      const size=players.filter(p=>p.team_id===subject.team_id&&p.party_id===ownParty).length;
      const k=String(size);result.partySizes[k]=(result.partySizes[k]??0)+1;
      result.partyResults[k]??=empty();add(result.partyResults[k],row.outcome);
    }else {
      result.partySizes['unknown']=(result.partySizes['unknown']??0)+1;
      result.partyResults['unknown']??=empty();add(result.partyResults['unknown'],row.outcome);
    }
    if([subject.k,subject.d,subject.a].every(x=>Number.isSafeInteger(x)&&x!>=0)){
      result.kd.games++;result.kd.kills+=subject.k!;result.kd.deaths+=subject.d!;result.kd.assists+=subject.a!;
    }
    const map=row.map&&row.map.length<=80?row.map:'不明';
    const m=mapCounts.get(map)??{games:0,result:empty()};
    m.games++;add(m.result,row.outcome);mapCounts.set(map,m);
    if(other&&result.partner){
      const partner=players.find(p=>Boolean(p.puuid)&&knownCompanions.has(p.puuid!))
        ??players.find(p=>memberId(p)===other);
      if(!partner){add(result.partner.without,row.outcome);continue;}
      if(partner.team_id!==subject.team_id){add(result.partner.opponent,row.outcome);continue;}
      result.partner.teamGames++;add(result.partner.withTeam,row.outcome);
      if(ownParty&&partner.party_id&&ownParty===partner.party_id){
        result.partner.partyGames++;add(result.partner.withParty,row.outcome);
      }else if(!ownParty||!partner.party_id)result.partner.unknownPartyGames++;
    }
  }
  result.maps=[...mapCounts].map(([name,v])=>({name,...v}))
    .sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name));
  return result;
}
const score=(c:Count)=>`${c.win}勝${c.loss}敗${c.draw}分`;
const rate=(c:Count)=>{
  const n=c.win+c.loss;return n?`${(100*c.win/n).toFixed(1)}%`:'—';
};
const label=(s:string)=>s.replace(/[\r\n\x00-\x1f`*_~|<>@]/g,'').slice(0,70);
export async function archivedCoachingReport(db:D1Database,riotId:string,companion?:string|null):Promise<string>{
  const account=await db.prepare('SELECT puuid FROM tracked_players WHERE riot_id=?').bind(riotId).first<{puuid:string|null}>();
  if(!account)return '登録済みの監視対象を選択してください。';
  let rows:ArchivedCoachingRow[];
  try {
    rows=(await db.prepare(`SELECT n.match_id,n.outcome,r.map,r.players_json FROM notifications n
      JOIN valorant_match_rosters r ON r.match_id=n.match_id
      WHERE n.riot_id=? AND n.mode='competitive' AND n.outcome IN ('win','loss','draw')
      ORDER BY n.ended_at DESC,n.match_id DESC LIMIT 150`).bind(riotId).all<ArchivedCoachingRow>()).results;
  }catch(e){
    if(/no such table: valorant_match_rosters/i.test(String(e)))
      return '試合参加者の保存テーブルがまだ利用できません。';
    throw e;
  }
  if(!rows.length)return 'まだ分析可能なコンペ試合の参加者記録がありません。速報の履歴とは別に保存しています。';
  const r=analyzeArchivedCoaching(rows,riotId,account.puuid,companion);
  if(!r.analyzed)return '保存した参加者の中に対象者のIDが確認できません。データを確認してください。';
  const party=Object.entries(r.partySizes).sort(([a],[b])=>a.localeCompare(b,'ja',{numeric:true}))
    .map(([n,c])=>(n==='unknown'?'パーティー不明':n+'人')+':'+c).join(' / ');
  const isVdk=normalize(riotId)==='dolly#sdgs';
  const lines=[isVdk?'🎯 VDK専用コーチング｜Dolly#SDGs（コンペ）':`🎯 コーチング資料｜${label(riotId)}（コンペ）`,
    `保存済み ${r.analyzed}試合：${score(r.overall)}｜勝率${rate(r.overall)}（引分除く）`,
    `パーティー人数：${party}`];
  if(r.kd.games)lines.push(`K/D ${r.kd.deaths?(r.kd.kills/r.kd.deaths).toFixed(2):'—'}｜平均K/A/D ${(r.kd.kills/r.kd.games).toFixed(1)}/${(r.kd.assists/r.kd.games).toFixed(1)}/${(r.kd.deaths/r.kd.games).toFixed(1)}（${r.kd.games}試合）`);
  if(r.partner){
    const p=r.partner;
    lines.push(`🤝 ${label(p.id)} と同チーム：${score(p.withTeam)}｜勝率${rate(p.withTeam)}（${p.teamGames}試合）`,
      `同一パーティー確認：${p.partyGames}試合${p.unknownPartyGames?'（組み方不明 '+p.unknownPartyGames+'試合）':''}`,
      `対戦：${score(p.opponent)}｜不在：${score(p.without)}`);
  }
  if(r.maps.length)lines.push('マップ上位：'+r.maps.slice(0,3).map(m=>`${label(m.name)} ${m.games}戦 ${score(m.result)}`).join(' / '));
  if(isVdk){
    lines.push('📝 VDKの改善検証ポイント（保存データから抽出）');
    const weak=r.maps.filter(m=>m.name!=='不明'&&m.games>=4&&(m.result.win+m.result.loss)>=4&&m.result.win/(m.result.win+m.result.loss)<0.4)
      .sort((a,b)=>a.result.win/(a.result.win+a.result.loss)-b.result.win/(b.result.win+b.result.loss)||b.games-a.games)
      .slice(0,2);
    if(weak.length)lines.push('・マップ重点確認：'+weak.map(m=>`${label(m.name)} ${score(m.result)}（${rate(m.result)}）`).join('、')+'。攻守別の序盤・人数有利時の落とし方を録画で確認。');
    if(r.analyzed>=20)lines.push(`・直近10試合：${score(r.recentTen)}（${rate(r.recentTen)}）。その前10試合：${score(r.previousTen)}（${rate(r.previousTen)}）。短期変動を確認。`);
    const solo=r.partyResults['1'],party=Object.entries(r.partyResults).filter(([size])=>size!=='1'&&size!=='unknown');
    if(solo&&solo.win+solo.loss>=5&&party.length){
      const group=empty();for(const [,c]of party){group.win+=c.win;group.loss+=c.loss;group.draw+=c.draw;}
      if(group.win+group.loss>=5)lines.push(`・構成別：ソロ ${score(solo)}（${rate(solo)}）、複数人 ${score(group)}（${rate(group)}）。対戦条件の違いに注意しつつ検証。`);
    }
    if(!weak.length)lines.push('・失点の多かったラウンドを3件選び、初動死亡・トレード・設置後の立ち位置をリプレイで確認。');
    lines.push('次に必要な詳細：ラウンド別の初動・トレード・攻守・購入とウルト使用。現在の保存データだけでは原因を断定しません。');
  }
  lines.push(`対象IDを特定できない記録：${r.missingIdentity}件`,
    '※保存済みの直近最大150試合のみ。未記録試合は含まず、勝率差を相性・原因と断定しません。',
    '※参加者情報のみでは初動、復活、位置取り、交戦判断は判定できません。API追加取得・速報・KP付与は行いません。');
  return lines.join('\n');
}
