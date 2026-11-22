// Ephemeral, best-effort duel change *hints* over Server-Sent Events.
// The KP Worker authenticates subscribers before reaching this DO.
// No board state, private hands, wallet values or credentials are broadcast.
export const DUEL_STREAM_MAX_MS=150_000;
// Per guild UTC-day safety budget: cap non-hibernating SSE at 2 hours.
// On exhaustion return to the existing authenticated 10s D1 polling.
export const DUEL_STREAM_DAILY_BUDGET_MS=2*60*60_000;
const ID=/^\d{15,22}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
type Stream={controller:ReadableStreamDefaultController<Uint8Array>;opened:number;observer:boolean;user:string};
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
 private budgetDay=-1;private budgetUsed=0;private activeSince:number|null=null;
 private budgetLoaded:Promise<void>|null=null;
 private storage?:Pick<DurableObjectStorage,'get'|'put'>;
 constructor(storage?:Pick<DurableObjectStorage,'get'|'put'>){this.storage=storage;}
 private async loadBudget(){
  if(!this.budgetLoaded)this.budgetLoaded=(async()=>{
   if(!this.storage){this.budgetDay=Math.floor(Date.now()/86400_000);return;}
   const row=await this.storage.get<{day:number;used:number}>('duel-sse-budget-v1');
   const today=Math.floor(Date.now()/86400_000);
   this.budgetDay=today;
   this.budgetUsed=row?.day===today&&Number.isFinite(row.used)&&row.used>=0?row.used:0;
  })();
  await this.budgetLoaded;
 }
 private async charge(now=Date.now()){
  if(this.activeSince===null)return;
  // Slightly overcharging a midnight-spanning stream is safer than overrunning
  // the budget. Only explicit new subscriptions reset the UTC-day counter.
  this.budgetUsed+=Math.max(0,now-this.activeSince);this.activeSince=now;
  try{await this.storage?.put('duel-sse-budget-v1',{day:this.budgetDay,used:this.budgetUsed});}
  catch{this.budgetUsed=DUEL_STREAM_DAILY_BUDGET_MS;this.closeAll();return;}
  if(this.budgetUsed>=DUEL_STREAM_DAILY_BUDGET_MS)this.closeAll();
 }
 private count(){let n=0;for(const set of this.listeners.values())n+=set.size;return n;}
 private remove(user:string,stream:Stream){
  const set=this.listeners.get(user);if(!set)return;
  set.delete(stream);if(!set.size)this.listeners.delete(user);
  if(!this.listeners.size&&this.heartbeat!==null){
   clearInterval(this.heartbeat);this.heartbeat=null;
   void this.charge().catch(()=>this.closeAll());
   this.activeSince=null;
  }
 }
 private tick(){
  const now=Date.now();
  void this.charge(now).catch(()=>this.closeAll());
  for(const [user,streams] of this.listeners)for(const stream of [...streams]){
   if(now-stream.opened>=DUEL_STREAM_MAX_MS){
    try{stream.controller.close();}catch{}
    this.remove(user,stream);
   }else{
    try{stream.controller.enqueue(bytes(': alive\n\n'));}catch{this.remove(user,stream);}
   }
  }
 }
 async subscribe(user:unknown,observer=false):Promise<Response>{
  if(typeof user!=='string'||!ID.test(user))return new Response('Invalid participant',{status:400});
  try{await this.loadBudget();}catch{return new Response('Budget unavailable',{status:503,headers:{'Retry-After':'60'}});}
  const day=Math.floor(Date.now()/86400_000);
  if(this.budgetDay!==day){this.budgetDay=day;this.budgetUsed=0;}
  if(this.budgetUsed>=DUEL_STREAM_DAILY_BUDGET_MS)
   return new Response('Real-time budget reached; polling remains available',{status:429,headers:{'Retry-After':'3600'}});
  if(this.count()>=24||(this.listeners.get(user)?.size??0)>=2)
   return new Response('Too many streams',{status:429,headers:{'Retry-After':'10'}});
  let streamRef:Stream|null=null;
  const body=new ReadableStream<Uint8Array>({
   start:controller=>{
    const item:Stream={controller,opened:Date.now(),observer:observer===true,user};streamRef=item;
    if(this.activeSince===null)this.activeSince=item.opened;
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
  // Primary-account observers are explicitly authorized by the Worker, NOT
  // by the DO or by names/IDs in the incoming event. No secret payloads.
  const audiences=new Set<Stream>();
  for(const user of [event.userA,event.userB])
   for(const stream of this.listeners.get(user)??[])audiences.add(stream);
  for(const streams of this.listeners.values())for(const stream of streams)
   if(stream.observer)audiences.add(stream);
  for(const stream of audiences){
   try{stream.controller.enqueue(frame);delivered++;}
   catch{this.remove(stream.user,stream);}
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
