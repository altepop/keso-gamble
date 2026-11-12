import test from 'node:test';import assert from 'node:assert/strict';
import {sanmaDefenseFinding} from '../src/mahjong-sanma-defense.ts';
import type {ReviewDecision} from '../src/mahjong-review-state.ts';
import {acceptedSanmaReport,equalSanmaComments} from '../src/mahjong-sanma-comment.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import {head,sample} from './fixtures/mahjong-paipu.ts';
const hand=['1m','9m','1p','2p','3p','4p','6p','8p','2s','3s','4s','E','P','C'];
function position():ReviewDecision{return {seat:0,round:0,turn:8,actionIndex:0,actual:'2p',draw:'C',hand:hand.slice(),players:3,dealer:0,wind:0,honba:0,sticks:1,scores:[35000,34000,35000],rivers:[['1s'],['9m','E'],['F']],melds:[[],[],[]],north:[0,0,0],riichi:[false,true,false],doubleRiichi:[false,false,false],doras:['S'],visible:Array(34).fill(0),interrupted:false};}
const s4=summarizePaipu(head,sample),summary={...s4,players:3,game:'3-hanchan',seats:s4.seats.slice(0,3)};
test('far hands may offer a real genbutsu against a single opponent, with no fabricated danger claim',()=>{
 const d=position(),f=sanmaDefenseFinding(d,summary.game);assert.ok(f);assert.equal(f.against,1);assert.equal(f.actualOnRiver,false);assert.ok(['9m','E'].includes(f.recommended));assert.ok(d.hand.includes(f.recommended));
 const r={version:2,source:'sanma-rules',model:'sanma-rules-v2',uuid:summary.uuid,findings:[f]};
 assert.ok(acceptedSanmaReport(summary,r));
 const lines=equalSanmaComments(summary,r,new Map([[0,{name:'けそ'}],[1,{name:'@everyone **相手**'}]]));
 assert.match(lines.join(''),/現物|河にある/);assert.match(lines.join(''),/相手/);assert.match(lines.join(''),/8打目/);
 assert.doesNotMatch(lines.join(''),/@|絶対|必ず|放銃率|c3|AI/i);
 assert.match(lines[0],/向聴/);assert.match(lines[0],/他の相手/);assert.match(lines[0],/正解までは出してへん/);
});
test('a routine genbutsu choice is omitted, including old signed positive findings',()=>{
 const d=position();d.actual='9m';assert.equal(sanmaDefenseFinding(d,summary.game),null);
 const old={seat:0,round:0,turn:8,actual:'9m',recommended:'9m',basis:'genbutsu',against:1,againstRiichi:true,recommendedOnRiver:true,actualOnRiver:true,shanten:4};
 const r={version:2,source:'sanma-rules',model:'sanma-rules-v2',uuid:summary.uuid,findings:[old]};
 assert.ok(acceptedSanmaReport(summary,r),'backward-compatible validation is retained');
 assert.deepEqual(equalSanmaComments(summary,r,new Map([[0,{name:'けそ'}]])),[]);
});
test('defensive notes require precise threat, context and a known held genbutsu',()=>{
 const d=position();
 const near={...d,hand:['1p','2p','3p','4p','5p','6p','7s','8s','9s','E','E','E','P','P'],actual:'P'};
 for(const x of [near,{...d,riichi:[false,false,false]},{...d,riichi:[false,true,true]},{...d,riichi:[true,true,false]},{...d,rivers:[[],['1s'],[]]},{...d,turn:5},{...d,wind:1,dealer:2},{...d,scores:[1000,50000,54000]},{...d,hand:['N',...d.hand.slice(1)]}])assert.equal(sanmaDefenseFinding(x,summary.game),null);
 const f=sanmaDefenseFinding(d,summary.game)!;const report={version:2,source:'sanma-rules',model:'sanma-rules-v2',uuid:summary.uuid,findings:[f]};
 for(const bad of [{...f,against:0},{...f,againstRiichi:false},{...f,recommendedOnRiver:false},{...f,shanten:1},{...f,turn:2},{...f,actualOnRiver:true}])assert.equal(acceptedSanmaReport(summary,{...report,findings:[bad]}),null);
 assert.equal(acceptedSanmaReport(summary,{...report,version:1}),null);
});
test('red and ordinary fives share the opponent river kind for genbutsu',()=>{
 const d=position();d.hand[8]='5pr';d.rivers[1]=['5p'];const f=sanmaDefenseFinding(d,summary.game);assert.ok(f);assert.equal(f.recommended,'5pr');
});

test('a third player call does not erase a genbutsu fact against the one reacher',()=>{
 const d=position();d.melds[2]=[{kind:'pon',tiles:['P','P','P'],from:0}];d.visible[31]=3;
 const f=sanmaDefenseFinding(d,summary.game);assert.ok(f);assert.equal(f.against,1);assert.ok(['9m','E'].includes(f.recommended));
});
test('a far open hand can consider a legal held genbutsu without a global push/fold verdict',()=>{
 const d=position();d.hand=['1m','9m','1p','4p','6p','8p','2s','4s','7s','E','C'];d.actual='1p';d.melds[0]=[{kind:'pon',tiles:['P','P','P'],from:2}];d.visible[31]=3;
 const f=sanmaDefenseFinding(d,summary.game);assert.ok(f);assert.ok(f.shanten>=3);assert.ok(d.hand.includes(f.recommended));
});
