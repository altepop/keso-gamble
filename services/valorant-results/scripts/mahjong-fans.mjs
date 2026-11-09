// Regenerates mahjong-fans.json (yaku id -> Japanese name) from the game's own config table
// (res/config/lqc.lqbin, sheet fan/fan). Run when Mahjong Soul adds a yaku: node scripts/mahjong-fans.mjs
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const BASE='https://game.mahjongsoul.com/';
function fields(bytes){
 const out=[];let i=0;
 const varint=()=>{let r=0n,s=0n;for(;;){const b=bytes[i++];r|=BigInt(b&0x7f)<<s;s+=7n;if(b<0x80)return r;}};
 while(i<bytes.length){
  const key=Number(varint()),field=key>>3,wire=key&7;
  if(wire===0)out.push([field,Number(varint())]);
  else if(wire===2){const n=Number(varint());out.push([field,bytes.subarray(i,i+n)]);i+=n;}
  else if(wire===5){i+=4;}else if(wire===1){i+=8;}else throw Error('unsupported wire type '+wire);
 }
 return out;
}
const text=value=>new TextDecoder().decode(value);
/** Reads the fan/fan sheet, locating the id and name_jp columns from the table's own schema. */
export function fanTable(lqbin){
 const schema=fields(lqbin).filter(([f])=>f===3).map(([,v])=>fields(v)).find(s=>s.some(([f,v])=>f===1&&text(v)==='fan'));
 const sheet=schema?.filter(([f])=>f===2).map(([,v])=>fields(v)).find(s=>text(s[0][1])==='fan');
 if(!sheet)throw Error('fan sheet schema missing');
 const index=Object.fromEntries(sheet.slice(1).map(([,v])=>{const m=Object.fromEntries(fields(v).map(([f,x])=>[f,typeof x==='number'?x:text(x)]));return [m[1],m[4]];}));
 if(index.id===undefined||index.name_jp===undefined)throw Error('fan sheet fields changed');
 const data=fields(lqbin).filter(([f])=>f===4).map(([,v])=>fields(v)).find(s=>s.some(([f,v])=>f===1&&text(v)==='fan')&&s.some(([f,v])=>f===2&&text(v)==='fan'));
 if(!data)throw Error('fan sheet data missing');
 const table={};
 for(const [f,row] of data){if(f!==3)continue;const m=Object.fromEntries(fields(row).map(([k,x])=>[k,x]));table[m[index.id]]=text(m[index.name_jp]??new Uint8Array());}
 return table;
}
export async function downloadFanTable(request=fetch){
 const version=(await (await request(BASE+'version.json?randv='+Date.now())).json()).version;
 const manifest=await (await request(BASE+`resversion${version}.json`)).json();
 const prefix=manifest.res['res/config/lqc.lqbin'].prefix;
 return fanTable(new Uint8Array(await (await request(BASE+prefix+'/res/config/lqc.lqbin')).arrayBuffer()));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const table=await downloadFanTable();
 writeFileSync(new URL('../mahjong-fans.json',import.meta.url),'{\n'+Object.entries(table).map(([id,name])=>` ${JSON.stringify(id)}: ${JSON.stringify(name)}`).join(',\n')+'\n}\n');
 console.log('fans:',Object.keys(table).length);
}
