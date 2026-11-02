// Read-only HoYoverse showcase integration. No KP ledger writes and no background polling.
// Enka UID lookup DOES NOT prove ownership, so these profiles cannot award KP.
export type HoyoGame = 'genshin' | 'starrail' | 'zzz';
export interface HoyoOwner { guild: string; user: string }
export interface HoyoEnv { DB: D1Database }
export interface HoyoCharacter { id: string; level: number; promotion: number; copies: number }
export interface HoyoSnapshot { nickname: string; accountLevel: number | null; achievements: number | null; characters: HoyoCharacter[] }
export interface HoyoLink { game: HoyoGame; uid: string; snapshot: HoyoSnapshot; changes: string[]; updatedAt: number; nextAt: number }
const games: Record<HoyoGame,string> = {genshin:'原神',starrail:'崩壊：スターレイル',zzz:'ゼンレスゾーンゼロ'};
const routes: Record<HoyoGame,string> = {genshin:'uid',starrail:'hsr/uid',zzz:'zzz/uid'};
const schema = [
 'CREATE TABLE IF NOT EXISTS kp_hoyo_profiles (guild TEXT NOT NULL,user TEXT NOT NULL,game TEXT NOT NULL,uid TEXT NOT NULL,snapshot TEXT NOT NULL,changes TEXT NOT NULL,updated_at INTEGER NOT NULL,next_at INTEGER NOT NULL,PRIMARY KEY(guild,user,game))',
 'CREATE TABLE IF NOT EXISTS kp_hoyo_limits (guild TEXT NOT NULL,user TEXT NOT NULL,window INTEGER NOT NULL,hits INTEGER NOT NULL,PRIMARY KEY(guild,user,window))'
];
const ready = new WeakMap<object,Promise<void>>();
async function ensure(env:HoyoEnv):Promise<void> {
 let job=ready.get(env.DB);
 if(!job){job=env.DB.batch(schema.map(sql=>env.DB.prepare(sql))).then(()=>{});ready.set(env.DB,job);job.catch(()=>ready.delete(env.DB));}
 await job;
}
function checkGame(value:unknown):HoyoGame {
 if(value==='genshin'||value==='starrail'||value==='zzz')return value;
 throw Error('ゲームを選び直してください。');
}
function checkUid(value:unknown):string {
 if(typeof value!=='string'||!/^[0-9]{8,12}$/.test(value))throw Error('UIDは8〜12桁の数字で入力してください。');
 return value;
}
function rec(value:any):Record<string,any> { return value && typeof value==='object'&&!Array.isArray(value)?value:{}; }
function int(value:any):number|null {
 const n=typeof value==='string'&&/^[0-9]{1,10}$/.test(value)?Number(value):value;
 return Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:null;
}
function name(value:any):string {
 return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,48):'';
}
function charactersOf(game:HoyoGame,source:Record<string,any>,info:Record<string,any>):HoyoCharacter[] {
 const detail=rec(source.PlayerInfo);
 const list=game==='zzz'?(rec(detail.ShowcaseDetail).AvatarList??source.AvatarList??[])
 :source.avatarInfoList??rec(source.detailInfo).avatarInfoList??info.showAvatarInfoList??[];
 if(!Array.isArray(list))return [];
 const characters: HoyoCharacter[]=[];const seen=new Set<string>();
 for(const item of list.slice(0,100)){
  const a=rec(item);
  const identifier=a.avatarId??a.avatarID??a.Id??a.id;
  if(!Number.isSafeInteger(Number(identifier))||String(identifier).length>12)continue;
  const id=String(identifier);if(seen.has(id))continue;seen.add(id);
  const level=int(a.Level??a.level??rec(a.propMap)?.['4001']?.val)??0;
  const promotion=int(a.PromotionLevel??a.promotion??rec(a.propMap)?.['1002']?.val)??0;
  const copies=int(a.TalentLevel??a.rank??a.eidolon??(Array.isArray(a.talentIdList)?a.talentIdList.length:0))??0;
  characters.push({id,level,promotion,copies});
 }
 return characters.sort((a,b)=>b.level-a.level||a.id.localeCompare(b.id)).slice(0,40);
}
export function normalizeHoyo(game:HoyoGame,uid:string,raw:unknown):{snapshot:HoyoSnapshot;ttl:number}{
 const source=rec(raw),info=rec(source.playerInfo??source.detailInfo??source.PlayerInfo);
 if(!Object.keys(info).length)throw Error('公開プロフィールを取得できません。公開設定を確認してください。');
 const detail=rec(info.SocialDetail);
 const base=game==='zzz'?rec(detail.ProfileDetail):info;
 const uidInResponse=source.uid??base.Uid??base.uid;
 if(uidInResponse!==undefined&&String(uidInResponse)!==uid)throw Error('取得したUIDが一致しません。');
 const snapshot:HoyoSnapshot={
  nickname:name(base.Nickname??base.nickname??source.nickname)||games[game]+' プレイヤー',
  accountLevel:int(base.Level??base.level),
  achievements:game==='genshin'?int(base.finishAchievementNum):null,
  characters:charactersOf(game,source,info)
 };
 const ttl=int(source.ttl)??600;
 return {snapshot,ttl:Math.max(300,Math.min(3600,ttl))};
}
export function changesHoyo(old:HoyoSnapshot,next:HoyoSnapshot):string[]{
 const changes:string[]=[];
 if(old.accountLevel!==null&&next.accountLevel!==null&&next.accountLevel>old.accountLevel)changes.push('プレイヤーレベル '+old.accountLevel+' → '+next.accountLevel);
 if(old.achievements!==null&&next.achievements!==null&&next.achievements>old.achievements)changes.push('公開実績数 +'+(next.achievements-old.achievements));
 const prior=new Map(old.characters.map(c=>[c.id,c]));
 for(const c of next.characters){
  const p=prior.get(c.id);
  if(!p){changes.push('展示キャラ '+c.id+' が公開欄に登場');continue;}
  if(c.level>p.level)changes.push('キャラ '+c.id+' Lv.'+p.level+' → '+c.level);
  if(c.copies>p.copies)changes.push('キャラ '+c.id+' 凸数 '+p.copies+' → '+c.copies);
 }
 return changes.slice(0,12);
}
async function readUpstream(game:HoyoGame,uid:string,send:typeof fetch=fetch) {
 const url='https://enka.network/api/'+routes[game]+'/'+uid+'/';
 let response:Response;
 try{response=await send(url,{headers:{'User-Agent':'KesoPlay-HoyoShowcase/1.0 (read-only; small community)'},redirect:'manual',signal:AbortSignal.timeout(10000)});}
 catch{throw Error('公開プロフィールへの接続に失敗しました。後ほどお試しください。');}
 if(response.status===429)throw Error('データ取得元が混雑しています。しばらく待ってください。');
 if(response.status===404)throw Error('UIDが見つかりません。ゲームとUIDを確認してください。');
 if(!response.ok)throw Error('公開プロフィールを取得できません（'+response.status+'）。');
 // Bound memory/CPU even if an upstream server ignores Content-Length.
 const reader=response.body?.getReader();if(!reader)throw Error('公開データを読み取れません。');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
   if(size>1024*1024){await reader.cancel();throw Error('公開データが大きすぎます。');}
   chunks.push(part.value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return normalizeHoyo(game,uid,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }catch(error){if(error instanceof Error&&/[ぁ-んァ-ヶ一-龯]/.test(error.message))throw error;throw Error('公開プロフィールの形式を読み取れません。');}
}
async function limit(env:HoyoEnv,owner:HoyoOwner){
 const hour=Math.floor(Date.now()/3600000);
 const row=await env.DB.prepare('INSERT INTO kp_hoyo_limits(guild,user,window,hits) VALUES(?,?,?,1) ON CONFLICT(guild,user,window) DO UPDATE SET hits=hits+1 RETURNING hits').bind(owner.guild,owner.user,hour).first<{hits:number}>();
 if(!row||row.hits>8)throw Error('確認回数が多いため、1時間ほど待ってください。');
}
type LinkRow={game:HoyoGame;uid:string;snapshot:string;changes:string;updated_at:number;next_at:number};
function present(row:LinkRow):HoyoLink{
 return {game:row.game,uid:row.uid,snapshot:JSON.parse(row.snapshot),changes:JSON.parse(row.changes),updatedAt:row.updated_at,nextAt:row.next_at};
}
async function list(env:HoyoEnv,owner:HoyoOwner):Promise<HoyoLink[]>{
 const rows=await env.DB.prepare('SELECT game,uid,snapshot,changes,updated_at,next_at FROM kp_hoyo_profiles WHERE guild=? AND user=? ORDER BY game').bind(owner.guild,owner.user).all<LinkRow>();
 return rows.results.map(present);
}
async function parseBody(request:Request){
 const text=await request.text();if(text.length>384)throw Error('入力が長すぎます。');
 const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('入力形式を確認してください。');
 return body as Record<string,unknown>;
}
export async function hoyoApi(request:Request,env:HoyoEnv,owner:HoyoOwner,send:typeof fetch=fetch):Promise<Response>{
 const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 await ensure(env);
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path==='/api/kp/hoyo/status')return response({rewardsEnabled:false,ownershipVerified:false,profiles:await list(env,owner)});
 if(request.method!=='POST'||!['/api/kp/hoyo/link','/api/kp/hoyo/refresh','/api/kp/hoyo/unlink'].includes(path))return response({error:'Not found'},404);
 let body:Record<string,unknown>;try{body=await parseBody(request);}catch{return response({error:'入力を確認してください。'},400);}
 const game=checkGame(body.game);
 if(path==='/api/kp/hoyo/unlink'){
  await env.DB.prepare('DELETE FROM kp_hoyo_profiles WHERE guild=? AND user=? AND game=?').bind(owner.guild,owner.user,game).run();
  return response({rewardsEnabled:false,profiles:await list(env,owner)});
 }
 const uid=path.endsWith('/link')?checkUid(body.uid):'';
 const row=await env.DB.prepare('SELECT game,uid,snapshot,changes,updated_at,next_at FROM kp_hoyo_profiles WHERE guild=? AND user=? AND game=?').bind(owner.guild,owner.user,game).first<LinkRow>();
 if(path.endsWith('/refresh')&&!row)return response({error:'先にUIDを登録してください。'},400);
 const requestedUid=path.endsWith('/refresh')?row!.uid:uid;
 // Reuse the cached snapshot; repeated taps must not repeatedly hit Enka.
 if(row&&row.uid===requestedUid&&row.next_at>Date.now())return response({cached:true,rewardsEnabled:false,profiles:await list(env,owner)});
 await limit(env,owner);
 const {snapshot,ttl}=await readUpstream(game,requestedUid,send);
 const now=Date.now(),nextAt=now+ttl*1000;
 const changes=row&&row.uid===requestedUid?changesHoyo(JSON.parse(row.snapshot),snapshot):[];
 // Changing UID resets the baseline; publicly viewable does not mean account ownership.
 await env.DB.prepare('INSERT INTO kp_hoyo_profiles(guild,user,game,uid,snapshot,changes,updated_at,next_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(guild,user,game) DO UPDATE SET uid=excluded.uid,snapshot=excluded.snapshot,changes=excluded.changes,updated_at=excluded.updated_at,next_at=excluded.next_at')
 .bind(owner.guild,owner.user,game,requestedUid,JSON.stringify(snapshot),JSON.stringify(changes),now,nextAt).run();
 return response({cached:false,rewardsEnabled:false,profiles:await list(env,owner)});
}
