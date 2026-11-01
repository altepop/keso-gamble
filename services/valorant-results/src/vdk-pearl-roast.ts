// Single-use, verified community roast. Does not modify gameplay or KP.
import configuredPlayers from '../players.json' with { type: 'json' };
import type { KpMapping } from './kp.ts';
import type { PostEnv } from './racing-posts.ts';
import { earningsWebhook, ensurePosts } from './racing-posts.ts';

export const VDK_PEARL_MATCH = 'db6a45fe-7699-4fb3-b4b8-0d7499b26412';
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
      '🚨 **緊急速報：<@' + user + '>、パールでチェンバーの職務を放棄。**',
      '',
      '11/2 00:50頃、アカンbotに記録されたパール・スパイクラッシュを再検証したところ、非常に残念なお知らせがございます。',
      '',
      '📉 **VDKのチェンバー**　**1キル / 5デス / ACS 86 / K/D 0.20**',
      '📈 **相手のチェンバー**　**7キル / 1デス / ACS 367 / K/D 7.00**',
      '🏳️ 試合結果　**1–4の敗北**',
      '',
      'おいVDK。**同じエージェントでK/D35倍差**って何やねん。',
      '敵のチェンバーは高級スナイパー、こっちのチェンバーは**高級観戦チケット**でも買うてたんか？',
      '相手は7キルして1回しか死なんのに、お前は1キルするために5回もリスポーン待っとる。**撃ち合いじゃなくて死亡確認の定期便やないか。**',
      'ACS86は戦績というより、チェンバーの銃を買う前の**値札**やろ。',
      'ファーストデス2回？ **開幕情報を取るんやなくて、敵に先着順でポイント献上してどうすんねん。**',
      'パールに真珠を探しに行ったはずが、持ち帰ったんは**5個のデスマークと1個のキル**。',
      '',
      '🎙️ **「相手のチェンバーは狙撃手。VDKのチェンバーは試合中ずっと現場検証の対象でした。」**',
      '🏆 本日の称号：**株式会社チェンバー風評被害・代表取締役VDK**',
      '',
      '-# 出典：指定試合のTracker.gg戦績。時系列キルログは未取得のため、架空のキル場面は含まない。',
    ].join('\n'),
    allowed_mentions: { parse: [] as string[], users: [user] },
  };
}

export function findVdkPearlAccount(mapping: KpMapping) {
  const candidates = mapping.accounts.filter(a => {
    const nick = configuredPlayers.find(p => p.riotId.toLowerCase() === a.riotId.toLowerCase())?.name?.trim().toLowerCase();
    return nick === 'vdk' || a.riotId.split('#')[0].toLowerCase() === 'vdk' || a.riotId.toLowerCase() === 'fur1an#1204';
  });
  return candidates.length === 1 ? candidates[0] : null;
}

export function isVerifiedVdkPearlNotice(notice: {outcome: string | null; mode: string | null; message: string} | null) {
  return Boolean(notice && notice.outcome === 'loss' && notice.mode === 'spikerush'
    && notice.message.includes('Pearl｜Chamber')
    && notice.message.includes('1対4で')
    && notice.message.includes('1K / 5D'));
}

export async function queueVdkPearlRoast(env: PostEnv, mapping: KpMapping, now = Date.now()) {
  if (now < FROM || now >= UNTIL || !earningsWebhook(env)) return false;
  await ensurePosts(env);
  const existing = await env.DB.prepare('SELECT 1 FROM kp_posts WHERE id=?').bind(VDK_PEARL_RECEIPT).first();
  if (existing) return false;
  const account = findVdkPearlAccount(mapping);
  if (!account) return false; // Never guess the Discord ID.
  const notice = await env.DB.prepare('SELECT outcome,mode,message FROM notifications WHERE match_id=? AND riot_id=?')
    .bind(VDK_PEARL_MATCH, account.riotId).first<{outcome:string|null;mode:string|null;message:string}>();
  if (!isVerifiedVdkPearlNotice(notice)) return false; // No wrong-match ping.
  const payload = vdkPearlPayload(account.discordUserId);
  const saved = await env.DB.prepare('INSERT OR IGNORE INTO kp_posts(id,body,at) VALUES(?,?,?)')
    .bind(VDK_PEARL_RECEIPT, JSON.stringify(payload), now).run();
  return Boolean(saved.meta.changes);
}
