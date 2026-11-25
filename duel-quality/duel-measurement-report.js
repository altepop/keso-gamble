import {summarizeDuelRenderSamples} from './duel-latency-samples.js';
// On-device read-only diagnostics. Never transmit sample or opponent data.
export function formatDuelRenderReport(samples){
 const report=summarizeDuelRenderSamples(samples);
 if(!report)return '計測データの形式が不正';
 const out=['KESO PLAY 決闘・端末内表示時間の参考記録','対象：クライアント側の操作から確定表示まで。相手への反映時間ではなく1秒以内を保証しない。','計測件数：'+report.count];
 for(const [game,s] of Object.entries(report.byGame)){
  out.push(game+': '+s.count+'件 / p50 '+s.p50+'ms / p95 '+s.p95+'ms / 最大 '+s.max+'ms');
 }
 if(!report.count)out.push('現在の有効な測定値なし');
 return out.join('\n');
}
