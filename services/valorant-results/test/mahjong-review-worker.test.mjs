import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPaipuReviewer} from '../scripts/mahjong-review.mjs';
const three={players:3,game:'3-hanchan',uuid:'synthetic-worker',rounds:[{label:'東1局'}]};
test('default-off sanma and ineligible four-player records never initialize or download a model',async()=>{
 let starts=0;const reviewer=createPaipuReviewer({root:'/unused',fourEnabled:true,workerFactory(){starts++;throw Error('not expected');}});
 assert.equal(await reviewer.review(three,[]),null);
 assert.equal(await reviewer.review({...three,players:4,game:'4-hanchan'},[]),null);
 assert.equal(starts,0);await reviewer.close();
});
test('optional inference has a real deadline and cannot block the next paipu after a stall',async()=>{
 let stopped=0,starts=0;const reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:15,budgetMs:30,workerFactory(){starts++;const w=new EventEmitter();w.postMessage=()=>{};w.terminate=async()=>{stopped++;};return w;}});
 assert.equal(await reviewer.review(three,[]),null);assert.equal(stopped,1);
 assert.equal(await reviewer.review(three,[]),null);assert.equal(starts,1);await reviewer.close();
});
test('worker errors and exits fail closed without exposing their text or starting more workers',async()=>{
 for(const failure of ['error','exit']){
  const reviewer=createPaipuReviewer({sanmaEnabled:true,workerFactory(){const w=new EventEmitter();w.postMessage=()=>queueMicrotask(()=>w.emit(failure,Error('secret-private-body')));w.terminate=async()=>{};return w;}});
  assert.equal(await reviewer.review(three,[]),null);assert.equal(await reviewer.review(three,[]),null);await reviewer.close();
 }
});
test('sanma review runs in an actual isolated worker without C3 model assets, D1 or Discord',async()=>{
 const reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:5000});
 const hand=['1m','9m','1p','2p','3p','4p','6p','8p','2s','3s','4s','1z','5z','7z'];
 const pool=[];for(const s of ['m','p','s'])for(let i=1;i<=9;i++)if(s!=='m'||i===1||i===9)for(let j=0;j<4;j++)pool.push(i+s);
 for(let i=1;i<=7;i++)for(let j=0;j<4;j++)pool.push(i+'z');
 hand.forEach(t=>pool.splice(pool.indexOf(t),1));const own1=pool.splice(0,13),own2=pool.splice(0,13),indicator=pool.pop();
 const actions=[{name:'RecordNewRound',data:{chang:0,ju:0,ben:0,liqibang:0,scores:[35000,35000,35000],doras:[indicator],tiles0:hand,tiles1:own1,tiles2:own2}}, {name:'RecordDiscardTile',data:{seat:0,tile:'7z',moqie:false}}];
 for(const seat of [1,2,0]){const tile=pool.pop();actions.push({name:'RecordDealTile',data:{seat,tile}},{name:'RecordDiscardTile',data:{seat,tile:seat===0?'2p':tile,moqie:seat!==0}});}
 try{const report=await reviewer.review(three,actions);assert.ok(report);assert.equal(report.source,'sanma-rules');assert.equal(report.uuid,three.uuid);assert.ok(report.findings.length<=4);for(const f of report.findings)assert.ok(f.actualMetric&&f.recommendedMetric);}
 finally{await reviewer.close();}
 assert.equal(await reviewer.review(three,actions),null);
});

test('four-player recommendations must be a legal masked discard actually held, including red identity',async()=>{
 const {legalC3Discard}=await import('../scripts/mahjong-c3-infer.mjs');const mask=Array(46).fill(1);
 assert.equal(legalC3Discard({legal:['1p']},{mask},{action:9}),'1p');
 assert.equal(legalC3Discard({legal:['1p']},{mask},{action:10}),null);
 const denied=mask.slice();denied[9]=0;assert.equal(legalC3Discard({legal:['1p']},{mask:denied},{action:9}),null);
 assert.equal(legalC3Discard({legal:['5p']},{mask},{action:35}),null);
 assert.equal(legalC3Discard({legal:['5pr']},{mask},{action:35}),'5pr');
 assert.equal(legalC3Discard({legal:['1p']},{mask},{action:37}),null);
 assert.equal(legalC3Discard({legal:['1p']},{mask},{action:NaN}),null);
});

test('even a recommended legal tile is withheld when the recorded actual discard is masked illegal',async()=>{
 const {legalC3Discard}=await import('../scripts/mahjong-c3-infer.mjs');const mask=Array(46).fill(1);mask[10]=0;
 assert.equal(legalC3Discard({actual:'2p',legal:['1p','2p']},{mask},{action:9}),null);
 assert.equal(legalC3Discard({actual:'1p',legal:['1p','2p']},{mask},{action:9}),'1p');
});

test('actual isolated sanma worker recognizes a recorded riichi and offers a real held genbutsu',async()=>{
 const {threeDefenseScenario}=await import('./fixtures/mahjong-review-three.ts');
 const {acceptedSanmaReport}=await import('../src/mahjong-sanma-comment.ts');
 const {summary,actions}=threeDefenseScenario(),reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:10000});
 try{
  const report=await reviewer.review(summary,actions);assert.ok(acceptedSanmaReport(summary,report));
  const defensive=report.findings.find(f=>f.seat===0&&f.turn===6&&f.basis==='genbutsu');
  assert.ok(defensive);assert.equal(defensive.actual,'2p');assert.equal(defensive.against,1);
  const {toC3Tile}=await import('../src/mahjong-c3-extract.ts');let own=0;
  const boundary=actions.findIndex(a=>a.name==='RecordDiscardTile'&&a.data.seat===0&&++own===6);
  const river=actions.slice(0,boundary).filter(a=>a.name==='RecordDiscardTile'&&a.data.seat===1).map(a=>toC3Tile(a.data.tile));
  assert.ok(river.includes(defensive.recommended));
 }finally{await reviewer.close();}
});

test('diagnostics distinguish no decisions, real worker errors and deadlines without exposing messages',async()=>{
 const real=createPaipuReviewer({sanmaEnabled:true});const got=[];
 try{assert.equal(await real.review(three,[],d=>got.push(d)),null);assert.equal(got[0].status,'no-decisions');assert.equal(got[0].replayed,0);}finally{await real.close();}
 for(const [event,status] of [['error','worker-error'],['exit','worker-exit'],['stall','timeout']]){
  const diagnostics=[],reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:15,workerFactory(){const w=new EventEmitter();w.postMessage=()=>{if(event!=='stall')queueMicrotask(()=>w.emit(event,Error('PRIVATE_ERROR')));};w.terminate=async()=>{};return w;}});
  try{assert.equal(await reviewer.review(three,[],d=>diagnostics.push(d)),null);assert.equal(diagnostics[0].status,status);assert.doesNotMatch(JSON.stringify(diagnostics),/PRIVATE/);}finally{await reviewer.close();}
 }
});
test('diagnostic messages whitelist fields and callbacks cannot interrupt a successful report',async()=>{
 const {reviewDiagnostic,displayDiagnostic}=await import('../scripts/mahjong-review-diagnostics.mjs');
 const raw={status:'no-findings',findings:0,replayed:17,secret:'PRIVATE',uuid:'PRIVATE',valueStatus:'PRIVATE',rounds:-1};
 assert.deepEqual(reviewDiagnostic(raw),{status:'no-findings',replayed:17,findings:0});
 assert.deepEqual(displayDiagnostic({status:'no-member-findings',memberFindings:0,private:'PRIVATE'}),{status:'no-member-findings',memberFindings:0});
 const report={test:true},reviewer=createPaipuReviewer({sanmaEnabled:true,workerFactory(){const w=new EventEmitter();w.postMessage=()=>queueMicrotask(()=>w.emit('message',{kind:'equal-review-result-v1',report,diagnostic:raw}));w.terminate=async()=>{};return w;}});
 try{assert.deepEqual(await reviewer.review(three,[],()=>{throw Error('callback');}),report);}finally{await reviewer.close();}
});
