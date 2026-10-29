// Investigation for #138: run the same mobile Activity handshake on each pre-change frontend.
const {execFileSync}=require('node:child_process');
const revisions=['0bbf0af','e84a82b','5932334','955227f','6f64df8','3030900','fc548dc','f099165'];
let failed=false;
for(const revision of revisions){
 console.log('Mobile startup baseline: '+revision);
 try{execFileSync(process.execPath,['scripts/discord-auth-browser-check.cjs','guild-touch'],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_BROWSER:'webkit',KESO_TEST_REV:revision}});}catch{failed=true;}
}
if(failed)process.exitCode=1;
