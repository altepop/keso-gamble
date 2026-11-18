// Ephemeral, best-effort duel change *hints* over Server-Sent Events.
// The KP Worker authenticates subscribers before reaching this DO.
// No board state, private hands, wallet values or credentials are broadcast.
export const DUEL_STREAM_MAX_MS=150_000;
const ID=/^\d{15,22}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
type Stream={controller:ReadableStreamDefaultController<Uint8Array>;opened:number};
const encoder=new TextEncoder();
const bytes=(text:string)=>encoder.encode(text);

export function duelEventHint(value:unknown):{id:string;version:number}|null{
 if(!value||typeof value!=='object')return null;
 const r=value as Record<string,unknown>;
 if(typeof r.id!=='string'||!UUID.test(r.id)||typeof r.version!=='number'||!Number.isSafeInteger(r.version)||r.version<0)return null;
 return {id:r.id,version:Number(r.version)};
}
export class DuelEventHub{
 private listeners=new Map<string,Set<Stream>>();
 private heartbeat:ReturnType<typeof setInterval>|null=null;
 private count(){let n=0;for(const set of this.listeners.values())n+=set.size;return n;}
 private remove(user:string,stream:Stream){
  const set=this.listeners.get(user);if(!set)return;
  set.delete(stream);if(!set.size)this.listeners.delete(user);
  if(!this.listeners.size&&this.heartbeat!==null){clearInterval(this.heartbeat);this.heartbeat=null;}
 }
 private tick(){
  const now=Date.now();
  for(const [user,streams] of this.listeners)for(const stream of [...streams]){
   if(now-stream.opened>=DUEL_STREAM_MAX_MS){
    try{stream.controller.close();}catch{}
    this.remove(user,stream);
   }else{
    try{stream.controller.enqueue(bytes(': alive\n\n'));}catch{this.remove(user,stream);}
   }
  }
 }
 subscribe(user:unknown):Response{
  if(typeof user!=='string'||!ID.test(user))return new Response('Invalid participant',{status:400});
  if(this.count()>=24||(this.listeners.get(user)?.size??0)>=2)
   return new Response('Too many streams',{status:429,headers:{'Retry-After':'10'}});
  let streamRef:Stream|null=null;
  const body=new ReadableStream<Uint8Array>({
   start:controller=>{
    const item={controller,opened:Date.now()};streamRef=item;
    const set=this.listeners.get(user)??new Set<Stream>();set.add(item);this.listeners.set(user,set);
    controller.enqueue(bytes(': connected\n\n'));
    if(this.heartbeat===null)this.heartbeat=setInterval(()=>this.tick(),20000);
   },
   cancel:()=>{if(streamRef)this.remove(user,streamRef);}
  });
  return new Response(body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
 }
 publish(raw:unknown):number{
  if(!raw||typeof raw!=='object')return 0;
  const event=raw as Record<string,unknown>,hint=duelEventHint(event);
  if(!hint||typeof event.userA!=='string'||!ID.test(event.userA)||
     typeof event.userB!=='string'||!ID.test(event.userB)||event.userA===event.userB)return 0;
  let delivered=0;
  const frame=bytes('data: '+JSON.stringify(hint)+'\n\n');
  for(const user of [event.userA,event.userB])for(const stream of [...this.listeners.get(user)??[]]){
   try{stream.controller.enqueue(frame);delivered++;}catch{this.remove(user,stream);}
  }
  return delivered;
 }
 closeAll(){
  for(const [user,streams] of this.listeners)for(const stream of [...streams]){
   try{stream.controller.close();}catch{}
   this.remove(user,stream);
  }
 }
}
