import type {KpMapping} from './kp.ts';
export const COACH_PERSONS=[
 {key:'kobe',label:'神戸',accounts:[{riotId:'Abema#ttv',profile:'Abema'},{riotId:'Aquatopia#toppy',profile:'Aquatopia'}]},
 {key:'vdk',label:'VDK',accounts:[{riotId:'Dolly#SDGs',profile:'VDK'}]},
 {key:'ishihara',label:'石原',accounts:[{riotId:'h1d3g1g4s#1037',profile:'石原'}]},
 {key:'fujimura',label:'藤村',accounts:[{riotId:'frin#怖すぎ',profile:'藤村'}]},
 {key:'kobayashi',label:'小林',accounts:[{riotId:'mecael#2489',profile:'小林'}]},
] as const;
const lower=(v:string)=>v.toLowerCase();
const validId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128;
const definition=(riot:string)=>COACH_PERSONS.find(p=>p.accounts.some(a=>lower(a.riotId)===lower(riot)));
type Link={puuid:string;user:string;riot:string};
// Independent Cron provisioning. It never changes KP ownership or runs on a
// page read. All authority comes from the server mapping + immutable KP links.
export async function syncCoachProfiles(db:D1Database,mapping:KpMapping,now=Date.now()){
 const links=(await db.prepare('SELECT puuid,user,riot FROM kp_accounts WHERE guild=?').bind(mapping.guildId).all<Link>()).results;
 const sources=(await db.prepare('SELECT riot_id,puuid FROM coach_member_sources').all<{riot_id:string;puuid:string|null}>()).results;
 const personFor=(account:KpMapping['accounts'][number])=>{
  const primary=links.find(l=>l.user===account.discordUserId&&lower(l.riot)===lower(account.riotId));if(!primary)return undefined;
  const named=definition(account.riotId);if(named)return named;
  const found=COACH_PERSONS.filter(p=>p.accounts.some(a=>sources.some(s=>lower(s.riot_id)===lower(a.riotId)&&s.puuid===primary.puuid)));
  return found.length===1?found[0]:undefined;
 };
 const existing=(await db.prepare(`SELECT p.subject_id,p.owner_user,p.person_key,a.puuid,a.account_key
  FROM coach_profiles p LEFT JOIN coach_profile_accounts a ON a.guild=p.guild AND a.subject_id=p.subject_id WHERE p.guild=?`).bind(mapping.guildId).all<{subject_id:string;owner_user:string;person_key:string;puuid:string|null;account_key:string|null}>()).results;
 let added=0,conflicts=0,pending=0;
 for(const person of COACH_PERSONS){
  const configured=mapping.accounts.filter(a=>personFor(a)?.key===person.key);
  if(configured.length!==1){if(configured.length)conflicts++;continue;}
  const account=configured[0],primary=links.find(l=>l.user===account.discordUserId&&lower(l.riot)===lower(account.riotId));
  if(!primary||!validId(primary.puuid)){pending++;continue;}
  const prior=existing.find(p=>p.person_key===person.key||p.owner_user===account.discordUserId);
  if(prior&&(prior.person_key!==person.key||prior.owner_user!==account.discordUserId)){conflicts++;continue;}
  const subject=prior?.subject_id??crypto.randomUUID();
  const primaryAccount=person.accounts.find(a=>lower(a.riotId)===lower(primary.riot))??person.accounts.find(a=>sources.some(s=>lower(s.riot_id)===lower(a.riotId)&&s.puuid===primary.puuid));
  if(!primaryAccount){conflicts++;continue;}
  const candidates=person.accounts.flatMap(a=>{
   const puuid=a.riotId===primaryAccount.riotId?primary.puuid:sources.find(s=>lower(s.riot_id)===lower(a.riotId))?.puuid;
   return validId(puuid)?[{puuid,account_key:a.riotId}]:[];
  });
  if(candidates.length<person.accounts.length)pending++;
  if(candidates.some(a=>links.some(l=>l.puuid===a.puuid&&l.user!==account.discordUserId)||existing.some(e=>e.puuid===a.puuid&&e.subject_id!==subject||e.subject_id===subject&&e.account_key&&lower(e.account_key)===lower(a.account_key)&&e.puuid!==a.puuid))){conflicts++;continue;}
  const statements:D1PreparedStatement[]=[];
  if(!prior)statements.push(db.prepare(`INSERT OR IGNORE INTO coach_profiles(guild,subject_id,owner_user,person_key,display_name,updated_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_accounts WHERE guild=? AND user=? AND puuid=?)`)
    .bind(mapping.guildId,subject,account.discordUserId,person.key,person.label,now,mapping.guildId,account.discordUserId,primary.puuid));
  for(const a of candidates){
   if(existing.some(e=>e.subject_id===subject&&e.puuid===a.puuid&&e.account_key===a.account_key))continue;
   statements.push(db.prepare(`INSERT OR IGNORE INTO coach_profile_accounts(guild,subject_id,puuid,account_key,verified_at)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coach_profiles WHERE guild=? AND subject_id=? AND owner_user=?)
     AND NOT EXISTS(SELECT 1 FROM kp_accounts WHERE guild=? AND puuid=? AND user<>?)`)
    .bind(mapping.guildId,subject,a.puuid,a.account_key,now,mapping.guildId,subject,account.discordUserId,mapping.guildId,a.puuid,account.discordUserId));
  }
  if(statements.length){const results=await db.batch(statements);added+=results.reduce((sum,r)=>sum+(r.meta.changes??0),0);}
 }
 return {added,conflicts,pending};
}
export type CoachIdentity=Awaited<ReturnType<typeof resolveCoachIdentity>>;
export async function resolveCoachIdentity(db:D1Database,mapping:KpMapping,user:string){
 const configured=mapping.accounts.filter(a=>a.discordUserId===user);
 if(configured.length!==1)return {status:'unregistered' as const};
 const rows=(await db.prepare(`SELECT p.subject_id,p.person_key,p.display_name,p.visibility,p.policy_version,p.shared_fields_json,a.puuid,a.account_key,
  k.puuid AS primary_puuid,k.riot AS primary_riot,b.user AS bound_owner
  FROM coach_profiles p LEFT JOIN coach_profile_accounts a ON a.guild=p.guild AND a.subject_id=p.subject_id
  LEFT JOIN kp_accounts k ON k.guild=p.guild AND k.user=p.owner_user
  LEFT JOIN kp_accounts b ON b.guild=a.guild AND b.puuid=a.puuid
  WHERE p.guild=? AND p.owner_user=?`).bind(mapping.guildId,user).all<{
   subject_id:string;person_key:string;display_name:string;visibility:string;policy_version:number;shared_fields_json:string;puuid:string|null;account_key:string|null;primary_puuid:string|null;primary_riot:string|null;bound_owner:string|null
  }>()).results;
 if(!rows.length)return {status:'unregistered' as const};
 const first=rows[0],person=COACH_PERSONS.find(p=>p.key===first.person_key);
 if(!person||!first.primary_puuid||lower(first.primary_riot??'')!==lower(configured[0].riotId)||!rows.some(r=>r.puuid===first.primary_puuid)||
 rows.some(r=>r.subject_id!==first.subject_id||!validId(r.puuid)||!r.account_key||!person.accounts.some(a=>lower(a.riotId)===lower(r.account_key!))||r.bound_owner!==null&&r.bound_owner!==user))return {status:'conflict' as const};
 const accounts=rows.map(r=>({riotId:r.account_key!,puuid:r.puuid!,profile:person.accounts.find(a=>lower(a.riotId)===lower(r.account_key!))!.profile}));
 return {status:'linked' as const,subjectId:first.subject_id,displayName:first.display_name,summaryVisibility:first.visibility,policyVersion:first.policy_version,sharedFieldsJson:first.shared_fields_json,person:person.label,accounts,pendingAccounts:person.accounts.length-accounts.length};
}
export function publicCoachIdentity(identity:CoachIdentity){
 if(identity.status!=='linked')return {status:identity.status};
 return {status:'linked',subjectId:identity.subjectId,displayName:identity.displayName,defaultProfile:identity.person,view:'self',visibility:'private',pendingAccounts:identity.pendingAccounts,
  accountOptions:identity.accounts.map(a=>({profile:a.profile,label:a.riotId}))};
}
