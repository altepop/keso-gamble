import test from 'node:test';
import assert from 'node:assert/strict';
import { healthPanel } from '../js/health-view.js';

const NOW=Date.parse('2026-10-29T12:00:00+09:00');
const report={at:NOW,features:[{feature:'mleague',label:'Mリーグの結果・精算',status:'failing',lastOk:NOW-3600000,lastError:NOW-60000,error:'Error: <b>x</b>',failures:3},{feature:'voice',label:'通話の計測',status:'ok',lastOk:NOW-30000,lastError:null,error:null,failures:0},{feature:'horse_gift',label:'馬のプレゼント',status:'stale',lastOk:NOW-20*60000,lastError:null,error:null,failures:0},{feature:'unite_watch',label:'ユナイトの監視',status:'unknown',lastOk:null,lastError:null,error:null,failures:0}],
 backlog:{mleagueBets:3,mleagueMatches:2,raceBets:0,mahjongClaims:null,debts:1,earningsPosts:4,alertPosts:0,kpInbox:0}};
test('システムの状態：失敗中・止まっている可能性・正常・未記録と、たまっている件数を出す（理由はエスケープ）',()=>{
 const html=healthPanel(report,false,'',NOW);
 assert.match(html,/2件の処理に問題があります/);
 assert.match(html,/⚠️ <strong>Mリーグの結果・精算<\/strong> <span class="badge">失敗中<\/span>.*連続失敗 3回（1分前）<br>Error: &lt;b&gt;x&lt;\/b&gt;/s);
 assert.match(html,/⏸️ <strong>馬のプレゼント<\/strong>.*最後に成功 20分前/s);assert.match(html,/✅ <strong>通話の計測/);assert.match(html,/まだ記録なし/);
 assert.match(html,/Mリーグの未精算の予想<\/span><strong>3件/);assert.match(html,/雀魂の承認待ち<\/span><strong>—/);assert.match(html,/稼ぎchの送信待ち<\/span><strong>4件/);
});
test('システムの状態：読み込む前はボタンだけ、読み込み中は押せない、失敗は理由を出す',()=>{
 assert.match(healthPanel(null,false,''),/data-action="load-health" >状態を見る/);
 assert.match(healthPanel(null,true,''),/disabled>確認中…/);
 assert.match(healthPanel(null,false,'通信を確認できません'),/⚠️ 通信を確認できません/);
});
