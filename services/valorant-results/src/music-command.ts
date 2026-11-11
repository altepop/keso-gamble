import tracks from '../../music-voice/catalog.json' with {type:'json'};
import discord from '../discord-config.json' with {type:'json'};

export const MUSIC_COMMAND_VERSION='music-voice-v4-ten-tracks-yuzuan';
export const MUSIC_BUTTON=/^ms:(pause|resume|skip|stop|queue|leave|all|radio|shuffle)$/;
export const musicControls=()=>[
 {type:1,components:[
  {type:2,style:2,label:'⏸ 一時停止',custom_id:'ms:pause'},
  {type:2,style:3,label:'▶ 再開',custom_id:'ms:resume'},
  {type:2,style:1,label:'⏭ 次へ',custom_id:'ms:skip'},
  {type:2,style:2,label:'🔄 更新',custom_id:'ms:queue'},
  {type:2,style:4,label:'👋 退出',custom_id:'ms:leave'},
 ]},
 {type:1,components:[
  {type:2,style:4,label:'⏹ 停止',custom_id:'ms:stop'},
  {type:2,style:1,label:'📻 RADIO',custom_id:'ms:radio'},
  {type:2,style:1,label:'🎼 全曲',custom_id:'ms:all'},
  {type:2,style:2,label:'🔀 シャッフル',custom_id:'ms:shuffle'},
 ]},
];
export const MUSIC_COMMAND={
 type:1,name:'music',description:'KESO PLAY｜オリジナル曲の再生・ラジオ・全曲再生',
 options:[
  {type:1,name:'play',description:'選んだ曲をVCで再生・キューに追加',options:[
   {type:3,name:'song',description:'再生するオリジナル曲',required:true,
    choices:tracks.map(t=>({name:t.title,value:t.id}))},
  ]},
  {type:1,name:'radio',description:'KESO RADIO：全曲が一巡するまで重複せずランダム再生し続ける'},
  {type:1,name:'all',description:'全オリジナル楽曲を収録順に1回ずつ再生する'},
  {type:1,name:'shuffle',description:'現在の曲を変えず、再生待ちの曲だけシャッフル'},
  {type:1,name:'panel',description:'再生時間・曲順・各種ボタンを表示する'},
  {type:1,name:'queue',description:'現在の再生状況とキューを表示'},
  {type:1,name:'skip',description:'再生中の曲をスキップ'},
  {type:1,name:'pause',description:'一時停止'},
  {type:1,name:'resume',description:'一時停止から再開'},
  {type:1,name:'stop',description:'再生を停止しキューを消去'},
  {type:1,name:'leave',description:'BotをVCから退出させる'},
  {type:1,name:'volume',description:'音楽の音量を変更',options:[
   {type:4,name:'percent',description:'音量（1〜100%・初期20%）',required:true,min_value:1,max_value:100},
  ]},
  {type:1,name:'loop',description:'ラジオ以外のリピート方式を設定',options:[
   {type:3,name:'mode',description:'リピート方式',required:true,
    choices:[{name:'オフ',value:'off'},{name:'1曲',value:'one'},{name:'全体',value:'all'}]},
  ]},
 ]} as const;

type Option={type?:number;name?:string;value?:string|number;options?:Option[]};
export interface MusicInteraction {
 id:string;guild_id?:string;member?:{user?:{id:string}};
 data?:{name?:string;custom_id?:string;options?:Option[]};
}
export interface MusicBridgeEnv {MUSIC_VOICE_URL?:string;MUSIC_BRIDGE_TOKEN?:string}
export interface MusicTrackView {id:string;title:string;durationSec?:number|null}
export interface MusicView {
 current:MusicTrackView|null;queue:MusicTrackView[];elapsedSec:number;
 volume:number;paused:boolean;loop:string;mode:string;cycle?:number;state?:string;
}
export interface MusicReply {message:string;view?:MusicView;pending?:boolean}
function looksLikeView(v:unknown):v is MusicView{
 if(!v||typeof v!=='object')return false;
 const data=v as Partial<MusicView>;
 return (data.current===null||(!!data.current&&typeof data.current.title==='string'))
  &&Array.isArray(data.queue)&&data.queue.length<=30
  &&data.queue.every(t=>t&&typeof t.title==='string')
  &&Number.isFinite(data.volume)&&Number(data.volume)>=1&&Number(data.volume)<=100
  &&typeof data.paused==='boolean'&&typeof data.mode==='string'
  &&typeof data.loop==='string'&&Number.isFinite(data.elapsedSec);
}
const songTime=(v:unknown)=>{
 if(v===null||v===undefined)return '--:--';
 const n=Number(v);
 if(!Number.isFinite(n)||n<0)return '--:--';
 const seconds=Math.floor(n);
 return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
};
export function musicPanel({message,view}:MusicReply){
 if(!view)return {content:message,components:[],embeds:[]};
 const current=view.current?.title??'停止中';
 const mode=view.mode==='radio'?'📻 KESO RADIO':view.mode==='all'?'🎼 全曲再生':'🎵 通常再生';
 const waiting=view.queue.slice(0,8).map((t,i)=>
  '\u0060'+String(i+1).padStart(2,'0')+'\u0060 '+t.title.slice(0,95)
  +(typeof t.durationSec==='number'?' ・ '+songTime(t.durationSec):'')).join('\n');
 const count=view.queue.length;
 const elapsed=songTime(view.elapsedSec);
 const total=songTime(view.current?.durationSec);
 const embed={
  title:'🎧 KESO PLAY MUSIC',
  description:'**'+current.slice(0,140)+'**\n'+
   (view.paused?'⏸ 一時停止中':view.current?'▶ 再生中':'⏹ 待機中')+
   '  ·  '+elapsed+' / '+total,
  color:0x5865F2,
  fields:[
   {name:'再生モード',value:mode+'\n🔁 '+(view.mode==='radio'?'全曲を循環':view.loop==='one'?'1曲':view.loop==='all'?'全体':'オフ'),inline:true},
   {name:'音量',value:'🔊 '+view.volume+'%',inline:true},
   {name:'次の曲',value:view.queue[0]?.title.slice(0,95)??'なし',inline:true},
   {name:'再生待ち '+count+'曲',value:waiting+(count>8?'\nほか '+(count-8)+'曲':'')||'なし',inline:false},
  ],
  footer:{text:'KESO PLAY オリジナル楽曲  |  更新ボタンで再生位置を再取得'},
 };
 return {content:message.slice(0,1500),embeds:[embed],components:musicControls()};
}
export function parseMusic(i:MusicInteraction){
 const button=MUSIC_BUTTON.exec(i.data?.custom_id??'');
 if(button)return {action:button[1],track:undefined,volume:undefined,loop:undefined};
 const sub=i.data?.options?.[0];
 if(i.data?.name!=='music'||sub?.type!==1)throw Error('音楽コマンドを確認できない。');
 const allowed=new Set(['play','radio','all','shuffle','panel','queue','skip','pause','resume','stop','leave','volume','loop']);
 if(!allowed.has(sub.name??''))throw Error('音楽コマンドが不正だ。');
 const v=(key:string)=>sub.options?.find(o=>o.name===key)?.value;
 const track=sub.name==='play'?v('song'):undefined;
 const volume=sub.name==='volume'?v('percent'):undefined;
 const loop=sub.name==='loop'?v('mode'):undefined;
 if(sub.name==='play'&&!tracks.some(t=>t.id===track))throw Error('再生する曲を選んでほしい。');
 if(sub.name==='volume'&&(!Number.isSafeInteger(volume)||Number(volume)<1||Number(volume)>100))
  throw Error('音量は1〜100で指定してほしい。');
 if(sub.name==='loop'&&!['off','one','all'].includes(String(loop)))throw Error('リピート方式を選んでほしい。');
 return {action:sub.name,track,volume,loop};
}
export async function runMusicDetails(env:MusicBridgeEnv,i:MusicInteraction,request:typeof fetch=fetch,workerOrigin?:string):Promise<MusicReply>{
 const parsed=parseMusic(i);
 const guildId=i.guild_id,userId=i.member?.user?.id,requestId=i.id;
 if(![guildId,userId,requestId].every(x=>/^\d{15,22}$/.test(x??'')))throw Error('Discordの操作を確認できない。');
 if(!env.MUSIC_VOICE_URL||!env.MUSIC_BRIDGE_TOKEN||env.MUSIC_BRIDGE_TOKEN.length<32)
  return {message:'🎵 音楽Botの再生サーバーはまだ接続されていない。管理者の設定完了後に利用できる。'};
 let base:URL;
 try{
  base=new URL(env.MUSIC_VOICE_URL);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||
   !(base.hostname.endsWith('.onrender.com')||base.hostname.endsWith('.render.com')))
    throw Error('invalid server');
 }catch{return {message:'⚙️ 音楽Botの接続設定を確認してほしい。'};}
 // A sleep wake-up is a read-only GET, so it cannot enqueue a song twice.
 try{
  const headers:Record<string,string>={Authorization:'Bearer '+env.MUSIC_BRIDGE_TOKEN};
  if(workerOrigin){
   try{const url=new URL(workerOrigin);
    if(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash
       &&(url.hostname.endsWith('.workers.dev')||url.hostname.endsWith('.pages.dev')))
      headers['X-Keso-Music-State-URL']=url.origin;
   }catch{ /* No remote-controlled state endpoint. */ }
  }
  const status=await request(new URL('/health',base),{method:'GET',headers,signal:AbortSignal.timeout(8_000)});
  const ready=status.ok ? (await status.json() as {status?:unknown}).status==='ready':false;
  if(!ready)return {message:'⏳ 音楽Botを起動中だ。自動復帰を試みる。',pending:true};
 }catch{return {message:'⏳ 音楽Botの起動を確認できなかった。自動復帰を試みる。',pending:true};}
 try{
  const response=await request(new URL('/v1/music',base),{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.MUSIC_BRIDGE_TOKEN},
   body:JSON.stringify({guildId,userId,requestId,applicationId:discord.applicationId,...parsed}),
   signal:AbortSignal.timeout(23_000),
  });
  const data=await response.json() as {ok?:unknown;message?:unknown;view?:unknown};
  if(typeof data.message!=='string'||data.message.length>2000)throw Error('invalid response');
  if(!response.ok||data.ok!==true)return {message:data.message};
  return {message:data.message,...(looksLikeView(data.view)?{view:data.view}:{})};
 }catch{return {message:'音楽Botの応答を確認できなかった。二重追加を避けるため、/music queue で状態を確かめてほしい。'};}
}
export async function runMusic(env:MusicBridgeEnv,i:MusicInteraction,request:typeof fetch=fetch):Promise<string>{
 return (await runMusicDetails(env,i,request)).message;
}
