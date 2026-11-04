import {test} from 'node:test';
import assert from 'node:assert/strict';
import {raceScreen} from '../js/racing-view.js';
import {raceCard,raceOdds} from '../js/racing.js';

const jst=(date,time)=>Date.parse(date+'T'+time+':00+09:00');
const render=card=>raceScreen({
 state:{cash:15000,raceBets:[]},live:true,watch:{card,loading:true},
 open:{card,hash:null},openOdds:raceOdds(card),
 draft:{type:'win',horse:1},weeklyLeft:80000,tabs:'',nav:''
});

test('future racing form is compact and native details preserve the old betting action',()=>{
 const card=raceCard(jst('2026-11-04','18:15'),undefined,[{
  horseId:'owned-horse',name:'OWNED HORSE',ownerName:'本人',owner:'member',
  ability:0.4,style:3,record:{races:8,wins:2},recentRanks:[3,1,2,4,1]
 }]);
 const html=render(card);
 assert.match(html,/class="race-intelligence"/);
 assert.match(html,/class="race-event-note"/,'special race rule is visible but collapsible');
 assert.equal((html.match(/class="race-horse-detail"/g)||[]).length,card.horses.length);
 assert.equal((html.match(/data-race-horse="/g)||[]).length,card.horses.length,'original horse select buttons remain');
 assert.match(html,/調教[A-E] · 馬場[◎○△]/);
 assert.match(html,/class="race-horse-detail-body"/);
 assert.match(html,/近5走：3着 → 1着 → 2着 → 4着 → 1着/);
 assert.match(html,/通算 8戦2勝/);
 assert.match(html,/オッズは市場の推定値/);
 assert.match(html,/data-action="race-bet"/);
 assert.match(html,/id="race-amount"/);
 assert.doesNotMatch(html,/<details[^>]*open/i,'new layers start folded');
});
test('past races keep their original table without form disclosures',()=>{
 const html=render(raceCard(jst('2026-11-03','18:15')));
 assert.doesNotMatch(html,/class="race-horse-detail"/);
 assert.doesNotMatch(html,/class="race-intelligence"/);
 assert.match(html,/オッズは胴元の取り分なし/);
});
test('owned names in native summary and form remain HTML-escaped',()=>{
 const card=raceCard(jst('2026-11-05','21:15'),undefined,[{
  horseId:'unsafe',name:'<img src=x onerror=alert(1)>',
  ownerName:'<b>bad</b>',owner:'member',ability:0.4,style:2,
  record:{races:3,wins:1},recentRanks:[1,2,3]
 }]);
 const html=render(card);
 assert.doesNotMatch(html,/<img\b|<b>bad<\/b>/);
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;b&gt;bad/);
});
test('the betting table has three columns, style/condition under the name, short bet types and quick amounts',()=>{
 const card=raceCard(jst('2026-11-04','18:15'));const html=render(card);
 assert.equal((html.match(/<th>/g)||[]).length,3,'馬・単勝・複勝');
 assert.equal((html.match(/class="race-meta"/g)||[]).length,card.horses.length);
 assert.match(html,/data-race-type="win"[^>]*>単勝<small>1着当て<\/small>/);
 assert.match(html,/data-race-type="trifecta"[^>]*>3連単<small>/);
 assert.deepEqual([...html.matchAll(/data-race-amount="(\d+)"/g)].map(m=>Number(m[1])),[100,500,1000,5000,10000]);
});
