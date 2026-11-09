import test from 'node:test';
import assert from 'node:assert/strict';
import {smoke} from './post-deploy-smoke.mjs';
const token='a'.repeat(48);
function mock(entries){
 return async(input,init)=>{
  const url=new URL(input),path=url.pathname;
  if(init?.headers?.Authorization==='Bearer '+token&&path==='/api/kp/state')return Response.json(entries.wallet??{cash:123});
  if(path==='/keso-gamble/')return new Response('<meta name="keso-release" content="x"><script src="./js/bootstrap.js"></script>');
  if(path==='/keso-gamble/js/bootstrap.js')return new Response('console.log("bootstrap loaded")');
  if(path==='/api/kp/status')return Response.json(entries.status??{enabled:true,currency:'KP',registered:4});
  return new Response('missing',{status:404});
 };
}
test('checks public Activity/Worker plus authenticated balance',async()=>{
 assert.deepEqual(await smoke({fetchImpl:mock({}),walletToken:token}),{activity:'ok',bootstrap:'ok',status:'ok',wallet:'verified'});
});
test('without secret, public smoke is useful but does not claim wallet verification',async()=>{
 assert.equal((await smoke({fetchImpl:mock({})})).wallet,'not-configured');
});
test('rejects missing KP balance and disabled backend',async()=>{
 await assert.rejects(smoke({fetchImpl:mock({wallet:{foo:1}}),walletToken:token}),/KP balance/);
 await assert.rejects(smoke({fetchImpl:mock({status:{enabled:false,currency:'KP',registered:0}})}),/not ready/);
});
