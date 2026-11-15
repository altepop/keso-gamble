import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VDK_RESCUE_QUESTIONS, createVdkRescueState, chooseVdkRescue, advanceVdkRescue,
  normalizeVdkRescueState, restartVdkRescue, vdkRescuePanel,
  vdkRescueScore, vdkRescueShareText, vdkRescueVerdict,
} from '../js/vdk-rescue.js';

test('all five missions are playable, finish at 100 and preserve best',()=>{
  let state=createVdkRescueState();
  assert.equal(VDK_RESCUE_QUESTIONS.length,5);
  for(const q of VDK_RESCUE_QUESTIONS){
    const best=q.choices.findIndex(c=>c.points===20);
    assert.notEqual(best,-1);
    state=chooseVdkRescue(state,best);
    assert.equal(chooseVdkRescue(state,0).answers.length,state.answers.length,'answer cannot be changed');
    state=advanceVdkRescue(state);
  }
  assert.equal(state.step,5);
  assert.equal(vdkRescueScore(state),100);
  assert.equal(state.best,100);
  assert.match(vdkRescueShareText(state),/救済成功/);
  assert.match(vdkRescueShareText(state),/プラチナ2降格記念/);
  assert.equal(restartVdkRescue(state).best,100);
});
test('cannot advance without answering, skip questions, or inject points',()=>{
  let state=createVdkRescueState();
  assert.deepEqual(advanceVdkRescue(state),state);
  assert.deepEqual(chooseVdkRescue(state,1000),state);
  state=chooseVdkRescue(state,1);
  assert.deepEqual(chooseVdkRescue(state,2),state);
  assert.equal(vdkRescueShareText(state),'');
  state=advanceVdkRescue(state);
  assert.equal(state.step,1);
  assert.deepEqual(normalizeVdkRescueState({step:9000,answers:[99,0],best:999999}),createVdkRescueState());
});
test('renders score and actions safely without changing KP economy',()=>{
  const start=vdkRescuePanel(createVdkRescueState());
  assert.match(start,/プラチナ2降格記念/);
  assert.match(start,/プラチナ2へ降格/);
  assert.match(start,/参加0 KP/);
  assert.match(start,/報酬0 KP/);
  assert.match(start,/data-vdk-choice="0"/);
  assert.doesNotMatch(start,/data-action="(bet|send|transfer|purchase)/);
  const answered=vdkRescuePanel(chooseVdkRescue(createVdkRescueState(),2));
  assert.match(answered,/data-vdk-next/);
  assert.match(answered,/disabled/);
  assert.equal(vdkRescueVerdict(0).heading,'VDK救済本部・緊急延長');
  assert.equal(vdkRescueVerdict(80).heading,'VDK救済成功');
});

test('demotion memorial is a fictional coaching exercise, not a real rank adjustment',()=>{
  const first=VDK_RESCUE_QUESTIONS[0];
  const last=VDK_RESCUE_QUESTIONS.at(-1);
  assert.match(first.title,/プラチナ2/);
  assert.match(last.title,/プラチナ3/);
  assert.match(vdkRescuePanel(createVdkRescueState()),/原因は未検証/);
  assert.match(vdkRescuePanel(createVdkRescueState()),/架空の戦術訓練/);
  assert.doesNotMatch(vdkRescueShareText(createVdkRescueState()),/救済成功/);
});
