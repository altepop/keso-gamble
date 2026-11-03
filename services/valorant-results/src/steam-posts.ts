import {ensureSteam,steamConfig} from './steam-rewards.ts';
import type {SteamEnv,SteamConfig} from './steam-rewards.ts';

export type SteamPostEnv=SteamEnv&{DISCORD_WEBHOOK_URL?:string};
export const STEAM_NOTICE_QUIET=2*60_000,STEAM_NOTICE_MAX_WAIT=30*60_000;
interface Group {user:string;first:number;last:number;count:number;amount:number;requested:number}
interface Item {title:string;amount:number;requested:number;percent:number}
interface Game {title:string;count:number}
const clean=(value:string,limit=80)=>value.replace(/[\u0000-\u001f\u007f@`*_~<>|]/g,'').slice(0,limit);
const kp=(amount:number)=>amount.toLocaleString('ja-JP')+' KP';
export function steamReleasePost(c:SteamConfig){
 return ['🎮 **SteamでもKPを稼げるようになったで！**','',
  'VALORANTや雀魂をやってへん人も参加できるで。Steamの新しい実績がKPになる！',
  '', '**始め方**', 'KESO PLAY →「稼ぐ」→「Steamで接続する」',
  'Steam公式ログインを済ませたらActivityへ戻って「接続を確認」。自分のアカウントを確定して、「所持ゲームから選ぶ」で監視したいゲームを登録してな。',
  '', '**対象は有料販売中・累計2時間以上のゲーム**',
  'Steamのプロフィールとゲーム詳細は公開にしてな。監視は同時に5本まで。無料・基本無料・無料配布中のゲームは対象外や。登録前の実績には遡って支給せえへんで。',
  '', '**実績1個あたりのKP**',
  ...c.tiers.map((tier,i)=>`${['解除率0.1%以下','0.1%超〜1%以下','1%超〜10%以下','10%超'][i]}：${kp(tier.amount)}`),
  '', '全ゲーム合計で1日5,000 KPまで。毎朝9時に更新や。上限で減った分は翌日へ繰り越さへんで。',
  '実績の入金判定はアカンbotがお知らせ。まとめて解除した分は1通にまとめるから、チャンネルを実績で埋め尽くす心配はせんでええ。',
  '', '**貯めたKPは何に使えるん？**',
  'KESO PLAYのカジノ・株・競馬・Mリーグ予想・指令などで使えるで。現金や商品との交換はできへんゲーム内ポイントや。',
  '', 'Activityを閉じても監視は続くで。反映には時間がかかることがあるから、ちょっと待ってな。'].join('\n');
}
export function steamAchievementPost(group:Group,games:Game[],items:Item[]){
 const lines=[`🎮 **Steam実績 ${group.count}個解除！**`,`<@${group.user}>　今回の獲得 **+${kp(group.amount)}**`,'',
  ...games.slice(0,5).map(g=>`${clean(g.title||'Steamゲーム')}：${g.count}個`),
  ...games.length>5?[`ほか${games.length-5}タイトル`]:[], '',
  ...items.slice(0,8).map(item=>`🏆 ${clean(item.title)}　+${kp(item.amount)}（解除率${item.percent.toFixed(2)}%）`),
  ...group.count>8?[`ほか${group.count-8}個。獲得KPの明細はKESO PLAYの入出金履歴で確認してな。`]:[],
  ...group.requested>group.amount?['',`本来の報酬 ${kp(group.requested)} → 日上限の残りに合わせて ${kp(group.amount)}。超えた分は翌日へ繰り越さへんで。`]:[],
  '',group.amount?'実績もKPも積み上がっとるやん！ 次は何を極めるん？':'今日のSteam支給枠は使い切っとるで。実績の達成はちゃんと記録したからな。'];
 return lines.join('\n');
}
/** The result bot's durable queue is shared with Unite/Mahjong. Delivery never changes the wallet. */
export async function queueSteamPosts(env:SteamPostEnv,guild:string,now=Date.now()){
 const c=steamConfig(env);if(!c.enabled||!env.STEAM_WEB_API_KEY||!env.DISCORD_WEBHOOK_URL)return 0;
 await ensureSteam(env);
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS mahjong_watch_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,message_id TEXT)').run();
 const payload=(content:string)=>JSON.stringify({content,allowed_mentions:{parse:[]}});
 await env.DB.prepare('INSERT OR IGNORE INTO mahjong_watch_posts(id,body,at) VALUES(?,?,?)').bind('steam-release:v1:'+guild,payload(steamReleasePost(c)),now).run();
 const groups=(await env.DB.prepare(`SELECT i.user,MIN(i.seq) AS first,MAX(i.seq) AS last,COUNT(*) AS count,SUM(e.amount) AS amount,SUM(e.requested) AS requested
 FROM kp_steam_notice_items i JOIN kp_steam_events e ON e.id=i.event WHERE i.guild=? GROUP BY i.user
 HAVING (MAX(i.at)<=? AND NOT EXISTS(SELECT 1 FROM kp_steam_games g WHERE g.guild=? AND g.user=i.user AND g.active=1 AND g.error='batch_remaining')) OR MIN(i.at)<=?
 ORDER BY MIN(i.seq) LIMIT 4`).bind(guild,now-STEAM_NOTICE_QUIET,guild,now-STEAM_NOTICE_MAX_WAIT).all<Group>()).results;
 let queued=0;
 for(const group of groups){
  const games=(await env.DB.prepare(`SELECT COALESCE(NULLIF(g.title,''),'Steam App '||e.app) AS title,COUNT(*) AS count FROM kp_steam_notice_items i JOIN kp_steam_events e ON e.id=i.event LEFT JOIN kp_steam_games g ON g.guild=e.guild AND g.user=e.user AND g.app=e.app WHERE i.guild=? AND i.user=? AND i.seq<=? GROUP BY e.app ORDER BY MIN(i.seq) LIMIT 6`).bind(guild,group.user,group.last).all<Game>()).results;
  const items=(await env.DB.prepare('SELECT e.title,e.amount,e.requested,e.percent FROM kp_steam_notice_items i JOIN kp_steam_events e ON e.id=i.event WHERE i.guild=? AND i.user=? AND i.seq<=? ORDER BY i.seq LIMIT 8').bind(guild,group.user,group.last).all<Item>()).results;
  const id='steam-achievements:'+guild+':'+group.user+':'+group.first+':'+group.last;
  const result=await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO mahjong_watch_posts(id,body,at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM kp_steam_notice_items WHERE seq=? AND guild=? AND user=?)').bind(id,payload(steamAchievementPost(group,games,items)),now,group.first,guild,group.user),
   // The sequence bound prevents new events arriving after the snapshot from being consumed.
   env.DB.prepare('DELETE FROM kp_steam_notice_items WHERE guild=? AND user=? AND seq<=? AND EXISTS(SELECT 1 FROM mahjong_watch_posts WHERE id=?)').bind(guild,group.user,group.last,id),
  ]);
  queued+=Number(result[0]!.meta.changes)>0?1:0;
 }
 return queued;
}
