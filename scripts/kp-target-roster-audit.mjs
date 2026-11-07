// Read-only production roster verification. Never print tokens, user IDs or all members.
// Intended to verify names specifically requested by the owner after a Worker rollout.
const expected=['名古屋','小林','千葉ゆうや','VDK','藤村','石原'];
const token=process.env.KESO_SMOKE_WALLET_TOKEN??'';
if(!token){console.log('KP_TARGET_ROSTER_AUDIT skipped (no smoke wallet token)');process.exit(0);}
if(!/^[a-f0-9]{48}$/.test(token))throw Error('invalid smoke token');
const base='https://valorant-results.tealeaforest.workers.dev/api/kp/';
const get=async(path)=>{const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json();};
const [state,duels]=await Promise.all([get('state'),get('duels')]);
const s=new Map((state.members??[]).map(x=>[x.id,x.name]));
const d=new Map((duels.members??[]).map(x=>[x.id,x.name]));
const names=expected.map(name=>({name,state:[...s.values()].includes(name),duels:[...d.values()].includes(name)}));
console.log('KP_TARGET_ROSTER_AUDIT '+JSON.stringify({walletRoster:s.size,duelRoster:d.size,names}));
if(names.some(x=>x.state!==x.duels))throw Error('KP roster differs between luxury and duel screens');
if(s.size<=5)console.warn('KP roster still has at most five members; check if additional participants have joined');
if(names.some(x=>!x.state))console.warn('Not all requested display aliases are bound to verified Discord IDs; do not guess identities');
