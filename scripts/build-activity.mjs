// One content-derived cache version for the complete browser module graph.
// A change anywhere changes every URL, including transitive imports of shared Worker modules.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=dir=>readdirSync(resolve(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+'/'+e.name):/\.(?:js|css)$/.test(e.name)?[dir+'/'+e.name]:[]).sort();
const imports=/((?:\bfrom\s*|\bimport\s*\()\s*['"])(\.{1,2}\/[^'"?#]+\.js)(?:\?[^'"]*)?(['"])/g;
const unversioned=s=>s.replace(imports,'$1$2$3');
const paths=[...files('js'),...files('css')].sort();
const sources=new Map(paths.map(p=>[p,readFileSync(resolve(root,p),'utf8')]));
const digest=createHash('sha256');
for(const [p,s] of sources)digest.update(p+'\0'+unversioned(s)+'\0');
for(const name of readdirSync(resolve(root,'assets/escalation-ranks')).filter(n=>/\.(svg|png)$/.test(n)).sort())digest.update(name+'\0').update(readFileSync(resolve(root,'assets/escalation-ranks',name)));
const version='web-'+digest.digest('hex').slice(0,16);
let stale=false;
for(const [p,s] of sources){
 const next=s.replace(imports,(_m,before,path,after)=>before+path+'?v='+version+after);
 if(next===s)continue;
 if(process.argv.includes('--check')){console.error('Stale browser dependency versions: '+p);stale=true;}else writeFileSync(resolve(root,p),next);
}
// Music is loaded outside the ES module graph. Derive query versions from exact file bytes
// so Discord's embedded browser cannot reuse an old 8-song player after a music update.
const musicFiles=['music/player.css','music/lyrics.js','music/player.js'];
const musicVersions=new Map(musicFiles.map(path=>{
 const bytes=readFileSync(resolve(root,path));
 const blob=createHash('sha1').update('blob '+bytes.length+String.fromCharCode(0))
  .update(bytes).digest('hex');
 return [path,'music-'+blob.slice(0,12)];
}));
const index=resolve(root,'index.html'),html=readFileSync(index,'utf8');
const next=html.replace(/(<meta name="keso-release" content=")[^"]*("\s*\/>)/,'$1'+version+'$2')
 .replace(/((?:src|href)="\.\/(?:js\/bootstrap\.js|css\/styles\.css))(?:\?[^"]*)?(\")/g,'$1?v='+version+'$2');
const musicNext=next.replace(/((?:src|href)="\.\/(music\/(?:player\.css|lyrics\.js|player\.js)))(?:\?[^"]*)?(")/g,
 (_match,begin,path,end)=>begin+'?v='+musicVersions.get(path)+end);
if(musicNext!==html){if(process.argv.includes('--check')){console.error('Stale browser entry versions: '+relative(root,index));stale=true;}else writeFileSync(index,musicNext);}
if(stale)throw Error('Browser files changed; run npm run build:activity');
console.log('Activity release '+version+(process.argv.includes('--check')?' verified.':' prepared.'));
