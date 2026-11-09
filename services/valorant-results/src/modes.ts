// Keep legacy unrated rows reserved for /death, so old cancellations stay cancelled.
export function storedMode(queue: string): string {
  return queue === 'ggteam' ? 'escalation' : queue === 'unrated' ? 'unrated_normal' : queue;
}
const labels: Record<string,string> = {
  skirmish_2v2:'スカーミッシュ（2対2）',skirmish:'スカーミッシュ',competitive:'コンペ',unrated:'デスアンレ',unrated_normal:'アンレート',swiftplay:'スイフトプレイ',death_swiftplay:'デススイフト',
  spikerush:'スパイクラッシュ',deathmatch:'デスマッチ',hurm:'チームデスマッチ',teamdeathmatch:'チームデスマッチ',
  escalation:'エスカレーション',onefa:'レプリケーション',replication:'レプリケーション',
  custom:'カスタム',snowball:'スノーボールファイト',snowballfight:'スノーボールファイト',
};
export function modeLabel(mode: string): string { return labels[mode] ?? mode; }
export function isSoloMode(mode: string): boolean { return mode === 'deathmatch'; }
