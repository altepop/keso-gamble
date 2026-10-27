import test from 'node:test';
import assert from 'node:assert/strict';
import{connectDiscordActivity}from'../js/discord-activity-auth.js';
import{createKpClient}from'../js/kp-client.js';
const user='100000000000000001';
test('opening the Activity automatically verifies Discord and adopts the matching wallet without a pasted code',async()=>{
 const calls=[];let proof;const wallet={activityConfig:async()=>({available:true,applicationId:'app'}),activityChallenge:async challenge=>{calls.push('challenge');proof=challenge;return{nonce:'nonce'};},exchangeActivity:async input=>{assert.equal(input.nonce,'nonce');assert.equal(input.code,'sdk-code');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.codeVerifier));assert.equal(Buffer.from(digest).toString('base64url'),proof);calls.push('exchange');return{token:'kp-session',userId:user,accessToken:'ephemeral-discord-token'};},acceptActivitySession:async(token,id)=>{assert.equal(token,'kp-session');assert.equal(id,user);calls.push('adopt');return{cash:900,selfUserId:user};}};
 const sdk={ready:async()=>calls.push('ready'),commands:{authorize:async args=>{assert.equal(args.client_id,'app');assert.deepEqual(args.scope,['identify']);assert.equal(args.prompt,'none');assert.equal(args.code_challenge_method,'S256');assert.equal(args.state,'nonce');calls.push('authorize');return{code:'sdk-code'};},authenticate:async args=>{assert.equal(args.access_token,'ephemeral-discord-token');calls.push('authenticate');return{user:{id:user}};}}};
 const result=await connectDiscordActivity(wallet,{host:'app.discordsays.com',sdkFactory:async()=>sdk});assert.equal(result.kind,'connected');assert.equal(result.state.cash,900);assert.deepEqual(calls,['ready','challenge','authorize','exchange','authenticate','adopt']);
});
test('ordinary browser and missing server configuration do not invoke the SDK',async()=>{
 let calls=0;const options={sdkFactory:async()=>{calls++;throw Error('should not create SDK')}};
 assert.equal((await connectDiscordActivity({}, {...options,host:'altepop.github.io'})).kind,'outside');
 assert.equal((await connectDiscordActivity({activityConfig:async()=>({available:false})},{...options,host:'app.discordsays.com'})).kind,'manual');assert.equal(calls,0);
});
test('a Discord cancellation or identity mismatch cannot adopt a wallet or reveal its state',async()=>{
 let adopted=false;const wallet={activityConfig:async()=>({available:true,applicationId:'app'}),activityChallenge:async()=>({nonce:'nonce'}),exchangeActivity:async()=>({token:'kp',userId:user,accessToken:'discord'}),acceptActivitySession:async()=>{adopted=true;}};
 for(const cancel of[true,false]){const sdk={ready:async()=>{},commands:{authorize:async()=>{if(cancel)throw Error('raw SDK details');return{code:'code'};},authenticate:async()=>({user:{id:'other'}})}};await assert.rejects(connectDiscordActivity(wallet,{host:'app.discordsays.com',sdkFactory:async()=>sdk}),cancel?/接続を完了できません/:/一致しません/);assert.equal(adopted,false);}
});
test('switching Discord users cannot replay a pending charge from a different wallet',async()=>{
 const saved=new Map([['keso-kp-session-v1','old-token'],['keso-kp-pending-v1',JSON.stringify({id:'pending-operation',owner:'old-user',action:'spin',args:{amount:100,type:'red'}})]]);
 const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const client=createKpClient({storage,request:async(url,init)=>{assert.ok(url.endsWith('/state'));assert.equal(init.headers.Authorization,'Bearer new-token');return Response.json({selfUserId:'new-user',cash:0});}});
 await assert.rejects(client.acceptActivitySession('new-token','new-user'),/別の口座/);assert.equal(saved.get('keso-kp-session-v1'),'old-token');assert.equal(client.pending,true);
});
