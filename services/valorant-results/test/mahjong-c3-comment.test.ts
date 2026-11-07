import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedC3Report,equalC3Comments,C3_MODEL} from '../src/mahjong-c3-comment.ts';
import {paipuPost} from '../src/mahjong-paipu.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import {head,sample} from './fixtures/mahjong-paipu.ts';

const summary=summarizePaipu(head,sample);
const different={seat:0,round:0,turn:4,actual:'6p',recommended:'3p'};
const agree={seat:1,round:2,turn:9,actual:'E',recommended:'E'};
const secondDifference={...agree,turn:8,recommended:'9s'};
const review={version:1,source:'c3',model:C3_MODEL,uuid:summary.uuid,findings:[different,agree]};
const members=new Map([[0,{name:'けそ'}],[1,{name:'小林'}]]);

test('Equal bot comments in first-person Kansai style on real round, turn, and discard without naming its model',()=>{
 const s={...summary,c3:review};
 const post=paipuPost(s,members,()=> 'normal');
 assert.match(post,/松本等しいのひと言/);
 assert.match(post,/けそ、?東1局の4巡目|東1局の4巡目、けそ/);
 assert.match(post,/6p/);
 assert.match(post,/3p/);
 assert.match(post,/僕/);
 assert.match(post,/小林/);
 assert.match(post,/東3局 1本場/);
 assert.match(post,/東/);
 assert.match(post,/ええ|同じ/);
 assert.doesNotMatch(post,/c3|モデル|AI判定|推奨打牌/i);
 assert.ok(post.length<=1900);
 assert.equal(equalC3Comments(summary,null,members).length,0);
 assert.doesNotMatch(paipuPost(summary,members,()=> 'normal'),/松本等しいのひと言/);
});

test('matching decisions are praised, different choices get alternatives instead of fictional reasons',()=>{
 const lines=equalC3Comments(summary,review,members);
 assert.equal(lines.length,2);
 assert.match(lines[0],/僕/);
 assert.match(lines[0],/3p/);
 assert.match(lines[0],/6p/);
 assert.match(lines[1],/僕/);
 assert.match(lines[1],/ええ|好き|同じ/);
 assert.doesNotMatch(lines.join(' '),/c3|放銃率|危険度|期待値|AI/i);
 const differentOnly={...review,findings:[different,secondDifference]};
 const critiques=equalC3Comments(summary,differentOnly,members);
 assert.equal(critiques.length,2);
 assert.doesNotMatch(critiques.join(' '),/ええと思います|僕も同じ|好きですね/);
 const praiseOnly={...review,findings:[agree]};
 assert.equal(equalC3Comments(summary,praiseOnly,members).length,1);
 assert.match(equalC3Comments(summary,praiseOnly,members)[0],/ええ|好き|同じ/);
});

test('review must match the exact game, model, seat, round, tile, and one item per turn',()=>{
 assert.ok(acceptedC3Report(summary,review));
 const invalid=[
  {...review,uuid:'other'},
  {...review,model:'fake-llm'},
  {...review,source:'manual'},
  {...review,findings:[]},
  {...review,findings:[different,different]},
  {...review,findings:[{...different,turn:0}]},
  {...review,findings:[{...different,round:99}]},
  {...review,findings:[{...different,seat:4}]},
  {...review,findings:[{...different,actual:'6p @everyone'}]},
  {...review,findings:[{...different,recommended:'please-lose'}]},
  {...review,findings:Array.from({length:5},(_,i)=>({...different,turn:i+1}))},
 ];
 for(const x of invalid)assert.equal(acceptedC3Report(summary,x),null,JSON.stringify(x));
 assert.equal(acceptedC3Report({...summary,players:3,game:'3-hanchan'},review),null);
});

test('one criticism and one praise are included when both exist; tracked names are sanitized',()=>{
 const mixed={...review,findings:[different,secondDifference,agree]};
 const lines=equalC3Comments(summary,mixed,members);
 assert.equal(lines.length,2);
 assert.match(lines[1],/ええ|好き|同じ/);
 const untracked={...review,findings:[{...different,seat:3},agree,different]};
 assert.equal(equalC3Comments(summary,untracked,members).length,2);
 const single=equalC3Comments(summary,untracked,new Map([[1,{name:'@everyone **X**'}]]));
 assert.equal(single.length,1);
 assert.ok(!single[0].includes('@')&&!single[0].includes('**'));
 assert.equal(equalC3Comments(summary,untracked,members,0).length,0);
});


test('adding comments preserves the entire original post including old roasts and the closing quote',()=>{
 const older=paipuPost(summary,members,()=> 'normal',['✅ Aさん KP +100']);
 const newer=paipuPost({...summary,c3:review},members,()=> 'normal',['✅ Aさん KP +100']);
 assert.match(older,/^🀄 \*\*雀魂 四麻 半荘｜牌譜検討\*\*/);
 for(const section of ['**順位**','**KP**','**主な和了**','**メンバー**','🗯️','💬 ']){
  assert.ok(older.includes(section),'baseline had '+section);
  assert.ok(newer.includes(section),'addition removed '+section);
 }
 assert.ok(newer.includes('**松本等しいのひと言**'),'short review should fit');
 const oldLast=older.split('\n').at(-1);
 assert.ok(oldLast?.startsWith('💬 '),'legacy ending intact');
 assert.equal(newer.split('\n').at(-1),oldLast,'existing closing quote stays last');
 const allOldBlocks=older.slice(older.indexOf('**主な和了**'),older.lastIndexOf('💬 '));
 assert.ok(newer.includes(allOldBlocks),'hand and member text remains byte-for-byte intact');
});

test('near Discord limit the old post wins; extra comments may be omitted, never old content',()=>{
 const longResults=['🔎 '+('かなり長い精算結果'.repeat(130))];
 const baseline=paipuPost(summary,members,()=> 'normal',longResults);
 const modified=paipuPost({...summary,c3:review},members,()=> 'normal',longResults);
 assert.equal(modified,baseline,'existing message is the priority at capacity');
 assert.doesNotMatch(modified,/松本等しいのひと言/);
 assert.ok(modified.length<=1900);
});

test('a report without an extracted finding leaves exactly the old message unchanged',()=>{
 const old=paipuPost(summary,members,()=> 'normal');
 for(const c3 of [undefined,null,{...review,uuid:'unrelated'},{...review,model:'invalid'},{}]){
  assert.equal(paipuPost({...summary,c3},members,()=> 'normal'),old);
 }
});
