// The market uses exactly three optional news sources. Once all exist in this
// D1 binding, their table names are stable for this isolate. A missing optional
// table is rechecked on later ticks, so newly enabled quiz feeds still appear naturally.
// Each source is probed with `LIMIT 0`, which reads no rows and fails only when the table
// is missing. Reading sqlite_master instead cost ~290 rows per tick (D1 Insights, 2026-11-03),
// because the quiz tables never existed and the lookup was repeated every tick.
const sources=['kp_events','kp_quiz_events','kp_quiz_ranked_extra'] as const;
const ready=new WeakMap<object,Promise<Set<string>>>();
const missingTable=(error:unknown)=>/no such table/i.test(String((error as {message?:unknown})?.message??error));
export async function availableStockNewsTables(db:D1Database):Promise<Set<string>>{
 const current=ready.get(db);
 if(current)return current;
 const job=(async()=>{
  const found=new Set<string>();
  for(const name of sources){
   try{await db.prepare(`SELECT 1 FROM ${name} LIMIT 0`).all();found.add(name);}
   catch(error){if(!missingTable(error))throw error;}
  }
  return found;
 })();
 ready.set(db,job);
 try{
  const tables=await job;
  // A missing source may be created by a quiz reward later in this same isolate.
  if(sources.some(name=>!tables.has(name)))ready.delete(db);
  return tables;
 }catch(error){ready.delete(db);throw error;}
}
