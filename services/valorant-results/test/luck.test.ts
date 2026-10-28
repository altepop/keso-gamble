import test from 'node:test';
import assert from 'node:assert/strict';
import {luckFor,applyLuck,luckLabel,chance,LUCK_PERCENT} from '../src/luck.ts';
import {luckyStake} from '../src/mahjong-claims.ts';

test('luck lands at about 4% double, 1% triple and 3% unlucky, and never changes for the same seed',()=>{
 const counts={double:0,triple:0,unlucky:0,none:0};
 for(let i=0;i<40000;i++)counts[luckFor('seed-'+i)??'none']++;
 assert.ok(Math.abs(counts.double/400-LUCK_PERCENT.double)<0.6,JSON.stringify(counts));
 assert.ok(Math.abs(counts.triple/400-LUCK_PERCENT.triple)<0.3,JSON.stringify(counts));
 assert.ok(Math.abs(counts.unlucky/400-LUCK_PERCENT.unlucky)<0.5,JSON.stringify(counts));
 assert.equal(luckFor('same'),luckFor('same'));
 let hits=0;for(let i=0;i<20000;i++)if(chance('c-'+i,20))hits++;assert.ok(Math.abs(hits/200-20)<1.5,String(hits));
});
test('luck doubles or triples a gain and wipes out a loss; bad luck halves a gain and doubles a loss; zero stays zero',()=>{
 assert.deepEqual([applyLuck(900,'double'),applyLuck(900,'triple'),applyLuck(-300,'double'),applyLuck(-300,'triple')],[1800,2700,0,0]);
 assert.deepEqual([applyLuck(901,'unlucky'),applyLuck(-300,'unlucky'),applyLuck(0,'triple'),applyLuck(500,null)],[450,-600,0,500]);
 assert.equal(luckLabel('double',900),'（🍀 ラッキー：KP2倍）');assert.equal(luckLabel('triple',900),'（🍀🍀 ラッキー：KP3倍）');
 assert.equal(luckLabel('double',-300),'（🍀 ラッキー：マイナス帳消し）');
 assert.equal(luckLabel('unlucky',900),'（💀 アンラッキー：半分没収）');assert.equal(luckLabel('unlucky',-300),'（💀 アンラッキー：マイナス2倍）');
 assert.equal(luckLabel(null,900),'');assert.equal(luckLabel('double',0),'');
});
test('Mahjong Soul amounts carry the same luck: the stored amount is unsigned, last place stays a loss unless wiped out',()=>{
 const seen=new Map<string,number>();
 for(let i=0;i<3000;i++){const {amount,note}=luckyStake('4-hanchan',4,'paipu-'+i,7);seen.set(note,amount);}
 assert.equal(seen.get(''),500);assert.equal(seen.get('（🍀 ラッキー：マイナス帳消し）'),0);assert.equal(seen.get('（💀 アンラッキー：マイナス2倍）'),1000);
 const top=new Map<string,number>();for(let i=0;i<3000;i++){const {amount,note}=luckyStake('4-hanchan',1,'paipu-'+i,7);top.set(note,amount);}
 assert.deepEqual([top.get(''),top.get('（🍀 ラッキー：KP2倍）'),top.get('（🍀🍀 ラッキー：KP3倍）'),top.get('（💀 アンラッキー：半分没収）')],[600,1200,1800,300]);
});
