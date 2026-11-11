// Pure queue state, independent of Discord and network transports.
export const LIMIT = 30;
export const PER_USER_LIMIT = 8;
export class MusicQueue {
  constructor({volume=20}={}) {
    this.upcoming=[];
    this.current=null;
    this.volume=volume;
    this.loop='off';
    this.paused=false;
  }
  add(track,requester){
    if(!/^\d{15,22}$/.test(requester))throw Error('ユーザーIDが不正だ。');
    if(!track||typeof track.id!=='string')throw Error('曲を選んでほしい。');
    if(this.upcoming.length>=LIMIT)throw Error('再生待ちは最大30曲だ。');
    const count=this.upcoming.filter(x=>x.requester===requester).length;
    if(count>=PER_USER_LIMIT)throw Error('1人が予約できるのは最大8曲だ。');
    this.upcoming.push({track,requester});
    return this.upcoming.length;
  }
  next({skip=false}={}){
    if(!skip && this.loop==='one' && this.current)return this.current;
    const previous=this.current;
    this.current=this.upcoming.shift()??null;
    if(previous && this.loop==='all' && !skip && this.current)
      this.upcoming.push(previous);
    this.paused=false;
    return this.current;
  }
  setLoop(mode){
    if(!['off','one','all'].includes(mode))throw Error('リピート設定が不正だ。');
    this.loop=mode;
  }
  setVolume(n){
    if(!Number.isInteger(n)||n<1||n>100)throw Error('音量は1〜100に指定してほしい。');
    this.volume=n;
  }
  clear(){this.upcoming=[];this.current=null;this.loop='off';this.paused=false;}
  view(){
    return {current:this.current?{id:this.current.track.id,title:this.current.track.title}:null,
      queue:this.upcoming.map(({track})=>({id:track.id,title:track.title})),
      volume:this.volume,paused:this.paused,loop:this.loop};
  }
}
