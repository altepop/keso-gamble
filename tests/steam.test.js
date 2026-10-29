import test from 'node:test';
import assert from 'node:assert/strict';
import {createKpClient} from '../js/kp-client.js';
import {openSteamLogin} from '../js/discord-activity-auth.js';
import {steamPanel} from '../js/steam-view.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('Steam linking keeps only a short-lived challenge in tab storage and recovers it after reload',async()=>{
 const persistent=storage(),tab=storage();persistent.setItem('keso-kp-session-v1','wallet-secret');const calls=[],link={state:'abc',url:'https://steamcommunity.com/openid/login?state=abc'};
 const request=async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer wallet-secret');calls.push([url,init.body]);return Response.json(url.endsWith('/link')?link:url.endsWith('/pending')?{verified:true,steamId:'76561198000000001'}:{});};
 const client=createKpClient({storage:persistent,temporaryStorage:tab,request});await client.startSteam();assert(!JSON.stringify(client.steamLinkRequest).includes('wallet-secret'));assert.equal(persistent.getItem('keso-steam-link-v1'),null);
 const reloaded=createKpClient({storage:persistent,temporaryStorage:tab,request});assert.deepEqual(reloaded.steamLinkRequest,link);assert.equal((await reloaded.steamPending()).verified,true);await reloaded.confirmSteam();assert.equal(reloaded.steamLinkRequest,null);assert.equal(tab.getItem('keso-steam-link-v1'),null);assert.equal(client.pending,false);
});
test('Steam official login opens via the Discord SDK without navigating the Activity or sending wallet secrets',async()=>{
 const urls=[],url='https://steamcommunity.com/openid/login?openid.mode=checkid_setup';const sdk={ready:async()=>{},commands:{openExternalLink:async input=>{urls.push(input.url);return {opened:true};}}};
 await openSteamLogin(url,{host:'1556902772362969088.discordsays.com',sdkFactory:async()=>sdk});assert.deepEqual(urls,[url]);
 for(const url of ['https://evil.example/openid/login','https://steamcommunity.com.evil.example/openid/login','javascript:alert(1)','https://steamcommunity.com/profiles/123'])await assert.rejects(openSteamLogin(url,{host:'1556902772362969088.discordsays.com',sdkFactory:async()=>sdk}));
 await assert.rejects(openSteamLogin(url,{host:'1556902772362969088.discordsays.com',sdkFactory:async()=>({...sdk,commands:{openExternalLink:async()=>({opened:false})}})}),/開けません/);
});
test('Steam panel escapes provider/game errors and clearly distinguishes no credit, inactive configuration and approval',()=>{
 const status={available:true,enabled:false,account:{steamId:'76561198000000001',active:true},apps:[{id:123,title:'<img src=x onerror=alert(1)>'}],games:[]};
 const html=steamPanel({status,error:'<script>x</script>',pending:{verified:true,steamId:'76561198000000001'}});
 assert(!html.includes('<img'));assert(!html.includes('<script>'));assert.match(html,/10%超 100 KP/);assert.match(html,/現在は入金されません/);assert.match(html,/data-action="steam-confirm"/);assert(!steamPanel({status:{...status,available:false}}).includes('data-action="steam-link"'));
});
test('a browser storage cleanup failure cannot block KP logout when Steam was never used',async()=>{
 const saved=storage();saved.setItem('keso-kp-session-v1','fixture');saved.removeItem=()=>{throw Error('storage revoked');};
 const client=createKpClient({storage:saved,request:async()=>Response.json({disconnected:true})});await client.disconnect();assert.equal(client.connected,false);
});
test('owned-game buttons are enabled only when Steam confirms at least 120 minutes',()=>{
 const status={available:true,enabled:false,account:{steamId:'76561198000000001',active:true},apps:[],games:[],minPlaytimeMinutes:120};
 const html=steamPanel({status,library:[{id:1,title:'Below',playtimeMinutes:119},{id:2,title:'Eligible',playtimeMinutes:120},{id:3,title:'Unknown',playtimeMinutes:null},{id:4,title:'Forged',playtimeMinutes:'120'}]});
 assert.match(html,/累計2時間（120分）以上/);assert.match(html,/あと1分/);
 for(const id of [1,3,4])assert.match(html,new RegExp('data-app="'+id+'"[^>]*disabled'));
 assert.doesNotMatch(html,/data-app="2"[^>]*disabled/);
});
