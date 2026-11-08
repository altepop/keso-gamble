// Temporary public-data-only diagnosis. No login, D1, tokens, IDs or Discord.
import {createRequire} from 'node:module';
const protobuf=createRequire(new URL('../services/valorant-results/package.json',import.meta.url))('protobufjs');
const BASE='https://game.mahjongsoul.com';
const read=async path=>{const r=await fetch(BASE+'/'+path,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('public_http_'+r.status);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>32*1024*1024)throw Error('public_size');return bytes;};
try{
 const info=JSON.parse((await read('version.json')).toString()),manifest=JSON.parse((await read('resversion'+info.version+'.json')).toString());
 const html=(await read('index.html')).toString();console.log('Official public client version: '+JSON.stringify({version:info.version,code:info.code,products:[...html.matchAll(/productVersion[\"']?\s*:\s*[\"']([^\"']+)[\"']/g)].map(m=>m[1]).filter(v=>/^[0-9.]+$/.test(v)),scripts:[...html.matchAll(/<script[^>]+src=[\"']([^\"']+)[\"']/g)].map(m=>m[1]).slice(0,12)}));
 const prefix=manifest.res?.['res/config/lqc.lqbin']?.prefix;if(typeof prefix!=='string'||!/^[-a-zA-Z0-9_/.]+$/.test(prefix))throw Error('public_manifest');
 const root=protobuf.parse(`syntax="proto3";message Field {string field_name=1;uint32 array_length=2;string pb_type=3;uint32 pb_index=4;}message SheetMeta {string category=1;string key=2;}message SheetSchema {string name=1;SheetMeta meta=2;repeated Field fields=3;}message TableSchema {string name=1;repeated SheetSchema sheets=2;}message SheetData {string table=1;string sheet=2;repeated bytes data=3;}message ConfigTables {string version=1;string header_hash=2;repeated TableSchema schemas=3;repeated SheetData datas=4;}`,{keepCase:true}).root;
 const T=root.lookupType('ConfigTables'),config=T.toObject(T.decode(await read(prefix+'/res/config/lqc.lqbin')),{defaults:true,bytes:Buffer});
 let sheets=0,matches=0;
 for(const table of config.schemas)for(const sheet of table.sheets){
  if(!/error/i.test(table.name+'_'+sheet.name))continue;sheets++;
  const rowType=new protobuf.Type('PublicErrorRow');
  for(const f of sheet.fields){if(!['uint32','int32','string','bool','float','double','int64','uint64','sint32','sint64','bytes'].includes(f.pb_type))throw Error('public_schema_type');rowType.add(new protobuf.Field(f.field_name,f.pb_index,f.pb_type,f.array_length?'repeated':undefined));}
  const data=config.datas.find(d=>d.table===table.name&&d.sheet===sheet.name);
  console.log('Public error schema: '+JSON.stringify({table:table.name,sheet:sheet.name,fields:sheet.fields.map(f=>({name:f.field_name,index:f.pb_index,type:f.pb_type,array:f.array_length}))}));
  for(const bytes of data?.data??[]){const row=rowType.toObject(rowType.decode(bytes),{longs:Number,defaults:true});if([151,540].includes(row.id??row.code)||((row.id??row.code)>=500&&(row.id??row.code)<=550)||/牌譜/.test(row.jp??'')){matches++;console.log('Official public error entry: '+JSON.stringify(row).slice(0,3000));}}
 }
 console.log('Public error lookup: '+JSON.stringify({sheets,matches}));
}catch(error){console.error('Public error lookup failed: '+(/^public_[a-z0-9_]+$/.test(error.message)?error.message:'public_decode'));process.exitCode=1;}
