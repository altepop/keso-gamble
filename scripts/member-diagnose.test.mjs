import test from 'node:test';import assert from 'node:assert/strict';
import {diagnose,summary} from './member-diagnose.mjs';
const now=Date.parse('2026-11-05T12:00:00Z');
const tables={
 tracked_players:[{riot_id:'Alpha#JP1',since:now-9e8},{riot_id:'frin#怖すぎ',since:now-86400000}],
 kp_accounts:[{guild:'g',puuid:'p1',user:'100000000000000001',riot:'Alpha#JP1',linked_at:now-9e8},{guild:'g',puuid:'p2',user:'564073526655582229',riot:'FRIN#怖すぎ'.normalize('NFD'),linked_at:now-1000}],
};
const query=async(sql,params)=>{
 if(/FROM tracked_players/.test(sql))return tables.tracked_players;
 if(/FROM kp_accounts/.test(sql))return tables.kp_accounts;
 if(/FROM notifications.*LIMIT 12/s.test(sql))return [{ended_at:now-1000,mode:'skirmish_2v2',outcome:'win',sent:1}];
 if(/FROM notifications.*GROUP BY/s.test(sql))return [{mode:'skirmish_2v2',n:1,afterLink:1,first:now-1000,last:now-1000}];
 if(/FROM kp_events.*GROUP BY/s.test(sql))return [{mode:'skirmish_2v2',n:1,kp:150}];
 if(/FROM notifications/.test(sql))return [{n:0,last:null,unsent:0}];
 if(/FROM kp_events/.test(sql))return [{n:0,last:null,kp:null}];
 if(/monitor_state/.test(sql))return [{key:'api_after',value:String(now+60000)}];
 throw Error('unexpected '+sql);
};
test('finds a link that only matches after Unicode/case normalizing, and never prints raw Riot IDs',async()=>{
 const r=await diagnose({discordId:'564073526655582229',query,now});
 assert.equal(r.linked,true);
 assert.equal(r.accounts[0].tracked,false);
 assert.equal(r.accounts[0].trackedOnlyAfterNormalizing,true);
 const text=summary(r);
 assert.doesNotMatch(text,/frin|Alpha|怖すぎ|p1|p2|564073526655582229/i);
 assert.match(text,/only after Unicode\/case normalizing/);
 assert.match(text,/\| skirmish_2v2 \| 1 \| 1 \| 1 \| 150 \|/);
});
test('reports an unlinked Discord ID and monitored players without a link',async()=>{
 const r=await diagnose({discordId:'999999999999999999',query,now});
 assert.equal(r.linked,false);
 assert.deepEqual(r.trackedUnlinked,[]);
 await assert.rejects(diagnose({discordId:'abc',query,now}));
});
