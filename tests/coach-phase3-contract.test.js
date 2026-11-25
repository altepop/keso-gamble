import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Phase 3-A is a contract only; test the privacy and deployment gates
// so a documentation-only change receives the full PR CI pipeline.
const contract=readFileSync(new URL('../docs/coach-phase3a-contract.md',import.meta.url),'utf8');
test('phase 3-A contract requires opt-in, privacy and CAS before team sharing',()=>{
 for(const required of [
  '新しいチーム参加、共有、通知はすべて初期OFF',
  '個人実施記録、メモ、個人目標本文、PUUID、match ID',
  'versionのCAS','他チームの存在を404で秘匿',
  '同じDiscord所有者の複数Riotアカウント',
  'party_id欠損は不明','event_idとversionで重複排除',
  'D1マイグレーションは加算的',
  'HenrikDev以外の新規試合取得を導入しない',
 ])assert.ok(contract.includes(required),'Missing contract: '+required);
});
test('phase 3-A contract includes meaningful verification gates for next phases',()=>{
 for(const required of [
  '同時更新','同意撤回','別guild','不明勝敗','試合重複',
  '位置情報欠損','退会後通知','320/375/1440px','Chromium/WebKit',
  '3-B本人同意・所属・CAS → 3-Cロスター指標',
 ])assert.ok(contract.includes(required),'Missing acceptance: '+required);
 assert.match(contract,/実ユーザー2名の操作試験は人手待ち/);
});
