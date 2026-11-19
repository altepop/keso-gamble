// Side-by-side evidence uses mocked member data; never a production session.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
module.exports=async function compare({browser,page,root,output}){
 fs.mkdirSync(output,{recursive:true});
 const assets=['chamber-cut.png','clove-cut.png','jett-cut.png','sova-cut.png','abyss-splash.png','summit-splash.png','range-splash.png'];
 for(const name of assets)assert.ok(fs.existsSync(path.join(root,'assets',name)),'Missing original prototype artwork: '+name);
 const sourceCtx=await browser.newContext();const source=await sourceCtx.newPage();
 await source.route('**/docs/design/assets/**',route=>route.fulfill({path:path.join(root,'assets',path.basename(new URL(route.request().url()).pathname)),contentType:'image/png'}));
 const signatures=async p=>p.evaluate(()=>{
  const rules={'.wrap':['max-width','padding-left','padding-right'],'.tophero':['background-color','border-bottom-width','border-bottom-color'],'.tophero .chamber':['height','right','bottom','filter'],'.tophero-inner':['padding','min-height'],'.playerline .name':['font-family','font-size','font-weight','line-height'],'.pdca':['margin-top','padding','border-left-width','clip-path'],'.talk':['background-color','padding','clip-path'],'.talk p':['font-family','font-size','line-height'],'.drill':['border','margin-top','clip-path'],'.drill-head':['padding'],'.block':['padding','border-top','margin-top'],'.dsteps li':['font-size','padding-left','line-height'],'.mapcard':['background-color','clip-path'],'.remember':['background-color','padding','clip-path']};
  return Object.fromEntries(Object.entries(rules).map(([selector,properties])=>{const style=getComputedStyle(document.querySelector(selector));return [selector,Object.fromEntries(properties.map(p=>[p,style.getPropertyValue(p)]))];}));
 });
 const summary=[];
 const accepted=await page.locator('#acceptBtn').getAttribute('aria-pressed');
 if(accepted==='true')await page.locator('#acceptBtn').click();
 // Collapse operational panels; the mock user has explicitly selected 神戸.
 const folds=await page.locator('details').evaluateAll(nodes=>nodes.map(n=>({id:n.id,open:n.open})));
 await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=false));
 for(const width of [375,1440]){
  await source.setViewportSize({width,height:1000});await page.setViewportSize({width,height:1000});
  await source.goto('http://127.0.0.1:18784/docs/design/coach-prototype-v6.html');
  await Promise.all([source.evaluate(()=>document.fonts.ready.then(()=>{})),page.evaluate(()=>document.fonts.ready.then(()=>{}))]);
  for(const p of [source,page])assert.ok(await p.locator('.tophero img,.imgband img,.mapcard img,.sova img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),'all original artworks must load before comparison');
  const before=await signatures(source),after=await signatures(page);assert.deepEqual(after,before,'literal prototype style at '+width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'integrated prototype does not overflow at '+width);
  await page.evaluate(()=>scrollTo(0,0));await source.evaluate(()=>scrollTo(0,0));
  await source.screenshot({path:path.join(output,'prototype-'+width+'.png'),fullPage:true,animations:'disabled'});
  await page.screenshot({path:path.join(output,'coach-'+width+'.png'),fullPage:true,animations:'disabled'});
  const fontState=await page.evaluate(()=>({requested:[...document.fonts].map(f=>({family:f.family,status:f.status})),body:getComputedStyle(document.body).fontFamily}));
  summary.push({width,height:1000,artworks:'all seven original PNGs loaded',computedStyles:'all compared prototype selectors match',data:'artificial member fixture, not a production member record',fonts:fontState});
 }
 fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(summary,null,2)+'\n');
 for(const fold of folds)if(fold.id)await page.locator('#'+fold.id).evaluate((el,on)=>el.open=on,fold.open);
 if(accepted==='true')await page.locator('#acceptBtn').click();
 await page.setViewportSize({width:375,height:812});await sourceCtx.close();
};
