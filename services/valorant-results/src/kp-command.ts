// Register these guild commands individually; never replace /death, /valo or the Activity entry point.
export const KP_COMMAND_VERSION='kp-slash-v1';
export const kpCommands=[
 {type:1,name:'kp',description:'KESO PLAY｜自分のKP残高と最近の入出金を確認'},
 {type:1,name:'keiba',description:'KESO PLAY｜受付中のレース・馬番・倍率を確認'},
 {type:1,name:'bet',description:'KESO PLAY｜受付中の競馬にKPで賭ける（購入後の取消不可）',options:[
  {type:3,name:'race',description:'発走時刻（例 21:00）。/keiba で確認',required:true},
  {type:4,name:'horse',description:'馬番',required:true,min_value:1,max_value:10},
  {type:4,name:'amount',description:'掛け金（100 KP以上・100 KP単位）',required:true,min_value:100,max_value:50000},
  {type:3,name:'type',description:'券種',required:true,choices:[{name:'1着当て（単勝）',value:'win'},{name:'3着以内当て（複勝）',value:'place'}]},
 ]},
];
export async function registerKpCommands(applicationId:string,guildId:string,api:(path:string,method?:string,body?:unknown)=>Promise<any>){
 const me=await api('/users/@me');if(me.id!==applicationId||me.bot!==true)throw Error('kp_command_application_mismatch');
 const path='/applications/'+applicationId+'/guilds/'+guildId+'/commands',existing=await api(path);
 if(!Array.isArray(existing))throw Error('kp_command_list_unavailable');
 // Refuse to take over an unrelated command with the same name.
 for(const command of kpCommands){const old=existing.find(c=>c.name===command.name);if(old&&!String(old.description).startsWith('KESO PLAY｜'))throw Error('kp_command_name_conflict');}
 for(const command of kpCommands){const registered=await api(path,'POST',command);if(registered?.name!==command.name||registered?.type!==1||typeof registered?.id!=='string')throw Error('kp_command_registration_unconfirmed');}
 return kpCommands.length;
}
