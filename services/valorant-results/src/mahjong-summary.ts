// Turns a decoded Mahjong Soul paipu into facts the bot may state: who won with which yaku, who
// dealt into whom, riichi and calls, and how the scores moved. Pure; shared by the GitHub Actions
// fetcher (which decodes the game's protobuf) and the Worker tests.
import fans from '../mahjong-fans.json' with {type:'json'};

export interface PaipuHead {
 uuid:string;start_time:number;end_time:number;
 config?:{mode?:{mode?:number}};
 accounts?:Array<{account_id:number;seat:number;nickname:string}>;
 result?:{players?:Array<{seat:number;part_point_1:number}>};
}
/** One record with the type name without the ".lq." prefix, e.g. RecordNewRound. */
export interface PaipuAction {name:string;data:any}
export interface Win {seat:number;from:number|null;han:number;fu:number;yakuman:number;title:string;value:number;yaku:string[];riichi:boolean}
export interface Round {
 label:string;dealer:number;start:number[];delta:number[];
 wins:Win[];draw:null|{kind:'exhaustive'|'abortive';tenpai:number[]};
 riichi:number[];calls:number[];
}
export interface PlayerSummary {
 seat:number;accountId:number;nickname:string;rank:number;score:number;
 wins:number;tsumo:number;dealIns:number;dealInPoints:number;riichi:number;riichiWins:number;riichiDealIns:number;
 callRounds:number;rounds:number;maxScore:number;minScore:number;bestLead:number;
}
export interface PaipuSummary {v:1;uuid:string;game:string;players:number;start:number;end:number;seats:PlayerSummary[];rounds:Round[]}

const WINDS=['東','南','西','北'];
const FAN_NAMES:Record<string,string>=fans;
/** Dora-like yaku are counted ("ドラ3"); every other yaku is listed by name. */
const COUNTED=new Set([31,32,33,34]);
export function gameType(mode:number|undefined,players:number){
 const length=mode===1||mode===11?'tonpu':mode===2||mode===12?'hanchan':null;
 return length?`${players}-${length}`:null;
}
export function handTitle(han:number,fu:number,yakuman:number){
 if(yakuman>=2)return `${['','','二','三','四','五','六'][yakuman]??yakuman}倍役満`;
 if(yakuman===1)return '役満';
 if(han>=13)return '数え役満';
 if(han>=11)return '三倍満';
 if(han>=8)return '倍満';
 if(han>=6)return '跳満';
 if(han>=5||(han===4&&fu>=40)||(han===3&&fu>=70))return '満貫';
 return `${han}翻${fu}符`;
}
function yakuNames(list:Array<{id?:number;val?:number;name?:string}>=[],yiman:boolean){
 return list.filter(f=>(f.val??0)>0||yiman).map(f=>{
  const name=FAN_NAMES[String(f.id)]??(f.name||`役${f.id}`);
  return COUNTED.has(f.id??0)?`${name}${f.val}`:name;
 });
}
export function summarizePaipu(head:PaipuHead,actions:PaipuAction[]):PaipuSummary{
 const accounts=head.accounts??[],result=head.result?.players??[];
 const players=result.length||accounts.length;
 if(players<3||players>4)throw Error('unsupported_player_count');
 const game=gameType(head.config?.mode?.mode,players);
 if(!game)throw Error('unsupported_mode');
 const seats:PlayerSummary[]=Array.from({length:players},(_,seat)=>{
  const account=accounts.find(a=>a.seat===seat),rank=result.findIndex(p=>p.seat===seat);
  return {seat,accountId:account?.account_id??0,nickname:account?.nickname??'CPU',rank:rank+1,score:result[rank]?.part_point_1??0,
   wins:0,tsumo:0,dealIns:0,dealInPoints:0,riichi:0,riichiWins:0,riichiDealIns:0,callRounds:0,rounds:0,maxScore:-Infinity,minScore:Infinity,bestLead:0};
 });
 if(seats.some(s=>s.rank<1))throw Error('incomplete_result');
 const rounds:Round[]=[];let round:Round|null=null,lastFrom:number|null=null;
 const touch=(scores:number[])=>{
  const order=[...scores].sort((a,b)=>b-a);
  scores.forEach((score,seat)=>{const s=seats[seat];s.maxScore=Math.max(s.maxScore,score);s.minScore=Math.min(s.minScore,score);if(score===order[0])s.bestLead=Math.max(s.bestLead,score-order[1]);});
 };
 const close=(delta:number[]|undefined)=>{
  if(!round)return;
  round.delta=Array.from({length:players},(_,i)=>delta?.[i]??0);
  touch(round.start.map((score,i)=>score+round!.delta[i]));
  rounds.push(round);round=null;
 };
 for(const {name,data} of actions){
  if(name==='RecordNewRound'){
   close(undefined);
   const start=Array.from({length:players},(_,i)=>Number(data.scores?.[i]??0));
   round={label:`${WINDS[data.chang]??'?'}${(data.ju??0)+1}局${data.ben?` ${data.ben}本場`:''}`,dealer:data.ju??0,start,delta:[],wins:[],draw:null,riichi:[],calls:[]};
   touch(start);seats.forEach(s=>s.rounds++);lastFrom=null;
  }else if(!round)continue;
  else if(name==='RecordDiscardTile'){
   lastFrom=data.seat;
   if((data.is_liqi||data.is_wliqi)&&!round.riichi.includes(data.seat)){round.riichi.push(data.seat);seats[data.seat].riichi++;}
  }else if(name==='RecordAnGangAddGang'||name==='RecordBaBei')lastFrom=data.seat;
  else if(name==='RecordChiPengGang'){if(!round.calls.includes(data.seat)){round.calls.push(data.seat);seats[data.seat].callRounds++;}}
  else if(name==='RecordHule'){
   for(const h of data.hules??[]){
    const from=h.zimo?null:lastFrom,yakuman=h.yiman?Math.max(1,h.count??1):0;
    const han=yakuman?0:(h.count||(h.fans??[]).reduce((n:number,f:{val?:number})=>n+(f.val??0),0));
    const value=h.point_sum||(h.zimo?(h.qinjia?h.point_zimo_xian*(players-1):h.point_zimo_qin+h.point_zimo_xian*(players-2)):h.point_rong)||0;
    const win:Win={seat:h.seat,from,han,fu:h.fu??0,yakuman,title:handTitle(han,h.fu??0,yakuman),value,yaku:yakuNames(h.fans,Boolean(h.yiman)),riichi:round.riichi.includes(h.seat)};
    round.wins.push(win);
    const s=seats[h.seat];s.wins++;if(h.zimo)s.tsumo++;if(win.riichi)s.riichiWins++;
    if(from!==null&&seats[from]){seats[from].dealIns++;seats[from].dealInPoints+=value;if(round.riichi.includes(from))seats[from].riichiDealIns++;}
   }
   close(data.delta_scores);
  }else if(name==='RecordNoTile'){
   round.draw={kind:'exhaustive',tenpai:(data.players??[]).flatMap((p:{tingpai?:boolean},i:number)=>p.tingpai?[i]:[])};
   const delta=Array<number>(players).fill(0);
   for(const s of data.scores??[])(s.delta_scores??[]).forEach((d:number,i:number)=>{delta[i]+=d;});
   close(delta);
  }else if(name==='RecordLiuJu'){round.draw={kind:'abortive',tenpai:[]};close(undefined);}
 }
 close(undefined);
 for(const s of seats){if(!Number.isFinite(s.maxScore)){s.maxScore=s.score;s.minScore=s.score;}s.minScore=Math.min(s.minScore,s.score);s.maxScore=Math.max(s.maxScore,s.score);}
 return {v:1,uuid:head.uuid,game,players,start:head.start_time*1000,end:head.end_time*1000,seats,rounds};
}
