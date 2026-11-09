import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,URL} from 'node:url';
// @ts-expect-error Standalone Actions-side JS coordinator.
import {reviewSanmaValues} from '../scripts/mahjong-sanma-value.mjs';
// @ts-expect-error Standalone Actions-side JS worker host.
import {createPaipuReviewer} from '../scripts/mahjong-review.mjs';
import {sanmaValueCase,sanmaValueFinding} from '../src/mahjong-sanma-value.ts';
import {reviewDecisions} from '../src/mahjong-review-state.ts';
import {threeValueScenario} from './fixtures/mahjong-review-three.ts';
import {acceptedSanmaReport,equalSanmaComments} from '../src/mahjong-sanma-comment.ts';
const frame=()=>{const f=threeValueScenario();return {...f,d:reviewDecisions(f.actions,f.summary).find(d=>d.seat===1&&d.turn===2)!};};
const metric=(tile:string,live=7,min=3000,max=min)=>({tile,live,min,max,hanMin:3,hanMax:3,fuMin:30,fuMax:30});
test('conditional hand value request includes only focal hand and public known facts',()=>{
 const {d}=frame(),c=sanmaValueCase(d,'3-hanchan')!;assert.ok(c);assert.equal(c.seatWind,1);
 assert.deepEqual(Object.keys(c).sort(),['candidates','doras','doubleRiichi','melds','north','riichi','roundWind','seatWind']);
 assert.ok(c.candidates.every(c=>c.hand.length===13));
 const keep=c.candidates.find(c=>c.tile==='5s')!;assert.deepEqual(keep.waits,[{tile:'1s',left:3},{tile:'4s',left:4}]);
 assert.equal(JSON.stringify(c).includes('tiles0'),false);assert.deepEqual(d.publicRed,[]);
 for(const change of [{publicRed:undefined},{turn:1},{wind:1,dealer:2},{riichi:[false,true,false]},{hand:['N',...d.hand.slice(1)]}])assert.equal(sanmaValueCase({...d,...change},'3-hanchan'),null);
});
test('red wait availability is based on public red tiles and focal hand only',()=>{
 const {d}=frame();
 const hand=['1p','2p','3p','4p','5p','6p','2s','3s','4s','6s','7s','7s','8s','8s'];
 const f={...d,hand,actual:'6s'};
 const c=sanmaValueCase(f,'3-hanchan')!;assert.ok(c);
 const waits=c.candidates.find(c=>c.tile==='7s')!.waits;
 assert.ok(waits.some(w=>w.tile==='5sr'&&w.left===1));
 assert.ok(waits.some(w=>w.tile==='5s'&&w.left===3));
 const visible=d.visible.slice();visible[22]++;
 const exposed=sanmaValueCase({...f,visible,publicRed:['5sr']},'3-hanchan')!;
 assert.ok(!exposed.candidates.flatMap(c=>c.waits).some(w=>w.tile==='5sr'));
 assert.equal(exposed.candidates.find(c=>c.tile==='7s')!.waits.find(w=>w.tile==='5s')!.left,3);
 const keys=Object.keys(d);assert.ok(!keys.includes('redSeen'));assert.ok(!keys.includes('hands'));
});
test('value comparisons require non-decreasing live waits and a robust conditional point gap',()=>{
 const {d}=frame();
 assert.equal(sanmaValueFinding(d,[metric('2s'),metric('5s',6,6000)]),null);
 assert.equal(sanmaValueFinding(d,[metric('2s',7,3000,6000),metric('5s',7,6000)]),null);
 const f=sanmaValueFinding(d,[metric('2s'),metric('5s',7,6000)])!;assert.ok(f);assert.equal(f.recommended,'5s');
 const p=sanmaValueFinding({...d,actual:'5s'},[metric('2s'),metric('5s',7,6000)])!;assert.equal(p.actual,p.recommended);
 assert.equal(sanmaValueFinding(d,[metric('2s'),metric('5s',7,Infinity)]),null);
});
test('v3 validates numeric evidence and presents conditional value without claiming EV or guaranteed wins',()=>{
 const {summary,d}=frame(),f=sanmaValueFinding(d,[metric('2s'),metric('5s',7,6000)])!;
 const report={version:3,source:'sanma-rules',model:'sanma-rules-v3',uuid:summary.uuid,findings:[f]};
 assert.ok(acceptedSanmaReport(summary,report));
 const text=equalSanmaComments(summary,report,new Map([[1,{name:'@everyone'}]])).join('');
 assert.match(text,/6000点/);assert.match(text,/試算/);assert.match(text,/ツモ損/);assert.doesNotMatch(text,/@|c3|期待値|絶対|確実|AI/i);
 assert.equal(acceptedSanmaReport(summary,{...report,version:2,model:'sanma-rules-v2'}),null);
 assert.equal(acceptedSanmaReport(summary,{...report,findings:[{...f,recommendedValue:metric('5s',1,6000)}]}),null);
});
test('missing/stalled/malformed calculator fails closed and child receives no secrets',async()=>{
 const {d}=frame();let starts=0;
 assert.deepEqual(reviewSanmaValues([d],'3-hanchan',{python:'',runner(){starts++;}}),[]);
 for(const result of [{status:1,stdout:'private'},{status:0,stdout:'not-json'},{status:0,stdout:'{"version":1,"results":[]}'},{error:Error('private')}]){
  assert.deepEqual(reviewSanmaValues([d],'3-hanchan',{python:'/fake',runner(cmd:any,args:any,options:any){starts++;assert.equal(cmd,'/fake');assert.equal(args[0],'-I');assert.deepEqual(options.env,{});assert.equal(options.timeout,8000);assert.equal(options.killSignal,'SIGKILL');return result;}}),[]);
 }
 assert.equal(starts,4);
});
test('real pinned hand calculator recognizes yaku/fu/dora, nuki, dealer and actual isolated worker', {skip:!process.env.SANMA_PYTHON},async()=>{
 const {summary,actions,d}=frame();
 const out=reviewSanmaValues([d],'3-hanchan');assert.equal(out.length,1);const f=out[0];
 assert.equal(f.recommended,'5s');assert.equal(f.actualValue.min,3000);assert.equal(f.recommendedValue.min,6000);
 assert.equal(f.recommendedValue.hanMin,5);assert.equal(f.recommendedValue.fuMin,20);assert.equal(f.recommendedValue.live,7);
 const calculate=(c:any)=>{const r=spawnSync(process.env.SANMA_PYTHON!,['-I',fileURLToPath(new URL('../scripts/mahjong-sanma-value.py',import.meta.url))],{input:JSON.stringify({version:1,cases:[c]}),encoding:'utf8',timeout:8000,env:{}});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout).results[0];};
 const c=sanmaValueCase(d,'3-hanchan')!;
 const north=calculate({...c,north:1});assert.equal(north.find((m:any)=>m.tile==='5s').hanMin,6);assert.equal(north.find((m:any)=>m.tile==='5s').min,9000);
 const parent=calculate({...c,seatWind:0});assert.equal(parent.find((m:any)=>m.tile==='5s').min,8000);
 const red=structuredClone(c);for(const x of red.candidates)x.hand[x.hand.indexOf('5p')]='5pr';
 assert.equal(calculate(red).find((m:any)=>m.tile==='5s').hanMin,6);
 const ordinary={tile:'1s',hand:['9m','9m','9m','1p','2p','3p','4p','5p','6p','7s','8s','9s','E'],waits:[{tile:'E',left:3}]};
 const man=calculate({candidates:[ordinary,{...ordinary,tile:'2s'}],doras:['1m'],north:0,seatWind:1,roundWind:0,riichi:false,doubleRiichi:false,melds:[]});
 assert.equal(man[0].hanMin,4,'sanma 1m indicator makes 9m dora (not nonexistent 2m)');
 const northDora=calculate({...c,doras:['W'],north:1});
 const plain=calculate({...c,doras:['W'],north:0});
 assert.equal(northDora[0].hanMin,plain[0].hanMin+2,'nuki is both extracted bonus and North dora');
 const invalid=spawnSync(process.env.SANMA_PYTHON!,['-I',fileURLToPath(new URL('../scripts/mahjong-sanma-value.py',import.meta.url))],{input:'private-invalid-body',encoding:'utf8',timeout:8000,env:{}});
 assert.equal(invalid.status,1);assert.equal(invalid.stderr,'');assert.doesNotMatch(invalid.stdout,/private/);
 const reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:15000});
 try{const report=await reviewer.review(summary,actions);assert.ok(acceptedSanmaReport(summary,report));assert.ok(report.findings.some((f:any)=>f.basis==='tsumo-value'));}finally{await reviewer.close();}
});


test('hidden red identity and appended future ura/wins never enter earlier value requests',()=>{
 const f=threeValueScenario(),before=reviewDecisions(f.actions,f.summary).find(d=>d.seat===1&&d.turn===2)!;
 assert.ok(f.actions[0].data.tiles2.includes('0p'));
 const changed=structuredClone(f.actions);changed[0].data.tiles2=changed[0].data.tiles2.map((t:string)=>t==='0p'?'5p':t);
 changed.push({name:'RecordHule',data:{hules:[{seat:2,hand:['0p'],li_doras:['9p'],fans:[{id:1,val:99}]}]}});
 const after=reviewDecisions(changed,f.summary).find(d=>d.seat===1&&d.turn===2)!;
 assert.deepEqual(sanmaValueCase(after,'3-hanchan'),sanmaValueCase(before,'3-hanchan'));
});

test('overflow review is queued as one Discord message without displacing existing content',async()=>{
 const {paipuPostPayload,paipuPost}=await import('../src/mahjong-paipu.ts');
 const {summary,d}=frame(),f=sanmaValueFinding(d,[metric('2s'),metric('5s',7,6000)])!;
 const s={...summary,review:{version:3,source:'sanma-rules',model:'sanma-rules-v3',uuid:summary.uuid,findings:[f]}};
 const members=new Map([[1,{name:'test1'}]]),outcomes=['🔎 '+('長い精算結果'.repeat(400))];
 const base=paipuPost(summary,members,()=> 'normal',outcomes),post=paipuPostPayload(s,members,()=> 'normal',outcomes);
 assert.ok(post.content===base,'legacy content is unchanged');assert.ok(post.embeds);assert.equal(post.embeds.length,1);
 assert.match(post.embeds[0].description,/6000点/);assert.ok(post.embeds[0].description.length<4096);
 assert.ok(post.content.length<=1900);
 const short=paipuPostPayload(s,members,()=> 'normal');assert.equal(short.embeds,undefined,'already visible comments are not duplicated');
});

test('a red tile becomes public only when revealed, including another player discard',()=>{
 const f=threeValueScenario(),a=structuredClone(f.actions),d=a[0].data;
 const red=d.tiles2.indexOf('0p');assert.ok(red>=0);
 [d.tiles0[13],d.tiles2[red]]=[d.tiles2[red],d.tiles0[13]];
 a[1].data.tile='0p';a[1].data.moqie=false;
 const frames=reviewDecisions(a,f.summary),at=frames.find(d=>d.seat===1&&d.turn===2)!;assert.ok(at);
 assert.ok(at.publicRed?.includes('5pr'));assert.ok(at.visible[13]>0);
});

test('recorded sanma riichi declaration is valued under the same conditional riichi for both choices',{skip:!process.env.SANMA_PYTHON},()=>{
 const f=threeValueScenario(),a=structuredClone(f.actions);a.at(-1)!.data.is_liqi=true;
 const d=reviewDecisions(a,f.summary).find(d=>d.seat===1&&d.turn===2)!;assert.ok(d);assert.equal(d.declaringReach,true);
 const c=sanmaValueCase(d,'3-hanchan')!;assert.equal(c.riichi,true);
 const plain=reviewSanmaValues([{...d,declaringReach:false}],'3-hanchan')[0];
 const reach=reviewSanmaValues([d],'3-hanchan')[0];assert.ok(reach);assert.equal(reach.riichi,true);
 assert.equal(reach.actualValue.hanMin,plain.actualValue.hanMin+1);
 assert.equal(reach.recommendedValue.hanMin,plain.recommendedValue.hanMin+1);
 const report={version:3,source:'sanma-rules',model:'sanma-rules-v3',uuid:f.summary.uuid,findings:[reach]};
 assert.match(equalSanmaComments(f.summary,report,new Map([[1,{name:'test1'}]])).join(''),/リーチ後ツモ/);
});

test('own pon, open kan and ankan use real meld-aware shanten/fu/yaku with correct menzen comments',{skip:!process.env.SANMA_PYTHON},()=>{
 const {summary,d:base}=frame();
 for(const kind of ['pon','kan','ankan'] as const){
  const d=structuredClone(base);d.hand=['1p','2p','3p','4p','5p','6p','2s','3s','5s','5s','5s'];
  d.actual='2s';d.melds[1]=[{kind,tiles:Array(kind==='pon'?3:4).fill('P'),from:kind==='ankan'?null:0}];
  d.north[1]=kind==='ankan'?0:2;d.visible[31]=kind==='pon'?3:4;d.visible[30]=d.north[1];
  const c=sanmaValueCase(d,'3-hanchan')!;assert.ok(c);assert.equal(c.melds[0].kind,kind);assert.equal(c.candidates[0].hand.length,10);
  const report=reviewSanmaValues([d],'3-hanchan');assert.equal(report.length,1);const finding=report[0];
  assert.equal(finding.recommended,'5s');assert.equal(finding.menzen,kind==='ankan');
  assert.ok(finding.recommendedValue.min>=finding.actualValue.max+1000);
  if(kind==='ankan')assert.equal(finding.actualValue.fuMin,60,'concealed honor quad fu is retained');
  const text=equalSanmaComments(summary,{version:3,source:'sanma-rules',model:'sanma-rules-v3',uuid:summary.uuid,findings:[finding]},new Map([[1,{name:'test1'}]])).join('');
  assert.match(text,kind==='ankan'?/門前ツモ/:/ツモ和了/);if(kind!=='ankan')assert.doesNotMatch(text,/門前/);
  if(kind!=='ankan')assert.equal(sanmaValueCase({...d,declaringReach:true},'3-hanchan'),null,'open riichi is illegal');
 }
});

test('same-kind kuikae candidate is excluded immediately after pon',async()=>{
 const {sanmaDiscardMetrics}=await import('../src/mahjong-sanma-efficiency.ts');const {d}=frame();
 d.hand=['1p','2p','3p','4p','5p','6p','2s','3s','5s','5s','P'];d.actual='5s';d.draw=null;d.afterCall=true;
 d.melds[1]=[{kind:'pon',tiles:['P','P','P'],from:0}];d.visible[31]=3;
 const metrics=sanmaDiscardMetrics(d);assert.ok(metrics.length);assert.ok(metrics.every(m=>m.tile!=='P'));
 assert.deepEqual(sanmaDiscardMetrics({...d,actual:'P'}),[]);
});

test('open hand with bonus tiles but no yaku is not called a legal winning hand',{skip:!process.env.SANMA_PYTHON},()=>{
 const {d}=frame();d.hand=['1p','2p','3p','4p','5p','6p','2s','3s','5s','5s','5s'];d.actual='2s';
 d.melds[1]=[{kind:'pon',tiles:['1m','1m','1m'],from:0}];d.visible[0]=3;d.north[1]=2;d.visible[30]=2;
 assert.ok(sanmaValueCase(d,'3-hanchan'));const diagnostics={};
 assert.deepEqual(reviewSanmaValues([d],'3-hanchan',{diagnostics}),[]);
 assert.equal((diagnostics as {status?:string}).status,'ok','unsupported/no-yaku is a successful abstention, not a process error');
});

test('real isolated worker follows a legal two-kita/pon prefix and values the immediate open-hand discard',{skip:!process.env.SANMA_PYTHON},async()=>{
 const {threeOpenValueScenario}=await import('./fixtures/mahjong-review-three.ts');const {actions,summary}=threeOpenValueScenario();
 const diagnostics={acceptedRounds:0,blocked:{}},frames=reviewDecisions(actions,summary,256,diagnostics);assert.deepEqual(diagnostics.blocked,{});
 const d=frames.find(d=>d.seat===1&&d.turn===2)!;assert.ok(d);assert.equal(d.afterCall,true);assert.equal(d.draw,null);assert.equal(d.north[1],2);assert.equal(d.melds[1][0].kind,'pon');assert.equal(d.hand.length,11);
 const reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:15000});
 try{const report=await reviewer.review(summary,actions);assert.ok(acceptedSanmaReport(summary,report));const f=report.findings.find((f:any)=>f.seat===1&&f.turn===2&&f.basis==='tsumo-value');assert.ok(f);assert.equal(f.menzen,false);assert.equal(f.recommended,'5s');assert.equal(f.recommendedValue.min,5900);}finally{await reviewer.close();}
});

test('standard sanma open tanyao is a real yaku, with no imaginary menzen-tsumo han',{skip:!process.env.SANMA_PYTHON},()=>{
 const {d}=frame();d.hand=['2p','3p','4p','5p','6p','7p','3s','4s','6s','6s','6s'];d.actual='3s';
 d.melds[1]=[{kind:'pon',tiles:['6p','6p','6p'],from:0}];d.north[1]=2;d.doras=['2s'];d.visible=Array(34).fill(0);d.visible[14]=3;d.visible[19]=1;d.visible[22]=1;d.visible[30]=2;d.publicRed=['5sr'];
 const findings=reviewSanmaValues([d],'3-hanchan');assert.equal(findings.length,1);assert.equal(findings[0].recommended,'6s');
 assert.equal(findings[0].actualValue.hanMin,3,'open tanyao 1 + nuki 2, without menzen tsumo');
 assert.equal(findings[0].recommendedValue.hanMin,4);assert.equal(findings[0].menzen,false);
});

test('seat and round winds add distinct value-honor han, including double East',{skip:!process.env.SANMA_PYTHON},()=>{
 const {d}=frame();d.hand=['1p','2p','3p','4p','5p','6p','2s','3s','5s','5s','5s'];d.actual='2s';d.melds[1]=[{kind:'pon',tiles:['E','E','E'],from:0}];d.visible[27]=3;
 const c=sanmaValueCase(d,'3-hanchan')!;
 const calculate=(seatWind:number,roundWind:number)=>{
  const r=spawnSync(process.env.SANMA_PYTHON!,['-I',fileURLToPath(new URL('../scripts/mahjong-sanma-value.py',import.meta.url))],{input:JSON.stringify({version:1,cases:[{...c,seatWind,roundWind}]}),encoding:'utf8',timeout:8000,env:{}});assert.equal(r.status,0);return JSON.parse(r.stdout).results[0].find((m:any)=>m.tile==='2s');
 };
 assert.equal(calculate(1,0).hanMin,1,'East round only');
 assert.equal(calculate(0,1).hanMin,1,'East seat only');
 assert.equal(calculate(0,0).hanMin,2,'double East is two separate value honors');
});

test('first-discard double-riichi is evaluated as two han without assuming ippatsu or ura',{skip:!process.env.SANMA_PYTHON},async()=>{
 const {actions,summary}=threeValueScenario();const a=structuredClone(actions.slice(0,4));a[2].data.tile='5s';a[3].data.tile='2s';a[3].data.moqie=false;a[3].data.is_wliqi=true;
 const d=reviewDecisions(a,summary).find(d=>d.seat===1)!;assert.ok(d);assert.equal(d.turn,1);assert.equal(d.declaringDoubleReach,true);
 const c=sanmaValueCase(d,'3-hanchan')!;assert.ok(c);assert.equal(c.doubleRiichi,true);
 const finding=reviewSanmaValues([d],'3-hanchan')[0];assert.ok(finding);assert.equal(finding.doubleRiichi,true);assert.equal(finding.actualValue.hanMin,5);assert.equal(finding.recommendedValue.hanMin,7);
 const report={version:3,source:'sanma-rules',model:'sanma-rules-v3',uuid:summary.uuid,findings:[finding]};
 assert.match(equalSanmaComments(summary,report,new Map([[1,{name:'test1'}]])).join(''),/ダブルリーチ後ツモ/);
 assert.equal(sanmaValueCase({...d,interrupted:true},'3-hanchan'),null);
 const reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:15000});try{const r=await reviewer.review(summary,a);assert.ok(acceptedSanmaReport(summary,r));assert.ok(r.findings.some((f:any)=>f.doubleRiichi));}finally{await reviewer.close();}
});
