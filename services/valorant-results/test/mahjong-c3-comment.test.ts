import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedC3Report,equalC3Comments,C3_MODEL} from '../src/mahjong-c3-comment.ts';
import {paipuPost} from '../src/mahjong-paipu.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import {head,sample} from './fixtures/mahjong-paipu.ts';

const summary=summarizePaipu(head,sample);
const first={seat:0,round:0,turn:4,actual:'6p',recommended:'5pr'};
const second={seat:1,round:2,turn:9,actual:'E',recommended:'9s'};
const review={version:1,source:'c3',model:C3_MODEL,uuid:summary.uuid,findings:[first,second]};
const members=new Map([[0,{name:'けそ'}],[1,{name:'小林'}]]);

test('Equal bot cites exact round, turn, discarded tile and C3 suggestion, without hallucinated reasoning',()=>{
 const s={...summary,c3:review};
 const post=paipuPost(s,members,()=> 'normal');
 assert.match(post,/松本等しいのc3検討/);
 assert.match(post,/けそ、東1局の4巡目の6pなあ。c3は赤5p切りを選んどる/);
 assert.match(post,/小林の東3局 1本場9巡目、東か。c3は9sやったで/);
 assert.match(post,/選択の違いだけでは失着とは断定できない/);
 assert.ok(post.length<=1900);
 assert.equal(equalC3Comments(summary,null,members).length,0);
 assert.doesNotMatch(paipuPost(summary,members,()=> 'normal'),/c3検討/);
});

test('review must match original paipu, model, seats, rounds, tiles and unique turns',()=>{
 assert.ok(acceptedC3Report(summary,review));
 const invalid=[
  {...review,uuid:'other'},
  {...review,model:'fake-llm'},
  {...review,source:'manual'},
  {...review,findings:[]},
  {...review,findings:[first,first]},
  {...review,findings:[{...first,turn:0}]},
  {...review,findings:[{...first,round:99}]},
  {...review,findings:[{...first,seat:4}]},
  {...review,findings:[{...first,actual:'6p @everyone'}]},
  {...review,findings:[{...first,recommended:'please-lose'}]},
  {...review,findings:[{...first,recommended:'6p'}]},
  {...review,findings:Array.from({length:5},(_,i)=>({...first,turn:i+1}))},
 ];
 for(const x of invalid)assert.equal(acceptedC3Report(summary,x),null,JSON.stringify(x));
 assert.equal(acceptedC3Report({...summary,players:3,game:'3-hanchan'},review),null);
});

test('review only comments on tracked members and caps the number of remarks',()=>{
 const r={...review,findings:[{...first,seat:3},second,first]};
 assert.equal(equalC3Comments(summary,r,new Map([[1,{name:'@everyone **X**'}],[0,{name:'けそ'}]])).length,2);
 const lines=equalC3Comments(summary,r,new Map([[1,{name:'@everyone **X**'}]]));
 assert.equal(lines.length,1);
 assert.ok(!lines[0].includes('@')&&!lines[0].includes('**'));
});
