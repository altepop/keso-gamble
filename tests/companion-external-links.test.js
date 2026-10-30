import test from 'node:test';
import assert from 'node:assert/strict';
import {openCompanionGame} from '../js/discord-activity-auth.js';

const discordHost='100000000000000000.discordsays.com';
const destinations={
 loop:'https://keso-loop.tealeaforest.workers.dev/',
 quiz:'https://valo-quiz.onrender.com/',
};

test('KESO LOOP and VCT QUIZ open using Discord native external-link command',async()=>{
 const calls=[];
 const sdk={
  ready:async()=>{calls.push(['ready']);},
  commands:{openExternalLink:async args=>{calls.push(['openExternalLink',args]);return{opened:true};}}
 };
 for(const game of Object.keys(destinations)){
  await openCompanionGame(game,{
   host:discordHost,
   sdkFactory:async id=>{assert.equal(id,'100000000000000000');return sdk;},
   open:()=>{throw Error('window.open must not run inside Discord');}
  });
 }
 assert.deepEqual(calls,[
  ['ready'],['openExternalLink',{url:destinations.loop}],
  ['ready'],['openExternalLink',{url:destinations.quiz}],
 ]);
});

test('opening companion games in ordinary browser retains safe external-tab behavior',async()=>{
 const tabs=[];
 for(const game of Object.keys(destinations)){
  const tab={opener:'old-opener'};
  await openCompanionGame(game,{
   host:'altepop.github.io',
   open:(url,target)=>{tabs.push({url,target});return tab;},
   sdkFactory:async()=>{throw Error('SDK must not be loaded outside Discord');}
  });
  assert.equal(tab.opener,null);
 }
 assert.deepEqual(tabs,[
  {url:destinations.loop,target:'_blank'},
  {url:destinations.quiz,target:'_blank'},
 ]);
});

test('unknown destinations cannot be opened by an altered button or URL',async()=>{
 let calls=0;
 await assert.rejects(openCompanionGame('https://evil.example',{host:discordHost,sdkFactory:async()=>{calls++;}}),/リンク先を確認/);
 await assert.rejects(openCompanionGame('__proto__',{host:discordHost,sdkFactory:async()=>{calls++;}}),/リンク先を確認|openExternalLink/);
 assert.equal(calls,0);
});

test('Discord cancellation and unsupported origin provide errors without navigating the Activity',async()=>{
 const sdk={ready:async()=>{},commands:{openExternalLink:async()=>({opened:false})}};
 await assert.rejects(openCompanionGame('loop',{host:discordHost,sdkFactory:async()=>sdk}),/開けませんでした/);
 await assert.rejects(openCompanionGame('loop',{host:'bad.discordsays.com',sdkFactory:async()=>sdk}),/Discordの接続/);
 await assert.rejects(openCompanionGame('loop',{host:'example.org',open:()=>null}),/新しいウィンドウ/);
});
