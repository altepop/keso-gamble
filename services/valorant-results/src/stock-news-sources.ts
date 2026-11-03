// The market uses exactly three optional news sources. Once all exist in this
// D1 binding, their table names are stable for this isolate; avoid repeatedly
// scanning sqlite_master on every five-minute tick. A missing optional table is
// rechecked on later ticks, so newly enabled quiz feeds still appear naturally.
const sources=['kp_events','kp_quiz_events','kp_quiz_ranked_extra'] as const;
const ready=new WeakMap<object,Promise<Set<string>>>();
export async function availableStockNewsTables(db:D1Database):Promise<Set<string>>{
 const current=ready.get(db);
 if(current)return current;
 const job=(async()=>{
  const rows=(await db.prepare(
   "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('kp_events','kp_quiz_events','kp_quiz_ranked_extra')"
  ).all<{name:string}>()).results;
  return new Set(rows.map(row=>row.name));
 })();
 ready.set(db,job);
 try{
  const tables=await job;
  // A missing source may be created by a quiz reward later in this same isolate.
  if(sources.some(name=>!tables.has(name)))ready.delete(db);
  return tables;
 }catch(error){ready.delete(db);throw error;}
}
