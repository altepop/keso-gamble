import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTeamMember, projectTeamRoster} from '../coach/team-boundary.js';
const member = {ownerId:'owner',teamId:'team',guildId:'guild',displayName:'Player',status:'取り組み中',puuid:'secret',matchId:'match',memo:'private',practiceRecord:'private'};
const consent = {ownerId:'owner',teamId:'team',guildId:'guild',shareTeamStatus:true};
test('team status is fail-closed until explicit matching consent',()=>{
  for(const c of [undefined,{}, {...consent,shareTeamStatus:false},{...consent,ownerId:'other'},{...consent,teamId:'other'},{...consent,guildId:'other'}]) assert.equal(projectTeamMember(member,c),null);
  for(const key of ['ownerId','teamId','guildId']) {
    assert.equal(projectTeamMember({...member,[key]:''},{...consent,[key]:''}),null);
    assert.equal(projectTeamMember({...member,[key]:null},{...consent,[key]:null}),null);
  }
});
test('only allowlisted team fields survive, without personal records or identifiers',()=>{
  assert.deepEqual(projectTeamMember(member,consent),{displayName:'Player',status:'取り組み中'});
  assert.equal(projectTeamMember({...member,status:'unexpected'},consent).status,'まだ分かりません');
});
test('same Discord owner is counted once across Riot accounts',()=>{
  assert.deepEqual(projectTeamRoster([member,{...member,puuid:'other',displayName:'Second'}],[consent]),[{displayName:'Player',status:'取り組み中'}]);
  assert.deepEqual(projectTeamRoster([member],[]),[]);
});
test('consent matching is scoped to owner, team and guild, not first owner match',()=>{
  const wrong = {...consent,teamId:'other'};
  assert.deepEqual(projectTeamRoster([member],[wrong,consent]),[{displayName:'Player',status:'取り組み中'}]);
  assert.deepEqual(projectTeamRoster([member],[wrong]),[]);
});
test('deduplication is scoped per team and guild',()=>{
  const second = {...member,teamId:'team2',displayName:'Other team'};
  assert.deepEqual(projectTeamRoster([member,second],[consent,{...consent,teamId:'team2'}]),
    [{displayName:'Player',status:'取り組み中'},{displayName:'Other team',status:'取り組み中'}]);
});

test('malformed collection input fails closed without throwing',()=>{
  for (const invalid of [null, undefined, {}, 'text', 1]) {
    assert.deepEqual(projectTeamRoster(invalid,[consent]),[]);
    assert.deepEqual(projectTeamRoster([member],invalid),[]);
  }
});

test('duplicate or contradictory scoped consent fails closed',()=>{
  assert.deepEqual(projectTeamRoster([member],[consent,consent]),[]);
  assert.deepEqual(projectTeamRoster([member],[consent,{...consent,shareTeamStatus:false}]),[]);
  assert.deepEqual(projectTeamRoster([member],[{...consent,shareTeamStatus:false},consent]),[]);
  assert.deepEqual(projectTeamRoster([member],[{...consent,shareTeamStatus:'true'}]),[]);
  assert.deepEqual(projectTeamRoster([member],[consent,{...consent,teamId:'other'}]),[{displayName:'Player',status:'取り組み中'}]);
});
