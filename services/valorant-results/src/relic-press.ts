/** One-off KESO PLAY relic launch press release.
 * Uses the *existing* earnings channel webhook, posts queue and cron flusher.
 * A deterministic primary key prevents duplicate announcements after retries.
 * No player scan, new D1 schema, external fetch or permanent cron work.
 */
import {earningsWebhook,ensurePosts,enqueue} from './racing-posts.ts';
import type {PostEnv} from './racing-posts.ts';
export const RELIC_PRESS_ID='relic-press:v1:2026-11-03';
export const RELIC_PRESS_START=Date.parse('2026-11-03T00:00:00+09:00');
export const RELIC_PRESS_END=Date.parse('2026-11-10T00:00:00+09:00');
const queued=new WeakSet<object>();

export function relicPressBody(){
 return [
  '🗞️ **【KESO PLAY／等しいbot発表】遺物、ここまで育ってしもた。**',
  '',
  '💰 **最大どれだけ増えるん？**',
  '超越「賽の崩壊核」は、**報酬が素数なら＋900%！**',
  '例：**307 KP → 3,070 KP**（この遺物単体・条件達成時）。',
  '**4枠の遺物効果、セット、共鳴は重ね掛けOK。追加KPの合算上限はなし。** 固定の「最高倍率」はないで。',
  '',
  '🎰 **遺物の楽しみ方**',
  '・召喚 **1回200 KP**／通常148種類＋Steam・ユナイト限定遺物',
  '・伝説→神話→古代→超越と豪華になる演出＆効果音',
  '・4枠で自由にビルド。低レアにも強い条件付き能力あり',
  '・変異 **1/4,096**、特殊個体 **1/40,000**。超低確率の神引きも！',
  '・プリセット保存、効果倍率の試算、無料試聴もできるで',
  '',
  '⚠️ **ここだけは注意！**',
  '・＋900%には「素数KP」という条件あり。外すと、ほかの遺物の上乗せが**90%減る**。デメリットを確認して装備してな。',
  '・**Steam報酬は全ゲーム合計で1日5,000 KPまで（毎朝9時リセット）。** 到達後はその日、Steam限定遺物も新規受取不可。',
  '・上限で**0 KP**になったSteam実績は、翌日も遺物の対象外。登録前の実績にも遡って付与せえへん。',
  '・遺物ボーナスは**検証済みの確定報酬・確定利益だけ**。賭けたり株を買っただけでは増えへんで。',
  '',
  '🔮 **遊び方：Discord → KESO PLAY →「遺物」**',
  '-# ※数値は条件成立時の計算例。現金との交換はできないゲーム内KPやで。'
 ].join('\n');
}
export async function queueRelicPress(env:PostEnv,now=Date.now()){
 if(now<RELIC_PRESS_START||now>=RELIC_PRESS_END||!earningsWebhook(env)||queued.has(env.DB))return false;
 const body=relicPressBody();
 if(body.length>1900)throw Error('Relic press exceeds Discord length budget');
 await ensurePosts(env);
 // This primary key is never reused, so a retry or a new Worker isolate
 // cannot create another press. Existing unsent rows remain flushable.
 await enqueue(env,RELIC_PRESS_ID,body,now);
 queued.add(env.DB);
 return true;
}
