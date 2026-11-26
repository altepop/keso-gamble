// Server-only slot probability variants. No client-supplied playback flags or D1 reads.
import catalog from '../../music-voice/catalog.json' with {type:'json'};
type Rand=(n:number)=>number;
type MusicEnv={MUSIC_VOICE_URL?:string;MUSIC_BRIDGE_TOKEN?:string};
const tracks=new Set(catalog.map(t=>t.id));
const LOSS_WEIGHT=7140; // 21^3 - (441 triple + 1620 cherry pair + 60 diamond pair)
export const SLOT_BOOST_MAX_STAKE=1000;
export function slotLegendPlan(track:string|null,now:number,stake:unknown){
 if(typeof stake!=='number'||!Number.isSafeInteger(stake)||stake<100||stake>SLOT_BOOST_MAX_STAKE)return {seven:0,temple:0,cherry:0};
 const jst=new Date(now+9*3600000),seven=[7,17,27].includes(jst.getUTCDate())?8:0;
 const active=track!==null&&tracks.has(track);
 const temple=active&&track==='relic'?60:0;
 const total=active?(track==='kyohansha'&&jst.getUTCHours()===2?1061:848):0;
 return {seven,temple,cherry:Math.max(0,total-seven-temple)};
}
type Plan=ReturnType<typeof slotLegendPlan>;
const symbol=(n:number)=>n<6?0:n<11?1:n<15?2:n<18?3:n<20?4:5;
export function slotLegendRng(rand:Rand,plan:Plan):Rand{
 if(!plan.seven&&!plan.temple&&!plan.cherry)return rand;
 let reels:number[]|undefined,index=0;
 return n=>{
  if(index>=3)return rand(n);
  if(n!==21)throw Error('slot legend reel contract changed');
  if(!reels){
   reels=[rand(21),rand(21),rand(21)];
   const s=reels.map(symbol),triple=s.every(x=>x===s[0]),cherries=s.filter(x=>x===0).length,diamonds=s.filter(x=>x===5).length;
   if(!triple&&cherries!==2&&diamonds!==2){
    const rescue=rand(LOSS_WEIGHT);
    if(rescue<plan.seven)reels=[18,18,18];
    else if(rescue<plan.seven+plan.temple)reels=[20,20,6];
    else if(rescue<plan.seven+plan.temple+plan.cherry)reels=[0,0,6];
    // Randomize the position of the nonmatching symbol; existing winners and jackpot are untouched.
    if((reels[0]===20&&reels[1]===20&&reels[2]===6)||(reels[0]===0&&reels[1]===0&&reels[2]===6)){
     const pos=rand(3);[reels[pos],reels[2]]=[reels[2],reels[pos]];
    }
   }
  }
  return reels[index++]!;
 };
}
// Cache only completed observations (no cross-request promise or durable state).
let cached:{url:string;token:string;guild:string;track:string|null;until:number}|undefined;
export async function slotMusicTrack(env:MusicEnv,guild:string,request:typeof fetch=fetch,clock=Date.now):Promise<string|null>{
 const url=env.MUSIC_VOICE_URL,token=env.MUSIC_BRIDGE_TOKEN;
 if(!url||!token||token.length<32||!/^\d{15,22}$/.test(guild))return null;
 let base:URL;
 try{base=new URL(url);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!(base.hostname.endsWith('.onrender.com')||base.hostname.endsWith('.render.com')))return null;}catch{return null;}
 if(cached&&cached.url===url&&cached.token===token&&cached.guild===guild&&cached.until>clock())return cached.track;
 let track:string|null=null;
 try{
  const endpoint=new URL('/health',base);endpoint.searchParams.set('slotGuild',guild);
  const response=await request(endpoint,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(700)});
  if(response.ok){const value=await response.json() as {status?:unknown;slotTrack?:unknown};
   if(value.status==='ready'&&typeof value.slotTrack==='string'&&tracks.has(value.slotTrack))track=value.slotTrack;
  }
 }catch{/* No verified playback: ordinary odds, without blocking a spin. */}
 cached={url,token,guild,track,until:clock()+3000};return track;
}
