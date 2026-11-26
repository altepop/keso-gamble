import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';

// Keep the canonical npm scripts unchanged. Run two independent sequential
// lanes on each existing runner; same-port / same-artifact cases stay together.
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const lanes={
  "core": [
    "hoyo-browser-check",
    "browser-check",
    "music-layout-browser-check",
    "casino-browser-check"
  ],
  "extended": [
    "coach-browser-check",
    "mobile-startup-browser-check",
    "trend-browser-check"
  ]
};
function expand(name,seen=[]){
 if(seen.includes(name)||typeof pkg.scripts[name]!=='string')throw Error('invalid browser script '+name);
 return pkg.scripts[name].split(' && ').flatMap(command=>{
  const nested=/^npm run ([\w:-]+)$/.exec(command);
  if(nested)return expand(nested[1],[...seen,name]);
  const test=/^node (scripts\/[\w-]+\.cjs)(?: (webkit|chromium))?$/.exec(command);
  if(!test)throw Error('unexpected browser command '+command);
  return [{script:test[1],args:test[2]?[test[2]]:[],key:command}];
 });
}
const plans=Object.fromEntries(Object.entries(lanes).map(([suite,group])=>{
 const cases=expand('test:browser:'+suite);
 const first=cases.filter(c=>group.some(n=>c.script==='scripts/'+n+'.cjs'));
 const second=cases.filter(c=>!first.includes(c));
 if(!first.length||!second.length)throw Error('empty browser lane '+suite);
 return [suite,[first,second]];
}));
const canonical=expand('test:browser:all').map(c=>c.key).sort();
const actual=Object.values(plans).flat(2).map(c=>c.key).sort();
if(new Set(canonical).size!==canonical.length||JSON.stringify(canonical)!==JSON.stringify(actual))
 throw Error('browser coverage mismatch: every original command must run exactly once');
const suite=process.argv[2];
if(!Object.hasOwn(plans,suite))throw Error('expected core or extended');
console.log('BROWSER_PLAN '+JSON.stringify({suite,total:canonical.length,lanes:plans[suite].map(l=>l.map(c=>c.key))}));
const start=performance.now();
const results=await Promise.all(plans[suite].map(async(cases,lane)=>{
 const failures=[];
 for(const c of cases){
  const t=performance.now();
  console.log('BROWSER_CASE_START '+JSON.stringify({lane:lane+1,case:c.key}));
  const result=await new Promise(resolve=>{
   const child=spawn(process.execPath,[c.script,...c.args],{stdio:'inherit',env:process.env});
   child.once('error',error=>resolve({code:null,error:error.message}));
   child.once('close',(code,signal)=>resolve({code,signal}));
  });
  console.log('BROWSER_CASE_END '+JSON.stringify({lane:lane+1,case:c.key,ms:Math.round(performance.now()-t),...result}));
  if(result.code!==0||result.signal||result.error)failures.push(c.key);
 }
 return failures;
}));
console.log('BROWSER_LANES_DONE '+JSON.stringify({suite,ms:Math.round(performance.now()-start),failures:results.flat()}));
if(results.flat().length)process.exitCode=1;
