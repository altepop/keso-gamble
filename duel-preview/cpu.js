// Pure CPU decision entrypoint. No API, D1, KP, network or opponent secret access.
// Difficulty changes the search method and decision quality, not the game rules.
import {chooseOthello,chooseGomoku,chooseConnect4} from './cpu-board-search.js';
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
 gomoku:{easy:'空いているマスからランダムに置く。相手の連続した石は考慮しない。',normal:'五連の完成・相手の即勝ち阻止を最優先し、周囲の連を評価。',strong:'相手の次の応手まで調べ、二重の脅威や防御を優先する。'},
 connect4:{easy:'置ける列からランダム。',normal:'即勝ち・即負けを確認し、最大3手先まで探索。',strong:'最大7手先まで探索。複数の勝ち筋と相手の反撃を調べる。'},
 hitblow:{easy:'矛盾しない数字をランダムに推理。',normal:'候補の分割を100回答・15質問で比較。',strong:'最大480回答・64質問を比較し、候補を効率よく減らす。'},
 bluffdice:{easy:'ランダムな宣言や疑いを多用する。',normal:'自分の目から成立確率を計算し、無理の少ない宣言を選ぶ。',strong:'成立確率と公開された過去のブラフ率から、疑い・宣言を判断。'},
 poker:{easy:'役を考えずランダムに0〜3枚を交換。',normal:'役・ペア・フラッシュやストレートの待ちを残して交換。',strong:'交換26通りすべてを112回ずつ模擬対戦し、勝率が高い交換を選ぶ。'}
};
