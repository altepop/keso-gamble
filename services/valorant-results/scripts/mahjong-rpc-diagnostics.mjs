// Fixed, value-free evidence for replay RPC failures. Never retain request bytes,
// IDs, client-version values or server parameter values in the error diagnostic.
const count=xs=>Array.isArray(xs)?Math.min(xs.length,16):0;
export function recordRpcDiagnostic(requestType,bytes,payload,remote){
 let decoded,requestDecoded=false;
 try{decoded=requestType.decode(bytes);requestDecoded=true;}catch{}
 return {
  requestDecoded,
  gameUuidPreserved:typeof payload?.game_uuid==='string'&&payload.game_uuid.length>0&&decoded?.game_uuid===payload.game_uuid,
  clientVersionPreserved:typeof payload?.client_version_string==='string'&&payload.client_version_string.length>0&&decoded?.client_version_string===payload.client_version_string,
  numberParamCount:count(remote?.u32_params),stringParamCount:count(remote?.str_params),
  jsonParamPresent:typeof remote?.json_param==='string'&&remote.json_param.length>0,
 };
}
export function safeRecordRpcDiagnostic(raw){
 if(!raw||typeof raw!=='object')return null;
 const booleans=['requestDecoded','gameUuidPreserved','clientVersionPreserved','jsonParamPresent'];
 const counts=['numberParamCount','stringParamCount'];
 if(booleans.some(k=>typeof raw[k]!=='boolean')||counts.some(k=>!Number.isInteger(raw[k])||raw[k]<0||raw[k]>16))return null;
 return Object.fromEntries([...booleans,...counts].map(k=>[k,raw[k]]));
}
