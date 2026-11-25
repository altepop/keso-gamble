import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
import {spectatorView} from '../src/duel-spectator-view.ts';
const base:SpectatorSource={id:'match',guild:'guild',game:'hitblow',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:4,updated_at:12,board:JSON.stringify({history:[{guess:'1234',hit:1,blow:2}],privateA:'HIDDEN'})};
test('P10.2 renders only public information and escapes hostile strings',()=>{
 const snapshot=spectatorPublicSnapshot(base);
 assert.match(spectatorView(snapshot),/1234/);
 assert.doesNotMatch(spectatorView(snapshot),/HIDDEN/);
 const poisoned={...snapshot,publicState:{history:[{guess:'<script>alert(1)</script>',hit:0,blow:0}]}};
 const rendered=spectatorView(poisoned);
 assert.doesNotMatch(rendered,/<script>/);
 assert.match(rendered,/&lt;script&gt;/);
});
test('P10.2 no snapshot fails closed; poker remains concealed',()=>{
 assert.match(spectatorView(null),/公開可能な確定試合情報はありません/);
 assert.doesNotMatch(spectatorView(spectatorPublicSnapshot({...base,game:'poker'})),/1234|HIDDEN/);
});
test('P10.2 board and dice use only approved projections',()=>{
 assert.match(spectatorView(spectatorPublicSnapshot({...base,game:'othello',board:'....BW..'})),/\.\.\.\.BW\.\./);
 assert.match(spectatorView(spectatorPublicSnapshot({...base,game:'bluffdice',board:JSON.stringify({bid:{count:2,face:6},secret:'NO'})})),/2 個以上/);
});
