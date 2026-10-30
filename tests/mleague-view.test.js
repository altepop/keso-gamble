import test from 'node:test';
import assert from 'node:assert/strict';
import { mleagueScreen, mleaguePreview } from '../js/mleague-view.js';

const fixture=(id,status,extra={})=>({id,date:'2026-10-27',table:1,game:Number(id.slice(-1)),start:Date.parse('2026-10-27T19:00:00+09:00'),teams:['A','B'],status,players:[{no:1,name:'選手A',teamName:'A',odds:52,sitting:null},{no:2,name:'選手B',teamName:'B',odds:31,sitting:null}],...extra});
const state=(extra={})=>({cash:10000,mlBets:[],mleague:{day:'2026-10-27',fixtures:[fixture('g1','result',{result:{names:['選手A','選手B','x','y'],points:[50,10,-20,-40]}}),fixture('g2','open'),fixture('g3','closed')]},...extra});

test('Mリーグ画面：結果・受付中・締切を出し分け、受付中だけ選手を選べる',()=>{
 const html=mleagueScreen({state:state(),live:true,draft:{},tabs:'',nav:''});
 assert.match(html,/1着 選手A　\+50pt/);assert.match(html,/受付中/);assert.match(html,/この試合の予想は締め切りました/);
 assert.equal((html.match(/data-ml-match="g2"/g)??[]).length,2);assert.doesNotMatch(html,/data-ml-match="g3"/);
});
test('Mリーグ画面：選んだら金額→確認（払戻し・購入後の残高）。不正な金額では確認に進まない',()=>{
 const pick={match:'g2',player:'選手A'};
 assert.match(mleagueScreen({state:state(),live:true,draft:{...pick,amount:'500'},tabs:'',nav:''}),/id="ml-amount"/);
 assert.equal(mleaguePreview(state(),{...pick,amount:'500'}),'当たれば 2,600 KP');assert.equal(mleaguePreview(state(),{...pick,amount:'150'}),'金額を入れてください');
 const confirm=mleagueScreen({state:state(),live:true,draft:{...pick,amount:'500',confirm:true},tabs:'',nav:''});
 assert.match(confirm,/購入の確認/);assert.match(confirm,/2,600 KP/);assert.match(confirm,/9,500 KP/);assert.match(confirm,/data-action="ml-buy"/);
 assert.doesNotMatch(mleagueScreen({state:state(),live:true,draft:{...pick,amount:'150',confirm:true},tabs:'',nav:''}),/data-action="ml-buy"/);
});
test('Mリーグ画面：デモや読み込み失敗では買えない。自分の予想は結果待ち・的中を出す',()=>{
 assert.match(mleagueScreen({state:state(),live:false,draft:{},tabs:'',nav:''}),/本番のKP口座をつなぐと使えます/);
 assert.match(mleagueScreen({state:state({mleague:null}),live:true,draft:{},tabs:'',nav:''}),/読み込めませんでした/);
 const mine=mleagueScreen({state:state({mlBets:[{match:'g2',player:'選手A',amount:500,odds:52,status:'pending',payout:0},{match:'g1',player:'選手B',amount:1000,odds:31,status:'won',payout:3100}]}),live:true,draft:{},tabs:'',nav:''});
 assert.match(mine,/結果待ち · 当たれば 2,600 KP/);assert.match(mine,/的中 \+2,100 KP（払戻し 3,100 KP）/);
});

test('second-game cards show the lineup-based deadline and explain the rule before confirmation',()=>{
 const confirmed=Date.parse('2026-10-27T21:00:00+09:00'),open=fixture('game2','open',{lineupConfirmedAt:confirmed,closeAt:confirmed+15*60000});
 const base={cash:10000,mleague:{day:'2026-10-27',fixtures:[open]},mlBets:[]};
 const html=mleagueScreen({state:base,live:true,draft:{},tabs:'',nav:''});assert.match(html,/予想締切 21:15/);assert.match(html,/検知から15分/);
 const waiting=mleagueScreen({state:{...base,mleague:{...base.mleague,fixtures:[fixture('game2','open')]}},live:true,draft:{},tabs:'',nav:''});assert.match(waiting,/選手確定の検知から15分後/);
});
