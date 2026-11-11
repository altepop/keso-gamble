import {activityLaunchComponents} from './activity-link.ts';
export const GAME_CHOICES=[
 {name:'オセロ',value:'othello',emoji:'⚫',note:'挟んで石を裏返す'},
 {name:'五目並べ',value:'gomoku',emoji:'🔵',note:'先に5つ並べる'},
 {name:'四目並べ',value:'connect4',emoji:'🟡',note:'落として4つ並べる'},
 {name:'Hit & Blow',value:'hitblow',emoji:'🔢',note:'数字と位置を推理'},
 {name:'ブラフダイス',value:'bluffdice',emoji:'🎲',note:'相手の宣言を見抜く'},
 {name:'簡易ポーカー',value:'poker',emoji:'🃏',note:'役と読み合いで勝負'},
] as const;
export type GameId=typeof GAME_CHOICES[number]['value'];
export const GAME_IDS=new Set<string>(GAME_CHOICES.map(g=>g.value));
export const CHOOSE_BUTTON=/^gc:choose:(othello|gomoku|connect4|hitblow|bluffdice|poker)$/;
export const RECRUIT_BUTTON=/^gc:(join|leave):(\d{15,22})$/;
export const DUEL_BUTTON=/^gc:duel:(accept|decline):([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
export const gameName=(id:string)=>GAME_CHOICES.find(g=>g.value===id)?.name??'ゲーム';
const btn=(custom_id:string,label:string,style=2)=>({type:2,style,label,custom_id});
const txt=(content:string)=>({type:10,content});
export const GAME_CENTER_COMMANDS=[
 {type:1,name:'play',description:'KESO PLAY｜Discordゲームセンターを開く',options:[]},
 {type:1,name:'duel',description:'KESO PLAY｜相手を指名して決闘に招待する',options:[
  {type:6,name:'opponent',description:'招待する相手（Discordメンバー）',required:true},
  {type:3,name:'game',description:'対戦するゲーム',required:true,choices:GAME_CHOICES.map(g=>({name:g.name,value:g.value}))},
  {type:4,name:'stake',description:'1人あたりのKP（勝者総取り・100〜100000）',required:true,min_value:100,max_value:100000},
 ]},
 {type:1,name:'recruit',description:'KESO PLAY｜ゲーム参加者をリアクションで募集',options:[
  {type:3,name:'game',description:'募集するゲーム',required:true,choices:GAME_CHOICES.map(g=>({name:g.name,value:g.value}))},
  {type:4,name:'slots',description:'募集人数（2〜10、初期値5）',required:false,min_value:2,max_value:10},
 ]},
] as const;
export function gameCenterCard(applicationId:string){
 return {flags:32768,components:[{type:17,accent_color:0x5865f2,components:[
  txt('## 🎮 KESO PLAY ゲームセンター\n遊びたいゲームを選ぼう。'),
  {type:1,components:GAME_CHOICES.slice(0,3).map(g=>btn('gc:choose:'+g.value,g.emoji+' '+g.name))},
  {type:1,components:GAME_CHOICES.slice(3).map(g=>btn('gc:choose:'+g.value,g.emoji+' '+g.name))},
  txt('### 対戦と募集\n/duel で相手を指名し、/recruit で参加者を募集。\n招待承諾後はActivityの「決闘」タブで対戦する。'),
  activityLaunchComponents(applicationId)[0],
 ]}]};
}
export function gameDetailCard(game:GameId,applicationId:string){
 const g=GAME_CHOICES.find(row=>row.value===game)!;
 return {flags:32768|64,components:[{type:17,accent_color:0x5865f2,components:[
  txt('## '+g.emoji+' '+g.name+'\n'+g.note),
  txt('/duel：相手を指名してKP決闘を申し込む\n/recruit：✅リアクションで参加者を集める'),
  activityLaunchComponents(applicationId)[0],
 ]}]};
}
export interface InviteView {id:string;user_a:string;user_b:string;game:string;stake:number;status:string}
export function duelInviteCard(m:InviteView,applicationId:string){
 const active=m.status==='active',pending=m.status==='pending';
 return {flags:32768,components:[{type:17,accent_color:active?0x2ecc71:pending?0x5865f2:0x808080,components:[
  txt('## '+(active?'✅ 決闘スタート！':pending?'⚔️ 対戦招待':'🕊️ 招待終了')+'｜'+gameName(m.game)),
  txt('<@'+m.user_a+'> から <@'+m.user_b+'> への招待\n賭け金：**各 '+m.stake.toLocaleString('ja-JP')+' KP**（勝者総取り）'),
  ...(pending?[
   {type:1,components:[btn('gc:duel:accept:'+m.id,'✅ 承諾',3),btn('gc:duel:decline:'+m.id,'❌ 辞退',4)]},
   txt('-# 招待期限15分。承諾時に両者のKPを同時に預かる。本人以外は承諾できない。'),
  ]:[txt(active?'対戦を開始した。Activityの「決闘」タブで手番を確認しよう。':'招待は終了した。')]),
  ...(active?[activityLaunchComponents(applicationId)[0]]:[]),
 ]}]};
}
export interface RecruitView {id:string;game:string;owner:string;slots:number;expires_at:number;participants:string[]}
export function recruitCard(m:RecruitView,applicationId:string){
 const until=new Date(m.expires_at+9*3600000).toISOString().slice(11,16);
 return {flags:32768,components:[{type:17,accent_color:0x5865f2,components:[
  txt('## 🎮 '+gameName(m.game)+' 参加者募集\n主催：<@'+m.owner+'>'),
  txt('**'+m.participants.length+' / '+m.slots+'人**\n'+m.participants.map((p,i)=>(i+1)+'. <@'+p+'>').join('\n')),
  {type:1,components:[btn('gc:join:'+m.id,'✅ 参加する',3),btn('gc:leave:'+m.id,'❌ 退出する')]},
  txt('-# ✅リアクションでも参加可能。外すと退出。先着順・重複参加なし。\n-# '+until+' JSTで終了。KPは消費しない。'),
  activityLaunchComponents(applicationId)[0],
 ]}]};
}
