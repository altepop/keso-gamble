// Single-use, verified community roast. Does not modify gameplay or KP.
import type { KpMapping } from './kp.ts';
import type { PostEnv } from './racing-posts.ts';
import { earningsWebhook, ensurePosts } from './racing-posts.ts';

export const VDK_PEARL_MATCH = 'db6a45fe-7699-4fb3-b4b8-0d7499b26412';
export const VDK_PEARL_RIOT = 'dolly#sdgs';
export const VDK_PEARL_RECEIPT = 'oneoff:vdk-pearl-chamber:' + VDK_PEARL_MATCH;
const FROM = Date.parse('2026-11-02T00:45:00+09:00');
const UNTIL = Date.parse('2026-11-03T00:00:00+09:00');

export function vdkPearlPayload(user: string) {
  if (!/^\d{15,22}$/.test(user)) throw new Error('invalid Discord mention');
  return {
    username: '等しいbot',
    content: [
      '📨 **1通のお知らせです。**',
      '',
      '🚨 **【緊急速報】<@' + user + '>、勝利したのにお通夜。**',
      '🪦 **VDKの0デス覚醒、パールで終了間際に死亡確認。**',
      '',
      '11/2 00:50頃のアカンbot速報に登場した、Dolly#SDGsのチェンバー。',
      '🏆 **スパイクラッシュ 4–1 勝利**',
      '🔫 **7キル / 1デス / 0アシスト｜ACS 367｜K/D 7.00**',
      '✨ センチネルの0デス試練：**失敗**',
      '',
      'ちょっと待てVDK。**7キルして勝っといて、欲しかった覚醒だけ持ち帰れんの、どういう才能やねん。**',
      'あと試合が終わるまで生きとけばええだけやったのに、最後の最後で**命をセルフ精算**。',
      '敵チームは1–4で敗北。けど一番デカい敗北を喫したのは、間違いなく**VDKの覚醒チャレンジ**や。',
      '',
      'チェンバーの仕事は拠点を守ることやろ？ **7人倒す前に、自分の0デス守れや。**',
      '7キルという立派な数字の横に、たった1つ付いたデス。**この1だけが今日の主役**になってもうた。',
      '勝利画面は出た。ACSも立派。敵も倒した。**でも覚醒ボタンだけ「お前は帰れ」。**',
      '',
      '🎙️ **「VDK選手、試合には勝利！ なお、本命の0デスチャレンジはゴール目前で無事死亡！」**',
      '🏅 本日の特別称号：**『7キルで全てを手に入れ、1デスで全てを失った男』**',
      '',
      '💐 **謹んで0デスのご冥福をお祈りいたします。**',
      '-# 出典：指定試合のTracker.gg戦績。終了直前のデスという経緯は本人側からの報告。時系列キルログは未確認。',
    ].join('\n'),
    allowed_mentions: { parse: [] as string[], users: [user] },
  };
}

// The named Riot ID is the only acceptable identity. Never substitute the losing Chamber or a VDK nickname.
export function findVdkPearlAccount(mapping: KpMapping) {
  const candidates = mapping.accounts.filter(a => a.riotId.trim().toLowerCase() === VDK_PEARL_RIOT);
  return candidates.length === 1 ? candidates[0] : null;
}

export function isVerifiedVdkPearlNotice(notice: {outcome: string | null; mode: string | null; message: string} | null) {
  return Boolean(notice && notice.outcome === 'win' && notice.mode === 'spikerush'
    && notice.message.includes('Pearl｜Chamber')
    && notice.message.includes('4対1で')
    && notice.message.includes('7K / 1D'));
}

export async function queueVdkPearlRoast(env: PostEnv, mapping: KpMapping, now = Date.now()) {
  if (now < FROM || now >= UNTIL || !earningsWebhook(env)) return false;
  await ensurePosts(env);
  const existing = await env.DB.prepare('SELECT 1 FROM kp_posts WHERE id=?').bind(VDK_PEARL_RECEIPT).first();
  if (existing) return false;
  const account = findVdkPearlAccount(mapping);
  if (!account) return false;
  const notice = await env.DB.prepare('SELECT outcome,mode,message FROM notifications WHERE match_id=? AND riot_id=?')
    .bind(VDK_PEARL_MATCH, account.riotId).first<{outcome:string|null;mode:string|null;message:string}>();
  if (!isVerifiedVdkPearlNotice(notice)) return false;
  const payload = vdkPearlPayload(account.discordUserId);
  const saved = await env.DB.prepare('INSERT OR IGNORE INTO kp_posts(id,body,at) VALUES(?,?,?)')
    .bind(VDK_PEARL_RECEIPT, JSON.stringify(payload), now).run();
  return Boolean(saved.meta.changes);
}
