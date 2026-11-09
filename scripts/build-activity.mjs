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
const version='web-'+digest.digest('hex').slice(0,16);
let stale=false;
for(const [p,s] of sources){
 const next=s.replace(imports,(_m,before,path,after)=>before+path+'?v='+version+after);
 if(next===s)continue;
 if(process.argv.includes('--check')){console.error('Stale browser dependency versions: '+p);stale=true;}else writeFileSync(resolve(root,p),next);
}
const index=resolve(root,'index.html'),html=readFileSync(index,'utf8');
const next=html.replace(/(<meta name="keso-release" content=")[^"]*("\s*\/>)/,'$1'+version+'$2')
 .replace(/((?:src|href)="\.\/(?:js\/bootstrap\.js|css\/styles\.css))(?:\?[^"]*)?(\")/g,'$1?v='+version+'$2');
if(next!==html){if(process.argv.includes('--check')){console.error('Stale browser entry versions: '+relative(root,index));stale=true;}else writeFileSync(index,next);}
if(stale)throw Error('Browser files changed; run npm run build:activity');
console.log('Activity release '+version+(process.argv.includes('--check')?' verified.':' prepared.'));
