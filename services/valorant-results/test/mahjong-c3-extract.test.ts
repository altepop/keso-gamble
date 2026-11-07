import test from 'node:test';
import assert from 'node:assert/strict';
import {c3DiscardCandidates,toC3Tile} from '../src/mahjong-c3-extract.ts';

test('exact East 1 seat-zero fourth discard is anchored to the real action',()=>{
 const actions=[{name:'RecordNewRound',data:{chang:0,ju:0}}];
 for(let turn=1;turn<=4;turn++){
  for(let seat=0;seat<4;seat++)actions.push({name:'RecordDiscardTile',data:{seat,tile:turn===4&&seat===0?'6p':seat===0?'5p':'2m'}});
 }
 const list=c3DiscardCandidates(actions);
 const fourth=list.find(x=>x.seat===0&&x.turn===4);
 assert.deepEqual(fourth,{round:0,seat:0,turn:4,actual:'6p',actionIndex:13});
 assert.equal(list.filter(x=>x.seat===0).length,4);
});

test('red five and honors are translated; unrecognized tiles never become a sentence',()=>{
 assert.equal(toC3Tile('0m'),'5mr');
 assert.equal(toC3Tile('0p'),'5pr');
 assert.equal(toC3Tile('0s'),'5sr');
 assert.equal(toC3Tile('1z'),'E');
 assert.equal(toC3Tile('7z'),'C');
 assert.equal(toC3Tile('5pr'),'5pr');
 assert.equal(toC3Tile('6p'),'6p');
 assert.equal(toC3Tile('6p @everyone'),null);
 assert.equal(toC3Tile('0z'),null);
});

test('call, kan and round-end stop turn labels rather than inventing a wrong 巡目',()=>{
 const start={name:'RecordNewRound',data:{chang:0,ju:0}};
 const d=(tile:string)=>({name:'RecordDiscardTile',data:{seat:0,tile}});
 const after=[start,d('3p'),{name:'RecordChiPengGang',data:{seat:1,type:1}},d('6p')];
 assert.deepEqual(c3DiscardCandidates(after).map(x=>x.actual),['3p']);
 const second=[...after,{name:'RecordNewRound',data:{chang:0,ju:1}},d('0s'),{name:'RecordHule',data:{}},d('7s')];
 assert.deepEqual(c3DiscardCandidates(second).map(x=>[x.round,x.turn,x.actual]),[[0,1,'3p'],[1,1,'5sr']]);
});
