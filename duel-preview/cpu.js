// Pure CPU decision entrypoint. No API, D1, KP, network or opponent secret access.
// Difficulty changes the search method and decision quality, not the game rules.
import {chooseOthello,chooseGomoku,chooseConnect4} from './cpu-board-search.js?v=connect4-fallback-20261107-v1';
import {cpuHitBlow,cpuBluffDice} from './cpu-hidden-games.js';
import {cpuPoker} from './cpu-poker.js';
export function chooseCpuMove(game,board,{side,hand=null,level='normal',random=Math.random}={}){
 if(!['easy','normal','strong'].includes(level))throw Error('CPUの強さが不正です。');
 if(typeof random!=='function')throw Error('乱数が不正です。');
 switch(game){
  case 'othello':return chooseOthello(board,side,level,random);
  case 'gomoku':return chooseGomoku(board,side,level,random);
  case 'connect4':return chooseConnect4(board,side,level,random);
  case 'hitblow':return cpuHitBlow(board,side,level,random);
  case 'bluffdice':return cpuBluffDice(board,hand,side,level,random);
  case 'poker':return cpuPoker(hand,level,random);
  default:throw Error('CPU非対応のゲームです。');
 }
}
export const CPU_DIFFICULTY_GUIDE={
 othello:{easy:'合法手からランダム。角や相手の打てる場所は考えない。',normal:'2手先まで探索。角・辺・石の配置・相手の合法手数を評価。',strong:'最大4手先まで探索。角の確保、相手の手数制限、後の展開まで考える。'},
 gomoku:{easy:'空いているマスからランダムに置く。相手の連続した石は考慮しない。',normal:'五連の完成・相手の即勝ち阻止を最優先し、周囲の連を評価。',strong:'相手の応手を検討し、一手では防げない二重の五連候補を探す。'},
 connect4:{easy:'置ける列からランダムに選ぶ。連続したコマや次の勝ち筋は考慮しない。',normal:'即勝ち・即負けを確認し、最大3手先まで探索。',strong:'最大7手先まで探索。複数の勝ち筋と相手の反撃を調べる。'},
 hitblow:{easy:'公開されたHit・Blowと矛盾しない数字から、ランダムに予想する。',normal:'公開ヒントに矛盾しない数字から6候補・最大55回答を比較する。',strong:'最大1,450回答・110候補を比較し、正解にもなり得る数字を選ぶ。'},
 bluffdice:{easy:'ダイスの確率を計算せず、ランダムな宣言や疑いを多用する。',normal:'自分の目から成立確率を計算し、無理の少ない宣言を選ぶ。',strong:'自分のダイスだけで必ず成立する強い宣言を優先し、確率と過去のブラフ傾向で疑いを判断。'},
 poker:{easy:'役を考えずランダムに0〜3枚を交換。',normal:'役・ペア・フラッシュやストレートの待ちを残して交換。',strong:'交換26通りを共通の440局面で比較し、明確な勝率改善がある交換だけを採用する。'}
};
