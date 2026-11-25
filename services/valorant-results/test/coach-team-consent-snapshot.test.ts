import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompleteCoachConsentSnapshot} from '../src/coach-team-consent-snapshot.ts';
const guild='123456789012345678';
const row=(subject_id:string)=>({
 subject_id,owner_user:'234567890123456789',joined:1,share_status:0,version:2,
 pref_subject:subject_id,pref_owner:'234567890123456789',
 pref_enabled:1,pref_consent_version:2
});
const database=(rows:unknown[])=>({prepare(sql:string){
 assert.match(sql,/LEFT JOIN coach_team_notice_preferences/);
 assert.match(sql,/c\.guild=\?/);
 return {bind(g:string){assert.equal(g,guild);return {async all(){return {results:rows};}}}};
}} as unknown as D1Database);
test('E2 fresh roster read requires every server-trusted subject and effective consent',async()=>{
 assert.deepEqual(await readCompleteCoachConsentSnapshot(database([row('member-1')]),guild,['member-1']),[
  {subjectId:'member-1',joined:true,enabled:true,shareStatus:false,
   consentVersion:2,preferenceConsentVersion:2}
 ]);
 const second={...row('member-2'),owner_user:'345678901234567890',pref_owner:'345678901234567890'};
 assert.equal((await readCompleteCoachConsentSnapshot(database([row('member-1'),second]),guild,['member-1','member-2']))?.length,2);
 for(const rows of [
  [],[row('member-2')],[row('member-1'),second],
  [{...row('member-1'),joined:0}],
  [{...row('member-1'),pref_enabled:0}],
  [{...row('member-1'),pref_consent_version:1}],
  [{...row('member-1'),pref_subject:null}],
  [{...row('member-1'),pref_owner:null}]
 ])assert.equal(await readCompleteCoachConsentSnapshot(database(rows),guild,['member-1']),null);
 assert.equal(await readCompleteCoachConsentSnapshot(database([row('member-1')]),guild,['member-1','member-1']),null);
});
