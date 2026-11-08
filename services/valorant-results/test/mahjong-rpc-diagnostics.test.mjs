import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import protobuf from 'protobufjs';
import {openGateway} from '../scripts/mahjong-paipu.mjs';
import {auditFailure} from '../scripts/mahjong-review-live-audit.mjs';
import {recordRpcDiagnostic,safeRecordRpcDiagnostic} from '../scripts/mahjong-rpc-diagnostics.mjs';
// Protocol field numbers from the official liqi.json; values are synthetic.
const root=protobuf.parse(`syntax="proto3";package lq;
message Wrapper {string name=1;bytes data=2;}
message Empty {}
message Error {uint32 code=1;repeated uint32 u32_params=2;repeated string str_params=3;string json_param=4;}
message Response {Error error=1;}
message ReqGameRecord {string game_uuid=1;string client_version_string=2;}
service Route {rpc requestConnection(Empty) returns(Response);rpc heartbeat(Empty) returns(Response);}
service Lobby {rpc fetchGameRecord(ReqGameRecord) returns(Response);rpc oauth2Auth(Empty) returns(Response);}
`,{keepCase:true}).root;
const W=root.lookupType('lq.Wrapper'),R=root.lookupType('lq.Response'),Q=root.lookupType('lq.ReqGameRecord');
const uuid='261108-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',version='web-1.2.3';
function socket(backend){
 return class extends EventEmitter {
  constructor(){super();queueMicrotask(()=>this.emit('open'));}
  send(frame){
   assert.equal(frame[0],2);const request=W.decode(frame.subarray(3));const reply=backend(request);
   const bytes=W.encode({name:'',data:R.encode(reply).finish()}).finish();const header=Buffer.from([3,frame[1],frame[2]]);
   queueMicrotask(()=>this.emit('message',Buffer.concat([header,bytes])));
  }
  close(){this.emit('close');}terminate(){this.close();}
 };
}
test('actual gateway framing preserves replay fields and exposes only booleans/counts for RPC 540',async()=>{
 let requests=0;
 const WebSocket=socket(request=>{
  if(request.name!=='.lq.Lobby.fetchGameRecord')return {};
  requests++;const sent=Q.decode(request.data);assert.equal(sent.game_uuid,uuid);assert.equal(sent.client_version_string,version);
  return {error:{code:540,u32_params:[111111,222222],str_params:['private-server-value'],json_param:'{"token":"private-token"}'}};
 });
 const gateway=await openGateway({root,WebSocket},{id:'synthetic-route',domain:'unused.invalid'});
 try{
  await assert.rejects(gateway.call('fetchGameRecord',{game_uuid:uuid,client_version_string:version}),error=>{
   assert.equal(error.message,'fetchGameRecord_540');assert.equal(Object.keys(error).includes('rpcDiagnostic'),false);
   const report=auditFailure(error,'record');assert.deepEqual(report.rpc,{requestDecoded:true,gameUuidPreserved:true,clientVersionPreserved:true,jsonParamPresent:true,numberParamCount:2,stringParamCount:1});
   assert.doesNotMatch(JSON.stringify(report),/aaaaaaaa|web-1\.2\.3|111111|222222|private-server|private-token/);return true;
  });assert.equal(requests,1);
 }finally{gateway.close();}
});
test('unknown protobuf field names and invalid wire data are distinguishable without retaining payloads',()=>{
 const changed=new protobuf.Type('Changed').add(new protobuf.Field('gameUuid',1,'string')).add(new protobuf.Field('clientVersionString',2,'string'));
 const payload={game_uuid:uuid,client_version_string:version};const bytes=changed.encode(changed.create(payload)).finish();
 const report=recordRpcDiagnostic(changed,bytes,payload,{});assert.equal(report.requestDecoded,true);assert.equal(report.gameUuidPreserved,false);assert.equal(report.clientVersionPreserved,false);
 const invalid=recordRpcDiagnostic(Q,Buffer.from([255]),payload,{});assert.equal(invalid.requestDecoded,false);assert.equal(invalid.gameUuidPreserved,false);
});
test('diagnostics cap parameter counts and copy only approved scalar fields',()=>{
 const payload={game_uuid:uuid,client_version_string:version};const raw=recordRpcDiagnostic(Q,Q.encode(payload).finish(),payload,{u32_params:Array(30).fill(123456),str_params:Array(30).fill('private-token')});
 assert.equal(raw.numberParamCount,16);assert.equal(raw.stringParamCount,16);
 const safe=safeRecordRpcDiagnostic({...raw,token:'private-token',requestBytes:'private-wire'});assert.deepEqual(safe,raw);assert.doesNotMatch(JSON.stringify(safe),/private/);
 for(const bad of [null,{}, {...raw,gameUuidPreserved:uuid},{...raw,numberParamCount:17},{...raw,stringParamCount:-1}])assert.equal(safeRecordRpcDiagnostic(bad),null);
});
test('other RPC errors preserve their existing behavior without replay diagnostics',async()=>{
 const WebSocket=socket(request=>request.name==='.lq.Lobby.oauth2Auth'?{error:{code:123}}:{});
 const gateway=await openGateway({root,WebSocket},{id:'synthetic-route',domain:'unused.invalid'});
 try{await assert.rejects(gateway.call('oauth2Auth',{}),error=>{assert.equal(error.message,'oauth2Auth_123');assert.equal(error.rpcDiagnostic,undefined);return true;});}finally{gateway.close();}
});
