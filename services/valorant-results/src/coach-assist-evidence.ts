// An absent/malformed assistant list is unknown, never an empty list.
export function verifiedAssistants(kill:unknown,players:ReadonlyMap<string,string>):string[]|null{
 if(!kill||typeof kill!=='object')return null;
 const k=kill as {assistants?:unknown;killer?:{puuid?:unknown}|null;victim?:{puuid?:unknown}};
 if(!Array.isArray(k.assistants)||k.assistants.length>9)return null;
 const ids:string[]=[];
 for(const a of k.assistants){
  const id=a&&typeof a==='object'?(a as {puuid?:unknown}).puuid:null;
  if(typeof id!=='string'||!players.has(id)||id===k.killer?.puuid||id===k.victim?.puuid||typeof k.killer?.puuid!=='string'||players.get(id)!==players.get(k.killer.puuid)||ids.includes(id))return null;
  ids.push(id);
 }
 return ids;
}
