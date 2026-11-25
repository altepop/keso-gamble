/** One-off, read-only bankruptcy holdings announcement in the existing earnings channel.
 * Uses immutable kp_posts ID, no wallet writes, no new webhook or API.
 */
import type {PostEnv} from './racing-posts.ts';
import {earningsWebhook,ensurePosts} from './racing-posts.ts';

export const VDK_LOSS_PRESS_ID='oneoff:vdk-bankruptcy-remaining-holders:20261122';
export const VDK_LOSS_PRESS_START=Date.parse('2026-11-22T00:00:00+09:00');
export const VDK_LOSS_PRESS_END=Date.parse('2026-11-26T00:00:00+09:00');

export function vdkLossPressPayload(){
 return {
  username:'等しいbot',
  content:[
   '📉 **【VDKブラック商事・倒産被害の続報】**',
   '',
   '倒産後も旧株握っとるん、調べたら**石原ただ1人**やったで！😂',
   '保有25株、記録上の取得額1,815KPに対して最終株価ベースは25KP。**評価損は約1,790KP**や！',
   '',
   '98.6%暴落って聞くと大惨事やけど、額で見たら意外と小粒やな！ あんだけ派手に潰れてこの程度かい！',
   '',
   '※残存株の概算やで。過去に損切りした人の損益までは含んでへん。',
  ].join('\n'),
  allowed_mentions:{parse:[] as string[]},
 };
}
const attempted=new WeakSet<object>();
export async function queueVdkLossPress(env:PostEnv,now=Date.now()){
 if(now<VDK_LOSS_PRESS_START||now>=VDK_LOSS_PRESS_END||!earningsWebhook(env)||attempted.has(env.DB))return false;
 const payload=vdkLossPressPayload();
 if(payload.content.length>1900)throw Error('VDK loss press exceeds Discord limit');
 await ensurePosts(env);
 const saved=await env.DB.prepare('INSERT OR IGNORE INTO kp_posts(id,body,at) VALUES(?,?,?)')
  .bind(VDK_LOSS_PRESS_ID,JSON.stringify(payload),now).run();
 attempted.add(env.DB);
 return Boolean(saved.meta.changes);
}
