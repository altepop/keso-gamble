import players from '../players.json' with { type: 'json' };

export function valoCommand(configured = players) {
  const choices = configured.map(player => ({ name: (player.name || player.riotId.split('#')[0]).slice(0, 80), value: player.riotId }));
  const player = (name = 'player', required = false, all = true) => ({
    type: 3, name, description: name === 'partner' ? '相手の登録者' : required ? '対象の登録者を選択' : '登録者を選択（省略で全員）', required,
    choices: all ? [{ name: '登録者全員', value: 'all' }, ...choices] : choices,
  });
  const mode = { type: 3, name: 'mode', description: 'モード（省略でコンペ）', required: false,
    choices: [{ name: 'コンペ', value: 'competitive' }, { name: 'エスカレーション', value: 'escalation' }] };
  return {
    name: 'valo', description: '記録済みの戦績・直近の結果・ペア相性・監視状況を確認', type: 1,
    options: [
      { type: 1, name: 'today', description: '今日の勝敗・勝率・連勝連敗（日本時間）', options: [player(), mode] },
      { type: 1, name: 'yesterday', description: '昨日の勝敗・勝率・連勝連敗（日本時間）', options: [player(), mode] },
      { type: 1, name: 'week', description: '今週の勝敗・勝率・連勝連敗（月曜始まり）', options: [player(), mode] },
      { type: 1, name: 'act', description: '最新ACTの勝敗・勝率・連勝連敗', options: [player(), mode] },
      { type: 1, name: 'recent', description: '選んだ人の直近3試合と個人成績', options: [player('player', true, false), mode] },
      { type: 1, name: 'pair', description: '2人が同じチームで参加した試合の勝率', options: [player('player', true, false), player('partner', true, false), mode] },
      { type: 1, name: 'versus', description: '2人が敵同士だった直接対決の成績', options: [player('player', true, false), player('partner', true, false), mode] },
      { type: 1, name: 'compare', description: '最新ACTの2人の戦績を並べて比較', options: [player('player', true, false), player('partner', true, false), mode] },
      { type: 1, name: 'streaks', description: '最新ACTでの最長連勝・最長連敗', options: [player(), mode] },
      { type: 1, name: 'players', description: '登録者とRiot IDの一覧' },
      { type: 1, name: 'ranking', description: '最新ACTの登録者勝率ランキング（記録分）', options: [mode] },
      { type: 1, name: 'status', description: '最終確認時刻・送信待ち・API制限の状態' },
      { type: 1, name: 'help', description: 'コマンド一覧とデスアンレの使い方' },
    ],
  };
}