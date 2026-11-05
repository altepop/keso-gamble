import test from 'node:test';import assert from 'node:assert/strict';
import {audit} from './relic-abuse-audit.mjs';
test('summarises native and verified bonuses, flags buy-then-sell stock bonuses, masks IDs',async()=>{
 const now=Date.parse('2026-11-05T12:00:00Z');
 const query=async sql=>{
  if(sql.includes('FROM kp_operations'))return [
   {user:'123456789012345678',cat:'stock',bonus:9000,at:now-1000,symbol:'keso',side:'sell',gross:200000,fee:2000},
   {user:'123456789012345678',cat:'casino',bonus:300,at:now-2000}];
  if(sql.includes('FROM stock_trades'))return [{user:'123456789012345678',symbol:'keso',quantity:1000,price:1500,at:now-60000}];
  if(sql.includes('GROUP BY mode'))return [{mode:'match',count:3,bonus:600,max:300}];
  if(sql.includes('GROUP BY user,mode'))return [{user:'123456789012345678',mode:'match',count:3,bonus:600}];
  if(sql.includes('FROM kp_state'))return [{user:'123456789012345678',earned:9300,count:2}];
 };
 const text=await audit(query,now-14*86400000);
 assert.match(text,/\| stock \| 1 \| 9,000 \| 9,000 \|/);
 assert.match(text,/1 sales, 9,000 KP of relic bonus/);
 assert.match(text,/\| …5678 \| 1 \| 9,000 \| 2,000 \| 1,500,000 \|/);
 assert.doesNotMatch(text,/123456789012345678/);
});
