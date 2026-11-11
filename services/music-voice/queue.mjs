// Pure in-memory music state. No D1, remote writes, or Discord dependencies.
export const LIMIT=30;
export const PER_USER_LIMIT=8;
const validUser=id=>/^\d{15,22}$/.test(id??'');

export class MusicQueue {
  constructor({volume=20,random=Math.random}={}) {
    this.upcoming=[];
    this.current=null;
    this.volume=volume;
    this.loop='off';
    this.paused=false;
    this.mode='manual'; // manual | all | radio
    this.radioCatalog=[];
    this.radioRequester='';
    this.cycle=0;
    this.random=random;
  }
  add(track,requester){
    if(!validUser(requester))throw Error('ユーザーIDが不正だ。');
    if(!track||typeof track.id!=='string')throw Error('曲を選んでほしい。');
    if(this.upcoming.length>=LIMIT)throw Error('再生待ちは最大30曲だ。');
    const count=this.upcoming.filter(x=>x.requester===requester).length;
    if(count>=PER_USER_LIMIT)throw Error('1人が予約できるのは最大8曲だ。');
    this.upcoming.push({track,requester});
    return this.upcoming.length;
  }
  // Fisher-Yates. Keep the current song untouched; the shuffle only affects waiting tracks.
  shuffled(items){
    const result=[...items];
    for(let i=result.length-1;i>0;i--){
      const j=Math.floor(Math.max(0,Math.min(0.9999999999,this.random()))*(i+1));
      [result[i],result[j]]=[result[j],result[i]];
    }
    return result;
  }
  shuffle(){
    if(this.upcoming.length<2)return 0;
    this.upcoming=this.shuffled(this.upcoming);
    return this.upcoming.length;
  }
  // One radio cycle contains every song once. At cycle boundaries, prevent
  // repeating the final song immediately as the first song of the next cycle.
  refillRadio(previousId=''){
    if(this.mode!=='radio'||!this.radioCatalog.length)return;
    const cycle=this.shuffled(this.radioCatalog);
    if(cycle.length>1 && cycle[0].id===previousId){
      const other=cycle.findIndex(t=>t.id!==previousId);
      [cycle[0],cycle[other]]=[cycle[other],cycle[0]];
    }
    this.upcoming.push(...cycle.map(track=>({track,requester:this.radioRequester})));
    this.cycle++;
  }
  loadPlaylist(catalog,requester,{radio=false}={}){
    if(!validUser(requester))throw Error('ユーザーIDが不正だ。');
    if(!Array.isArray(catalog)||catalog.length===0||catalog.length>LIMIT
      ||catalog.some(t=>!t||typeof t.id!=='string'||!t.id))
      throw Error('再生リストを確認できない。');
    if(radio && catalog.length<2)throw Error('ラジオには2曲以上必要だ。');
    const ids=new Set(catalog.map(t=>t.id));
    if(ids.size!==catalog.length)throw Error('同じ曲が重複している。');
    // Replacing a station is atomic: invalid playlists leave the previous queue intact.
    this.clear();
    this.mode=radio?'radio':'all';
    this.radioRequester=radio?requester:'';
    this.radioCatalog=radio?[...catalog]:[];
    if(radio)this.refillRadio();
    else this.upcoming=catalog.map(track=>({track,requester}));
    return this.upcoming.length;
  }
  next({skip=false}={}){
    if(!skip && this.loop==='one' && this.current)return this.current;
    const previous=this.current;
    if(previous && this.loop==='all' && !skip && this.mode!=='radio')this.upcoming.push(previous);
    if(this.mode==='radio'&&!this.upcoming.length)this.refillRadio(previous?.track.id??'');
    this.current=this.upcoming.shift()??null;
    this.paused=false;
    return this.current;
  }
  setLoop(mode){
    if(!['off','one','all'].includes(mode))throw Error('リピート設定が不正だ。');
    if(this.mode==='radio'&&mode!=='off')throw Error('ラジオは全曲を自動で循環する。リピート変更はラジオ終了後に行ってほしい。');
    this.loop=mode;
  }
  setVolume(n){
    if(!Number.isInteger(n)||n<1||n>100)throw Error('音量は1〜100に指定してほしい。');
    this.volume=n;
  }
  clear(){
    this.upcoming=[];this.current=null;this.loop='off';this.paused=false;
    this.mode='manual';this.radioCatalog=[];this.radioRequester='';this.cycle=0;
  }
  view(){
    const entry=x=>x?{id:x.track.id,title:x.track.title,
      durationSec:x.track.durationSec??null}:null;
    return {current:entry(this.current),queue:this.upcoming.map(entry),
      volume:this.volume,paused:this.paused,loop:this.loop,mode:this.mode,
      cycle:this.cycle,totalTracks:this.mode==='radio'?this.radioCatalog.length:
        this.mode==='all'?this.upcoming.length+(this.current?1:0):null};
  }
}
