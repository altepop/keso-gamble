import tracks from '../../music-voice/catalog.json' with {type:'json'};
export const MUSIC_COMMAND_VERSION='music-voice-v1';
export const MUSIC_COMMAND={
 type:1,name:'music',description:'KESO PLAY｜VCでオリジナル楽曲を再生・キュー操作',
 options:[
  {type:1,name:'play',description:'VCに参加してKESO PLAYの音楽を再生・キュー追加',options:[
   {type:3,name:'song',description:'再生する楽曲',required:true,
    choices:tracks.map(t=>({name:t.title,value:t.id}))},
  ]},
  {type:1,name:'queue',description:'再生中の曲とキューを確認'},
  {type:1,name:'skip',description:'再生中の曲をスキップ'},
  {type:1,name:'pause',description:'一時停止'},
  {type:1,name:'resume',description:'一時停止から再開'},
  {type:1,name:'stop',description:'再生を停止しキューを消去'},
  {type:1,name:'leave',description:'音楽BotをVCから退出させる'},
  {type:1,name:'volume',description:'VCの音楽音量を変更',options:[
   {type:4,name:'percent',description:'音量（1〜100%・初期20%）',required:true,min_value:1,max_value:100},
  ]},
  {type:1,name:'loop',description:'リピート方式を設定',options:[
   {type:3,name:'mode',description:'リピート方式',required:true,
    choices:[{name:'オフ',value:'off'},{name:'1曲',value:'one'},{name:'キュー全体',value:'all'}]},
  ]},
 ]} as const;
type Option={type?:number;name?:string;value?:string|number;options?:Option[]};
export interface MusicInteraction {
 id:string;guild_id?:string;member?:{user?:{id:string}};
 data?:{name?:string;options?:Option[]};
}
export interface MusicBridgeEnv{MUSIC_VOICE_URL?:string;MUSIC_BRIDGE_TOKEN?:string}
export function parseMusic(i:MusicInteraction){
 const sub=i.data?.options?.[0];
 if(i.data?.name!=='music'||sub?.type!==1)throw Error('音楽コマンドを確認できない。');
 const allowed=new Set(['play','queue','skip','pause','resume','stop','leave','volume','loop']);
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
export async function runMusic(env:MusicBridgeEnv,i:MusicInteraction,request:typeof fetch=fetch):Promise<string>{
 const parsed=parseMusic(i);
 const guildId=i.guild_id,userId=i.member?.user?.id,requestId=i.id;
 if(![guildId,userId,requestId].every(x=>/^\d{15,22}$/.test(x??'')))throw Error('Discordの操作を確認できない。');
 if(!env.MUSIC_VOICE_URL||!env.MUSIC_BRIDGE_TOKEN||env.MUSIC_BRIDGE_TOKEN.length<32)
  return '🎵 音楽Botの再生サーバーはまだ接続されていない。管理者の設定完了後に利用できる。';
 let base:URL;
 try{
  base=new URL(env.MUSIC_VOICE_URL);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||
   !(base.hostname.endsWith('.onrender.com')||base.hostname.endsWith('.render.com')))
    throw Error('invalid server');
 }catch{return '⚙️ 音楽Botの接続設定を確認してほしい。';}
 // A free web service can take a minute to wake. Perform a side-effect-free
 // readiness check first so an ambiguous timeout cannot enqueue a song twice.
 try{
  const status=await request(new URL('/health',base),{
   method:'GET',signal:AbortSignal.timeout(8_000),
  });
  const ready=status.ok ? (await status.json() as {status?:unknown}).status==='ready':false;
  if(!ready)return '⏳ 音楽Botを起動中だ。再生サーバーが準備できたら、もう一度コマンドを実行してほしい。';
 }catch{return '⏳ 音楽Botの起動を確認できなかった。少し後にもう一度実行してほしい。';}
 try{
  const response=await request(new URL('/v1/music',base),{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.MUSIC_BRIDGE_TOKEN},
   body:JSON.stringify({guildId,userId,requestId,...parsed}),
   signal:AbortSignal.timeout(23_000),
  });
  const data=await response.json() as {ok?:unknown;message?:unknown};
  if(typeof data.message!=='string'||data.message.length>2000)throw Error('invalid response');
  if(!response.ok&&!data.ok) return data.message;
  return data.message;
 }catch{return '音楽Botの応答を確認できなかった。二重追加を避けるため、/music queue で状態を確かめてほしい。';}
}
