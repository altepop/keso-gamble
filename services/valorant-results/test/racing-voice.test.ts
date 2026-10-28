import test from 'node:test';
import assert from 'node:assert/strict';
import voice from '../racing-voice.json' with {type:'json'};
import catalogue from '../meme-quotes.json' with {type:'json'};
import {raceCatchphrase,raceCatchphrases,raceAside,raceBanter} from '../src/racing-voice.ts';
import {cardPost,crownPost,resultPost} from '../src/racing-posts.ts';
// @ts-expect-error Shared browser engine does not have TS declarations.
import {raceCard,raceResult} from '../../../js/racing.js';
const time=Date.parse('2026-10-28T21:00:00+09:00');

test('each racing post has one intact mandatory Hitoshii phrase, separate from the bot aside',()=>{
 assert.deepEqual(raceCatchphrases,['良かったこの距離で','お祭り男か']);
 for(const phrase of raceCatchphrases)assert.ok(catalogue.quotes.some(q=>q.text===phrase));
 const card=raceCard(time),seed='voice-fixture';
 for(const post of [cardPost(card,'hash'),crownPost({race:time,name:'fixture',user:'100000000000000001',reason:'fixture'}),resultPost(card,seed,[],()=> 'mild')]){
  const lines=post.split('\n'),quotes=lines.filter(l=>l.startsWith('💬 '));
  assert.equal(quotes.length,1);assert.ok(raceCatchphrases.includes(quotes[0].slice(3)));
  assert.ok(lines[lines.indexOf(quotes[0])+1].length>5,'authored aside occupies a separate line');
 }
});
test('both required phrases and every authored line are reachable, stable, with no player-name substitution in quotes',()=>{
 for(const kind of ['card','crown','result'] as const){
  const quotes=new Set<string>(),asides=new Set<string>();
  for(let i=0;i<3000;i++){quotes.add(raceCatchphrase(kind,'race-'+i));asides.add(raceAside(kind,'race-'+i));}
  assert.equal(quotes.size,2);assert.equal(asides.size,voice[kind].length);
  assert.equal(raceCatchphrase(kind,'same'),raceCatchphrase(kind,'same'));
 }
 for(const kind of ['win','partial','loss'] as const)for(const level of ['full','normal','mild'] as const){
  const seen=new Set<string>();for(let i=0;i<3000;i++)seen.add(raceBanter(kind,level,'race-'+i));
  assert.equal(seen.size,voice[kind][level].length);
  assert.ok([...seen].every(line=>!line.includes('\n')&&!raceCatchphrases.some(q=>line.includes(q))));
 }
});
test('small wins get personality too; a partial payout is never presented as a profitable win',()=>{
 const card=raceCard(time),seed='voice-fixture',winner=raceResult(card,seed).order[0],user='100000000000000001';
 const bet={id:'fixture',raceId:time,type:'win' as const,horse:winner,amount:100,odds:80,status:'won',payout:800,user};
 const winning=resultPost(card,seed,[bet],()=> 'full').split('\n').map((l,i,a)=>l.includes(user)?a.slice(i,i+3).join('\n'):'').find(Boolean)!;
 assert.ok(voice.win.full.some(line=>winning.endsWith(line)));assert.match(winning,/\+800 KP/);
 for(const payout of [100,50]){
  const partial=resultPost(card,seed,[{...bet,payout}],()=> 'full').split('\n').map((l,i,a)=>l.includes(user)?a.slice(i,i+3).join('\n'):'').find(Boolean)!;
  assert.ok(voice.partial.full.some(line=>partial.endsWith(line)));assert.ok(!voice.win.full.some(line=>partial.endsWith(line)));
 }
});
test('all outcomes respect mild preferences, even when the winning payout is large',()=>{
 const card=raceCard(time),seed='voice-fixture',winner=raceResult(card,seed).order[0],loser=raceResult(card,seed).order.at(-1),user='100000000000000001';
 for(const [kind,horse,payout,status] of [['win',winner,10000,'won'],['partial',winner,50,'won'],['loss',loser,0,'lost']] as const){
  const post=resultPost(card,seed,[{id:'fixture',raceId:time,type:'win',horse,amount:100,odds:80,status,payout,user}],()=> 'mild');
  const line=post.split('\n').map((l,i,a)=>l.includes(user)?a.slice(i,i+3).join('\n'):'').find(Boolean)!;
  assert.ok(voice[kind].mild.some(s=>line.endsWith(s)));assert.doesNotMatch(line,/下手|うんこ|不良品|どひゃー|神の側|寄付/);
 }
});
test('racing facts and verification data survive the new voice, with a full field and eight bettors',()=>{
 const card=raceCard(time),seed='fixed-fixture-seed',order=raceResult(card,seed).order;
 const announcement=cardPost(card,'a'.repeat(64));assert.equal(announcement.split('\n').filter(l=>/^`\s?\d+` /.test(l)).length,10);assert.match(announcement,/締切/);assert.match(announcement,/aaaaaaaaaaaaaaaa/);assert.ok(announcement.length<=2000);
 const bets=Array.from({length:8},(_,i)=>({id:'b'+i,raceId:time,type:'win' as const,horse:order.at(-1),amount:5000,odds:80,status:'lost',payout:0,user:String(100000000000000000n+BigInt(i))}));
 const post=resultPost(card,seed,bets,()=> 'full');assert.ok(post.length<=2000);assert.match(post,/1着/);assert.ok(post.includes(seed));
 for(const b of bets)assert.ok(post.includes('<@'+b.user+'>'));assert.equal(post.split('\n').filter(l=>l.startsWith('💸 ')).length,8);
});
