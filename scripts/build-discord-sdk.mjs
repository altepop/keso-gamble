import {build}from'esbuild';
import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import{fileURLToPath}from'node:url';
import{resolve,dirname}from'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),destination=resolve(root,'js/vendor/discord-sdk.js');
const result=await build({absWorkingDir:root,entryPoints:['js/discord-sdk-entry.js'],bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,legalComments:'eof',metafile:true,write:false});
const output=result.outputFiles[0].text;
const modules=[...new Set(Object.keys(result.metafile.inputs).filter(p=>p.startsWith('node_modules/')).map(p=>{const parts=p.split('/');return parts[1].startsWith('@')?parts.slice(0,3).join('/'):parts.slice(0,2).join('/');}))];
// The SDK distribution also embeds its runtime dependencies. Include their notices.
for(let i=0;i<modules.length;i++){
 const metadata=JSON.parse(readFileSync(resolve(root,modules[i],'package.json'),'utf8'));
 for(const name of Object.keys(metadata.dependencies??{})){const path='node_modules/'+name;if(!modules.includes(path)&&existsSync(resolve(root,path,'package.json')))modules.push(path);}
}
const licenses=modules.sort().map(path=>{const meta=JSON.parse(readFileSync(resolve(root,path,'package.json'),'utf8'));const file=['LICENSE','LICENSE.md','LICENSE.txt','LICENCE','license','COPYING'].map(n=>resolve(root,path,n)).find(p=>existsSync(p));return `${meta.name} ${meta.version} (${meta.license||'see package'})\n${file?readFileSync(file,'utf8'):'Source: '+JSON.stringify(meta.repository)}\n`;}).join('\n--------------------\n\n').replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n';
if(process.argv.includes('--check')){if(readFileSync(destination,'utf8')!==output||readFileSync(destination+'.LICENSE.txt','utf8')!==licenses)throw Error('SDK bundle differs; run npm run build:discord');}
else{mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,output);writeFileSync(destination+'.LICENSE.txt',licenses);}
console.log('Official Discord SDK bundle '+(process.argv.includes('--check')?'verified':'built')+'.');
