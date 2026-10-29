import rules from '../mode-rewards.json' with {type:'json'};
import {applyLuck,luckFor,luckLabel} from './luck.ts';
import type {KpEnv} from './kp.ts';
export function uniteQuote(win:boolean,wins:number,losses:number,seed:string,reset=false){
 if(![wins,losses].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=5))throw Error('Invalid Unite streak');
 const nextWins=win?Math.min(5,(reset?0:wins)+1):0,nextLosses=win?0:Math.min(5,(reset?0:losses)+1);
 const base=win?rules.unite.win[nextWins-1]:rules.unite.loss[nextLosses-1],net=applyLuck(base,luckFor('unite:'+seed));
 return {wins:nextWins,losses:nextLosses,base,net,note:`（${win?nextWins+'連勝':nextLosses+'連敗'}・基本${base>0?'+':''}${base} KP）`+luckLabel(luckFor('unite:'+seed),base)};
}
export async function ensureUniteRewards(env:KpEnv){
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS unite_streaks(guild TEXT NOT NULL,uid TEXT NOT NULL,user TEXT NOT NULL,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,uid))'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS unite_rewards(id TEXT PRIMARY KEY,guild TEXT NOT NULL,uid TEXT NOT NULL,user TEXT NOT NULL,fingerprint TEXT NOT NULL,win INTEGER NOT NULL,base INTEGER NOT NULL,net INTEGER NOT NULL,wins INTEGER NOT NULL,losses INTEGER NOT NULL,note TEXT NOT NULL,expected_version INTEGER NOT NULL,at INTEGER NOT NULL,UNIQUE(guild,uid,fingerprint))'),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS unite_reward_apply AFTER INSERT ON unite_rewards BEGIN
   UPDATE unite_streaks SET wins=NEW.wins,losses=NEW.losses,version=version+1 WHERE guild=NEW.guild AND uid=NEW.uid AND user=NEW.user AND version=NEW.expected_version;
   SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Unite streak conflict') END;
   INSERT INTO kp_ledger(id,guild,user,delta,kind,at) SELECT NEW.id,NEW.guild,NEW.user,CASE WHEN NEW.net>=0 THEN NEW.net ELSE -MIN(-NEW.net,balance) END,'unite',NEW.at FROM kp_wallets WHERE guild=NEW.guild AND user=NEW.user;
   INSERT OR IGNORE INTO kp_debt_events(id,guild,user,amount,kind,at) SELECT 'borrow:'||NEW.id,NEW.guild,NEW.user,-NEW.net+delta,'borrow',NEW.at FROM kp_ledger WHERE id=NEW.id AND NEW.net<0 AND -NEW.net+delta>0;
  END`),
 ]);
}
export async function settleUnite(env:KpEnv,input:{id:string;guild:string;uid:string;user:string;fingerprint:string;win:boolean;now:number;seed:string;reset?:boolean}){
 for(let n=0;n<5;n++){
  const existing=await env.DB.prepare('SELECT r.note,l.delta FROM unite_rewards r JOIN kp_ledger l ON l.id=r.id WHERE r.id=? AND r.user=?').bind(input.id,input.user).first<{note:string;delta:number}>();
  if(existing)return existing;
  const p=await env.DB.prepare('SELECT wins,losses,version,user FROM unite_streaks WHERE guild=? AND uid=?').bind(input.guild,input.uid).first<{wins:number;losses:number;version:number;user:string}>();
  if(!p||p.user!==input.user)throw Error('Unite owner mismatch');
  const q=uniteQuote(input.win,p.wins,p.losses,input.seed,input.reset);
  const result=await env.DB.prepare(`INSERT INTO unite_rewards(id,guild,uid,user,fingerprint,win,base,net,wins,losses,note,expected_version,at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM unite_streaks WHERE guild=? AND uid=? AND user=? AND version=?) ON CONFLICT(id) DO NOTHING`)
   .bind(input.id,input.guild,input.uid,input.user,input.fingerprint,Number(input.win),q.base,q.net,q.wins,q.losses,q.note,p.version,input.now,input.guild,input.uid,input.user,p.version).run();
  if(result.meta.changes){const r=await env.DB.prepare('SELECT delta FROM kp_ledger WHERE id=?').bind(input.id).first<{delta:number}>();return {note:q.note,delta:Number(r?.delta??0)};}
 }
 throw Error('Unite concurrent settlement');
}
