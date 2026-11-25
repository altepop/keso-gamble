import test from 'node:test';import assert from 'node:assert/strict';
import {selfFixture} from './coach-self.fixture.ts';import {COACH_PERSONS,resolveCoachIdentity,publicCoachIdentity,syncCoachProfiles} from '../src/coach-identity.ts';
test('all five people resolve from immutable KP ownership; Kobe owns two verified accounts and sync is idempotent',async()=>{const f=await selfFixture();try{
 for(const [i,p] of COACH_PERSONS.entries()){const identity=await resolveCoachIdentity(f.db,f.mapping,f.mapping.accounts[i].discordUserId);assert.equal(identity.status,'linked');if(identity.status==='linked'){assert.equal(identity.person,p.label);assert.equal(identity.accounts.length,i===0?2:1);assert.equal(identity.pendingAccounts,0);const wire=publicCoachIdentity(identity);assert.equal(wire.visibility,'private');assert.doesNotMatch(JSON.stringify(wire),/private-puuid|10000000000000010/);}}
 const before=f.writes();assert.deepEqual(await syncCoachProfiles(f.db,f.mapping),{added:0,conflicts:0,pending:0});assert.equal(f.writes(),before);
 assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_profiles').get() as any).n,5);
 }finally{f.close();}});
test('unregistered and conflicting mappings never default to VDK or overwrite ownership',async()=>{const f=await selfFixture();try{
 assert.equal((await resolveCoachIdentity(f.db,f.mapping,'100000000000000199')).status,'unregistered');
 const bad={...f.mapping,accounts:f.mapping.accounts.map((a,i)=>i===0?{...a,riotId:'Dolly#SDGs'}:a)};
 assert.equal((await resolveCoachIdentity(f.db,bad,f.mapping.accounts[0].discordUserId)).status,'conflict');
 assert.throws(()=>f.sql.prepare('UPDATE coach_profiles SET owner_user=? WHERE owner_user=?').run('other',f.mapping.accounts[0].discordUserId),/owner cannot change/);
 assert.throws(()=>f.sql.exec("UPDATE coach_profile_accounts SET puuid='stolen'"),/account cannot change/);
 }finally{f.close();}});
test('renamed Riot ID never rebinds a known secondary PUUID; missing secondary is explicitly pending',async()=>{const f=await selfFixture();try{
 f.sql.prepare('UPDATE coach_member_sources SET puuid=? WHERE riot_id=?').run('replacement-puuid','Aquatopia#toppy');
 assert.equal((await syncCoachProfiles(f.db,f.mapping)).conflicts,1);
 const stable=await resolveCoachIdentity(f.db,f.mapping,f.mapping.accounts[0].discordUserId);assert.equal(stable.status,'linked');if(stable.status==='linked')assert.ok(stable.accounts.some(a=>a.puuid==='private-puuid-0-1'));
 f.sql.prepare('DELETE FROM coach_profile_accounts WHERE account_key=?').run('Aquatopia#toppy');
 const partial=await resolveCoachIdentity(f.db,f.mapping,f.mapping.accounts[0].discordUserId);assert.equal(partial.status,'linked');if(partial.status==='linked')assert.equal(partial.pendingAccounts,1);
 }finally{f.close();}});
test('secondary linked to another KP owner makes the profile fail closed',async()=>{const f=await selfFixture();try{
 f.sql.exec("INSERT INTO kp_accounts(guild,puuid,user,riot,linked_at) VALUES('100000000000000100','private-puuid-0-1','100000000000000199','Aquatopia#toppy',0)");
 assert.equal((await resolveCoachIdentity(f.db,f.mapping,f.mapping.accounts[0].discordUserId)).status,'conflict');
 }finally{f.close();}});

test('concurrent provisioning never duplicates people or orphans accounts',async()=>{const f=await selfFixture();try{f.sql.exec('DELETE FROM coach_profile_accounts; DELETE FROM coach_profiles');await Promise.all([syncCoachProfiles(f.db,f.mapping),syncCoachProfiles(f.db,f.mapping)]);assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_profiles').get() as any).n,5);assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_profile_accounts').get() as any).n,6);assert.equal((await resolveCoachIdentity(f.db,f.mapping,f.mapping.accounts[0].discordUserId)).status,'linked');}finally{f.close();}});

test('a renamed primary Riot ID keeps the person identified by its verified PUUID, including initial provisioning',async()=>{const f=await selfFixture();try{
 const changed={...f.mapping,accounts:f.mapping.accounts.map((a,i)=>i===0?{...a,riotId:'Renamed#JP'}:a)};f.sql.prepare('UPDATE kp_accounts SET riot=? WHERE user=?').run('Renamed#JP',changed.accounts[0].discordUserId);
 const own=await resolveCoachIdentity(f.db,changed,changed.accounts[0].discordUserId);assert.equal(own.status,'linked');if(own.status==='linked')assert.equal(own.person,'神戸');
 f.sql.exec('DELETE FROM coach_profile_accounts; DELETE FROM coach_profiles');await syncCoachProfiles(f.db,changed);assert.equal((await resolveCoachIdentity(f.db,changed,changed.accounts[0].discordUserId)).status,'linked');
 }finally{f.close();}});
