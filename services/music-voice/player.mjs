import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {joinVoiceChannel,createAudioPlayer,createAudioResource,AudioPlayerStatus,
 NoSubscriberBehavior,entersState,VoiceConnectionStatus} from '@discordjs/voice';
import ffmpegStatic from 'ffmpeg-static';
import {ChannelType} from 'discord.js';
import catalog from './catalog.json' with {type:'json'};
import {MusicQueue} from './queue.mjs';

if(ffmpegStatic)process.env.FFMPEG_PATH=ffmpegStatic;
function durationSec(path){
  if(!ffmpegStatic)return null;
  try{
    const result=spawnSync(ffmpegStatic,['-hide_banner','-i',path],{encoding:'utf8',timeout:3000,maxBuffer:262144});
    const match=/Duration:\\s*(\\d+):(\\d+):(\\d+(?:\\.\\d+)?)/.exec(result.stderr??'');
    return match?Math.round(Number(match[1])*3600+Number(match[2])*60+Number(match[3])):null;
  }catch{return null;}
}
const tracks=new Map(catalog.map(t=>{
  const path=fileURLToPath(new URL('../../music/assets/'+encodeURIComponent(t.file),import.meta.url));
  return [t.id,{...t,path,durationSec:durationSec(path)}];
}));
const pretty=s=>String(s??'').slice(0,150);
const VOICE_READY_MS=20_000;
const IDLE_DISCONNECT_MS=120_000;
const EMPTY_VOICE_MS=90_000;

export class MusicController {
 constructor(client){this.client=client;this.rooms=new Map();this.locks=new Map();}
 async locked(guild,handler){
  const previous=this.locks.get(guild)??Promise.resolve();
  const work=previous.catch(()=>{}).then(handler);
  this.locks.set(guild,work);try{return await work;}finally{if(this.locks.get(guild)===work)this.locks.delete(guild);}
 }
 session(guild){return this.rooms.get(guild)??null;}
 async request({guildId,userId,action,track,volume,loop}){
  if(!/^\d{15,22}$/.test(guildId)||!/^\d{15,22}$/.test(userId))throw Error('Discordユーザーを確認できない。');
  return this.locked(guildId,async()=>{
    const message=await this.execute({guildId,userId,action,track,volume,loop});
    return {message,view:this.snapshot(guildId)};
  });
 }
 async execute({guildId,userId,action,track,volume,loop}){
  const guild=this.client.guilds.cache.get(guildId);
  if(!guild||!this.client.isReady())throw Error('音楽Botはまだ起動中だ。');
  const room=this.session(guildId);
  if(action==='queue'||action==='status'){
   if(!room)return '🎵 再生中の音楽はない。/music play でVCに呼び出せる。';
   return this.description(room);
  }
  const state=guild.voiceStates.cache.get(userId);
  const channel=state?.channel;
  if(!channel||channel.type!==ChannelType.GuildVoice)
   throw Error('先に通常のボイスチャンネルに参加してほしい。');
  if(room && room.channelId!==channel.id)
   throw Error('別のVCで再生中だ。同じVCから操作してほしい。');
  if(action==='all'||action==='radio'){
   const album=[...tracks.values()];
   if(album.some(t=>!existsSync(t.path)))throw Error('音源ファイルが配置されていない。');
   const active=room??await this.connect(guild,channel);
   active.queue.loadPlaylist(album,userId,{radio:action==='radio'});
   this.cancelIdle(active);
   active.forceSkip=false;
   if(active.player.state.status!==AudioPlayerStatus.Idle){
     // Let the existing player emit its Idle event before starting the replacement.
     active.replacePending=true;
     active.player.stop(true);
   }else this.advance(active,{skip:true});
   return action==='radio'
     ?'📻 KESO RADIOを開始した。全曲を1回ずつ流し、順番を変えて繰り返す。'
     :'🎼 オリジナル全'+album.length+'曲を順番に再生する。';
  }
  if(action==='shuffle'){
   if(!room)throw Error('このVCで音楽は再生されていない。');
   const count=room.queue.shuffle();
   return count?'🔀 次の'+count+'曲を並び替えた。':'🔀 並び替えられる曲がまだない。';
  }
  if(action==='play'){
   const found=tracks.get(String(track));
   if(!found)throw Error('曲が見つからない。選択肢から選んでほしい。');
   if(!existsSync(found.path))throw Error('音源ファイルが配置されていない。');
   const active=room??await this.connect(guild,channel);
   const startsNow=!active.queue.current && active.player.state.status===AudioPlayerStatus.Idle;
   active.queue.add(found,userId);
   this.cancelIdle(active);
   if(startsNow)this.advance(active);
   return '🎵 '+pretty(found.title)+(startsNow?' を再生する。':' をキューに追加した。')
    +'\n'+this.description(active);
  }
  if(!room)throw Error('このVCで音楽は再生されていない。');
  if(action==='pause'){
   if(!room.player.pause(true))throw Error('再生中の曲がない。');
   room.queue.paused=true;return '⏸ 一時停止した。';
  }
  if(action==='resume'){
   if(!room.player.unpause())throw Error('一時停止中の曲がない。');
   room.queue.paused=false;return '▶️ 再開した。';
  }
  if(action==='skip'){
   if(!room.queue.current)throw Error('再生中の曲がない。');
   room.forceSkip=true;room.player.stop(true);return '⏭ 次の曲に進む。';
  }
  if(action==='stop'){
   room.queue.clear();room.forceSkip=true;room.player.stop(true);
   this.scheduleIdle(room);return '⏹ 再生とキューを停止した。2分後にVCを退出する。';
  }
  if(action==='leave'){
   room.queue.clear();room.player.stop(true);this.destroy(room);
   return '👋 VCから退出した。';
  }
  if(action==='volume'){
   room.queue.setVolume(Number(volume));
   room.player.state.resource?.volume?.setVolume(room.queue.volume/100);
   return '🔊 音量を'+room.queue.volume+'%に変更した。';
  }
  if(action==='loop'){
   room.queue.setLoop(String(loop));
   return '🔁 リピート設定：'+(room.queue.loop==='one'?'1曲':room.queue.loop==='all'?'キュー全体':'オフ');
  }
  throw Error('未対応の音楽コマンドだ。');
 }
 async connect(guild,channel){
  const player=createAudioPlayer({behaviors:{noSubscriber:NoSubscriberBehavior.Pause}});
  const connection=joinVoiceChannel({guildId:guild.id,channelId:channel.id,
    adapterCreator:guild.voiceAdapterCreator,selfDeaf:true,selfMute:false});
  try{await entersState(connection,VoiceConnectionStatus.Ready,VOICE_READY_MS);}
  catch{connection.destroy();throw Error('VCに接続できなかった。接続・発言権限を確認してほしい。');}
  const room={guildId:guild.id,channelId:channel.id,connection,player,queue:new MusicQueue(),
    forceSkip:false,replacePending:false,idleTimer:null,emptyTimer:null,autoPaused:false,closed:false};
  connection.subscribe(player);
  player.on(AudioPlayerStatus.Idle,()=>{if(!room.closed){
    if(room.replacePending){
      room.replacePending=false;room.forceSkip=false;this.advance(room,{skip:true});return;
    }
    const skip=room.forceSkip;room.forceSkip=false;this.advance(room,{skip});
  }});
  player.on('error',error=>{console.warn('music_playback_error',{code:error?.code??'audio'});
    if(!room.closed)this.advance(room,{skip:true});
  });
  connection.on(VoiceConnectionStatus.Destroyed,()=>this.destroy(room));
  this.rooms.set(guild.id,room);return room;
 }
 // GuildVoiceStates intent supplies voice membership without privileged member/message intents.
 onVoiceStateUpdate(state){
  const room=this.session(state.guild.id);
  if(!room||room.closed)return;
  const listeners=[...state.guild.voiceStates.cache.values()].filter(v=>
   v.channelId===room.channelId && v.id!==this.client.user?.id && !v.member?.user?.bot).length;
  if(listeners>0){
   if(room.emptyTimer){clearTimeout(room.emptyTimer);room.emptyTimer=null;}
   if(room.autoPaused&&!room.queue.paused){room.player.unpause();room.autoPaused=false;}
   return;
  }
  if(room.emptyTimer)return;
  if(room.player.pause(true)&&!room.queue.paused)room.autoPaused=true;
  room.emptyTimer=setTimeout(()=>{room.emptyTimer=null;this.destroy(room);},EMPTY_VOICE_MS);
  room.emptyTimer.unref?.();
 }
 advance(room,{skip=false}={}){
  if(room.closed)return;
  const item=room.queue.next({skip});
  if(!item){this.scheduleIdle(room);return;}
  this.cancelIdle(room);
  try{
   const resource=createAudioResource(item.track.path,{inlineVolume:true});
   resource.volume?.setVolume(room.queue.volume/100);
   room.player.play(resource);
  }catch{
   console.warn('music_resource_unavailable');
   this.advance(room,{skip:true});
  }
 }
 cancelIdle(room){if(room.idleTimer){clearTimeout(room.idleTimer);room.idleTimer=null;}}
 scheduleIdle(room){
  this.cancelIdle(room);
  room.idleTimer=setTimeout(()=>{if(!room.queue.current&&!room.queue.upcoming.length)this.destroy(room);},IDLE_DISCONNECT_MS);
  room.idleTimer.unref?.();
 }
 destroy(room){
  if(room.closed)return;
  room.closed=true;this.cancelIdle(room);
  if(room.emptyTimer){clearTimeout(room.emptyTimer);room.emptyTimer=null;}
  room.queue.clear();
  this.rooms.delete(room.guildId);
  try{room.player.stop(true);}catch{}
  try{room.connection.destroy();}catch{}
 }
 snapshot(guildId){
  const room=this.session(guildId);
  if(!room)return null;
  const view=room.queue.view();
  const elapsed=Number(room.player.state.resource?.playbackDuration??0);
  return {...view,elapsedSec:Math.max(0,Math.floor(elapsed/1000)),
    state:room.player.state.status};
 }
 description(room){
  const view=this.snapshot(room.guildId);
  const current=view.current?.title??'なし',waiting=view.queue.map((t,i)=>(i+1)+'. '+t.title).join(' / ');
  return '🎶 再生中：'+current+(view.paused?'（一時停止）':'')\n   +'\n'+(view.mode==='radio'?'📻 KESO RADIO':view.mode==='all'?'🎼 全曲再生':'🎵 通常再生')
   +'\n📜 次：'+(waiting||'なし')+'\n🔊 '+view.volume+'%｜🔁 '+view.loop;
 }
 health(){return {ready:this.client.isReady(),active:this.rooms.size};}
}
