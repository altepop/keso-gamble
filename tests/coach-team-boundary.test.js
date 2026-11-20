import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTeamMember, projectTeamRoster} from '../coach/team-boundary.js';
const member = {ownerId:'owner',teamId:'team',guildId:'guild',displayName:'Player',status:'取り組み中',puuid:'secret',matchId:'match',memo:'private',practiceRecord:'private'};
const consent = {ownerId:'owner',teamId:'team',guildId:'guild',shareTeamStatus:true};
test('team status is fail-closed until explicit matching consent',()=>{
  for(const c of [undefined,{}, {...consent,shareTeamStatus:false},{...consent,ownerId:'other'},{...consent,teamId:'other'},{...consent,guildId:'other'}]) assert.equal(projectTeamMember(member,c),null);
});
test('only allowlisted team fields survive, without personal records or identifiers',()=>{
  assert.deepEqual(projectTeamMember(member,consent),{displayName:'Player',status:'取り組み中'});
  assert.equal(projectTeamMember({...member,status:'unexpected'},consent).status,'まだ分かりません');
});
test('same Discord owner is counted once across Riot accounts',()=>{
  assert.deepEqual(projectTeamRoster([member,{...member,puuid:'other',displayName:'Second'}],[consent]),[{displayName:'Player',status:'取り組み中'}]);
  assert.deepEqual(projectTeamRoster([member],[]),[]);
});
