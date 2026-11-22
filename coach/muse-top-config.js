/* Source-neutral data contract for the 2026-11-22 Muse top prototype.
   No tactic, score, rank or source link is fabricated here. */
(function(root){
'use strict';
const MAPS=Object.freeze(['Haven','Lotus','Bind','Sunset','Abyss','Corrode','Summit']);
const norm=s=>String(s??'').trim();
const canonical=s=>MAPS.find(m=>m.toLowerCase()===norm(s).toLowerCase())??null;
const safeLink=s=>{if(typeof s!=='string')return null;try{const u=new URL(s);return u.protocol==='https:'&&u.username===''&&u.password===''?u.href:null;}catch{return null;}};
const unique=items=>[...new Set((Array.isArray(items)?items:[]).map(norm).filter(Boolean))];
const offset=(date)=>{const v=Date.parse(String(date).slice(0,10)+'T00:00:00Z');return Number.isFinite(v)?Math.floor(v/86400000):0;};
function validatePreset(map,entry){
 const name=canonical(map);
 if(!name||!entry||typeof entry!=='object'||Array.isArray(entry))return null;
 const warm=entry.warmup&&typeof entry.warmup==='object'?entry.warmup:null;
 const study=entry.study&&typeof entry.study==='object'?entry.study:null;
 const links=Array.isArray(study?.sources)?study.sources.filter(v=>v&&v.verified===true&&safeLink(v.url)).map(v=>({title:norm(v.title)||'情報源',url:safeLink(v.url)})):[];
 return Object.freeze({map:name,
  warmup:warm&&norm(warm.title)?{title:norm(warm.title),reason:norm(warm.reason)||'まだ分かりません',steps:unique(warm.steps),durationMinutes:Number.isInteger(warm.durationMinutes)&&warm.durationMinutes>0?warm.durationMinutes:null}:null,
  study:study&&norm(study.theme)?{theme:norm(study.theme),reason:norm(study.reason)||'まだ分かりません',points:unique(study.points),sources:links,sourceStatus:links.length?'verified':'unconfigured'}:null});
}
function chooseToday({date, maps=MAPS, agents=[], previouslyShown=[], presets={}}={}){
 const pool=unique(maps).map(canonical).filter(Boolean);
 const allMaps=MAPS.filter(m=>pool.includes(m));
 const played=new Set(unique(previouslyShown).map(canonical).filter(Boolean));
 const candidates=allMaps.filter(m=>!played.has(m));
 const cycle=candidates.length?candidates:allMaps;
 const map=cycle.length?cycle[((offset(date)%cycle.length)+cycle.length)%cycle.length]:null;
 const agentPool=unique(agents);
 const agent=agentPool.length?agentPool[((offset(date)%agentPool.length)+agentPool.length)%agentPool.length]:null;
 const preset=map?validatePreset(map,presets[map]):null;
 return {map,agent,coveredMapCount:allMaps.filter(m=>played.has(m)).length,coverageTarget:allMaps.length,
  warmup:preset?.warmup??null,study:preset?.study??null,
  warmupStatus:preset?.warmup?'configured':'unconfigured',
  studyStatus:preset?.study?'configured':'unconfigured',
  studySourceStatus:preset?.study?.sourceStatus??'unconfigured'};
}
root.KesoCoachMuseTop=Object.freeze({MAPS,canonical,validatePreset,chooseToday});
})(typeof globalThis==='object'?globalThis:this);
