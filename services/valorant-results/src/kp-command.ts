// Register these guild commands individually; never replace /death, /valo or the Activity entry point.
export const KP_COMMAND_VERSION='kp-slash-v7-grant';
export const kpCommands=[
 {type:1,name:'kp',description:'KESO PLAY｜KP残高・ランキング',options:[
  {type:1,name:'balance',description:'自分の残高と最近の入出金（本人だけに表示）'},
  {type:1,name:'ranking',description:'サーバーのKP残高ランキング上位10人をチャットへ公開'},
 ]},
 {type:1,name:'keiba',description:'KESO PLAY｜受付中のレース・馬番・倍率を確認'},
 {type:1,name:'bet',description:'KESO PLAY｜受付中の競馬にKPで賭ける（購入後の取消不可）',options:[
  {type:3,name:'race',description:'発走時刻（例 21:00）。/keiba で確認',required:true},
  {type:4,name:'horse',description:'馬番',required:true,min_value:1,max_value:10},
  {type:4,name:'amount',description:'掛け金（100 KP以上・100 KP単位）',required:true,min_value:100,max_value:50000},
  {type:3,name:'type',description:'券種',required:true,choices:[{name:'1着当て（単勝）',value:'win'},{name:'3着以内当て（複勝）',value:'place'}]},
 ]},
 {type:1,name:'mleague',description:'KESO PLAY｜Mリーグ予想：次の試合の選手番号と倍率を確認'},
 {type:1,name:'mbet',description:'KESO PLAY｜Mリーグ予想：ラスになる選手にKPで賭ける（取消不可）',options:[
  {type:3,name:'match',description:'卓-試合（例 1-1 は1卓の第1試合）。/mleague で確認',required:true,choices:['1-1','1-2','2-1','2-2'].map(v=>({name:v.replace(/^(\d)-(\d)$/,'$1卓 第$2試合'),value:v}))},
  {type:4,name:'player',description:'選手番号（/mleague で確認）',required:true,min_value:1,max_value:16},
  {type:4,name:'amount',description:'掛け金（100 KP以上・100 KP単位）',required:true,min_value:100,max_value:50000},
 ]},
 {type:1,name:'mclose',description:'KESO PLAY｜Mリーグ予想：試合が始まったので締め切る（登録メンバー。開始後の予想は返金）',options:[
  {type:3,name:'match',description:'卓-試合',required:true,choices:['1-1','1-2','2-1','2-2'].map(v=>({name:v.replace(/^(\d)-(\d)$/,'$1卓 第$2試合'),value:v}))},
  {type:3,name:'at',description:'試合が始まった時刻（例 21:42）。省略すると今',required:false,max_length:5},
 ]},
 {type:1,name:'kpgrant',description:'KESO PLAY｜KPを手動で付与・回収（管理者のみ。稼ぎchに告知）',options:[
  {type:6,name:'user',description:'相手',required:true},
  {type:4,name:'amount',description:'付与するKP（回収はマイナス）',required:true,min_value:-100000,max_value:100000},
  {type:3,name:'reason',description:'理由（例 雀魂 10/28 4位）',required:true,max_length:60},
 ]},
 {type:1,name:'paifu',description:'KESO PLAY｜雀魂の牌譜URLで結果を申請（他のメンバーの承認でKP）',options:[
  {type:3,name:'url',description:'牌譜の共有URL（game.mahjongsoul.com/?paipu=...）',required:true,max_length:300},
  {type:3,name:'game',description:'対局の種類',required:true,choices:[{name:'四麻 半荘',value:'4-hanchan'},{name:'四麻 東風',value:'4-tonpu'},{name:'三麻 半荘',value:'3-hanchan'},{name:'三麻 東風',value:'3-tonpu'}]},
  {type:4,name:'rank',description:'自分の順位',required:true,choices:[1,2,3,4].map(n=>({name:n+'位',value:n}))},
 ]},
] as const;
/** Compares what Discord stores with a definition, ignoring fields Discord adds (ids, localizations, defaults). */
function shape(value:any):unknown{
 if(Array.isArray(value))return value.map(shape);
 if(!value||typeof value!=='object')return value;
 const out:Record<string,unknown>={};
 for(const key of ['type','name','value','description','required','min_value','max_value','max_length','choices','options'])
  if(value[key]!==undefined&&value[key]!==null&&!(key==='required'&&value[key]===false)&&!(Array.isArray(value[key])&&!value[key].length))out[key]=shape(value[key]);
 return out;
}
export const sameCommand=(stored:unknown,command:unknown)=>Boolean(stored)&&JSON.stringify(shape(stored))===JSON.stringify(shape(command));
export async function registerKpCommands(applicationId:string,guildId:string,api:(path:string,method?:string,body?:unknown)=>Promise<any>,pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms)),gap=5000){
 const me=await api('/users/@me');if(me.id!==applicationId||me.bot!==true)throw Error('kp_command_application_mismatch');
 const path='/applications/'+applicationId+'/guilds/'+guildId+'/commands',existing=await api(path);
 if(!Array.isArray(existing))throw Error('kp_command_list_unavailable');
 // Refuse to take over an unrelated command with the same name.
 for(const command of kpCommands){const old=existing.find(c=>c.name===command.name);if(old&&!String(old.description).startsWith('KESO PLAY｜'))throw Error('kp_command_name_conflict');}
 // Only changed commands are written, a few seconds apart: Discord rate-limits command creation, and a
 // retry restarts from the first command, so writing all of them every time could never finish.
 let written=0;
 for(const command of kpCommands){
  if(sameCommand(existing.find(c=>c.name===command.name),command))continue;
  if(written)await pause(gap);
  const registered=await api(path,'POST',command);written++;
  if(registered?.name!==command.name||registered?.type!==1||typeof registered?.id!=='string')throw Error('kp_command_registration_unconfirmed');
 }
 return written;
}

/** Only this exact read-only subcommand may produce a public reply. */
export function isKpRanking(i:{data?:{name?:string;options?:Array<{name:string;type?:number;options?:unknown[]}>}}){
 const options=i.data?.options;
 return i.data?.name==='kp'&&options?.length===1&&options[0].name==='ranking'&&options[0].type===1&&(!options[0].options||options[0].options.length===0);
}
