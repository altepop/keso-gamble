// The paipu job's use of protobufjs (installed version): a schema from JSON, Wrapper framing and the record body,
// for both the newer `actions` layout and the older `records` one. Offline: a small schema shaped like liqi.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import protobuf from 'protobufjs';
import {decodeRecords} from '../scripts/mahjong-paipu.mjs';

const liqi={nested:{lq:{nested:{
 Wrapper:{fields:{name:{type:'string',id:1},data:{type:'bytes',id:2}}},
 GameAction:{fields:{passed:{type:'uint32',id:1},type:{type:'uint32',id:2},result:{type:'bytes',id:3}}},
 GameDetailRecords:{fields:{records:{rule:'repeated',type:'bytes',id:1},version:{type:'uint32',id:2},actions:{rule:'repeated',type:'GameAction',id:3}}},
 RecordNewRound:{fields:{chang:{type:'uint32',id:1},ju:{type:'uint32',id:2},scores:{rule:'repeated',type:'int32',id:5}}},
 RecordHule:{fields:{hules:{rule:'repeated',type:'HuleInfo',id:1}}},
 HuleInfo:{fields:{seat:{type:'uint32',id:3},zimo:{type:'bool',id:4},point_sum:{type:'uint32',id:11}}},
}}}};
const root=protobuf.Root.fromJSON(liqi as never),W=root.lookupType('lq.Wrapper');
const wrap=(name:string,payload:object)=>{const T=root.lookupType('lq.'+name);return W.encode(W.create({name:'.lq.'+name,data:T.encode(T.create(payload)).finish()})).finish();};
const body=(details:object)=>{const D=root.lookupType('lq.GameDetailRecords');return W.encode(W.create({name:'.lq.GameDetailRecords',data:D.encode(D.create(details)).finish()})).finish();};
const round=wrap('RecordNewRound',{chang:0,ju:1,scores:[25000,25000,25000,25000]}),hule=wrap('RecordHule',{hules:[{seat:2,zimo:true,point_sum:8000}]});

test('paipu records decode in play order from the actions layout',()=>{
 const records=decodeRecords(root,body({version:210715,actions:[{type:1,result:round},{type:2},{type:1,result:hule}]}));
 assert.deepEqual(records.map((r:{name:string})=>r.name),['RecordNewRound','RecordHule']);
 assert.deepEqual(records[0].data.scores,[25000,25000,25000,25000]);
 assert.equal(records[1].data.hules[0].point_sum,8000);assert.equal(records[1].data.hules[0].zimo,true);
});
test('paipu records decode from the older records layout',()=>{
 const records=decodeRecords(root,body({records:[round,hule]}));
 assert.deepEqual(records.map((r:{name:string})=>r.name),['RecordNewRound','RecordHule']);
 assert.equal(records[0].data.ju,1);
});
