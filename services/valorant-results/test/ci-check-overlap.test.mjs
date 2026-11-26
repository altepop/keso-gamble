import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('CI overlap runs both tasks together and fails closed for either failure',()=>{
 for(const [worker,prep] of [[0,0],[7,0],[0,9],[7,9]]){
  const root=mkdtempSync(join(tmpdir(),'ci-overlap-'));
  try{
   for(const d of ['scripts/race-video','services/valorant-results','bin'])mkdirSync(join(root,d),{recursive:true});
   copyFileSync(new URL('../../../scripts/ci-check-overlap.sh',import.meta.url),join(root,'scripts/ci-check-overlap.sh'));
   const wait='for i in $(seq 1 100); do test -f "$MARKER" && break; sleep .02; done; test -f "$MARKER" || exit 90';
   writeFileSync(join(root,'scripts/race-video/prepare.sh'),'touch "$FIXTURE/prep-start"\nprintf "VIDEO_PYTHON=fixture-python\\n" >> "$GITHUB_ENV"\nMARKER="$FIXTURE/worker-start"; '+wait+'\nexit "$PREP_EXIT"\n');
   writeFileSync(join(root,'bin/npm'),'#!/usr/bin/env bash\nset -eu\ntest "$1 $2" = "run check"\ntouch "$FIXTURE/worker-start"\nMARKER="$FIXTURE/prep-start"; '+wait+'\nexit "$WORKER_EXIT"\n',{mode:0o755});
   writeFileSync(join(root,'global.env'),'UNRELATED=preserved\n');
   const out=spawnSync('bash',['scripts/ci-check-overlap.sh'],{cwd:root,env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,FIXTURE:root,RUNNER_TEMP:root,GITHUB_ENV:join(root,'global.env'),WORKER_EXIT:String(worker),PREP_EXIT:String(prep)},encoding:'utf8',timeout:10000});
   assert.match(out.stdout,new RegExp('check='+worker+' prep='+prep));
   assert.equal(out.status===0,worker===0&&prep===0);
   assert.equal(readFileSync(join(root,'global.env'),'utf8'),'UNRELATED=preserved\n');
   assert.equal(readFileSync(join(root,'keso-video-prepare.env'),'utf8'),'VIDEO_PYTHON=fixture-python\n');
  }finally{rmSync(root,{recursive:true,force:true});}
 }
});
