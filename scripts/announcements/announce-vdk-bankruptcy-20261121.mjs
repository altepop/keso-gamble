// One-off, owner-approved @everyone notice in KESO PLAY's existing earnings channel.
// Only an idempotent kp_posts insert is permitted: never touch accounts, trades, holdings or wallets.
const ID='notice:vdk-bankruptcy-shareholders:20261121';
const content=`@everyone
📉 **【KESO TOWN証券取引所｜緊急・倒産公告】**
**VDKブラック商事（VDK）、2026年11月21日 0:00（JST）に倒産・上場廃止。**
最終表示株価は **1株＝1 KP**。旧VDK株の売買は終了した。

💸 **【旧VDK株を保有していた株主へ：お金の扱い】**
・保有していた**株数と取引履歴は残る**。過去の購入記録は消えない。
・ただし旧VDK株は**買付も売却も不可**。現在は換金できない。
・**購入代金の返金・損失補償・清算分配・KP残高への自動入金は一切ない**。
・「株価1 KP」は**表示上の最終株価**だ。**保有株数×1 KPが払い戻されるわけではない**。
・旧VDK株は今後の**配当・株主優待の対象外**。保有株の記録は残るが、使えるKPにはならない。
・その他の株式と手元のKP残高は、今回の倒産で直接没収・移動されない。

🏢 **【新会社、まさかの即日上場】**
**VDKブラックコンサル（VDKC）** は同日0:00から**新規上場**。**上場時の価格は500 KP／株**（現在値は市場で変動）。
**旧VDK株との交換・自動引継ぎ・新株の無償配布はない。** 新会社株が欲しい人は、別銘柄として新たに買付する必要がある。

🗞️ **【架空の経営陣コメント】**
「商事は終わりました。しかし、ブラックはコンサルになって帰ってきました」
なお旧株主への補償については、コンサルティング対象外だという。

※KESO PLAY内の架空の株式イベントであり、現実の会社・金融商品とは無関係だ。`;
if(content.length>2000)throw Error('Discord content exceeds 2000 characters');
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!(/^[a-f0-9]{32}$/i).test(account??''))throw Error('Cloudflare token/account is missing or invalid');
async function cf(path,body){
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{
  method:body?'POST':'GET',
  headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)
 });
 const data=await response.json();
 if(!response.ok||data.success!==true)throw Error('Cloudflare API failed ('+response.status+')');
 return data.result;
}
const bindings=await cf('/accounts/'+account+'/workers/scripts/valorant-results/settings');
const dbs=(bindings.bindings??[]).filter(b=>b.type==='d1'&&b.name==='DB'&&/^[a-f0-9-]{36}$/i.test(b.id??''));
if(dbs.length!==1)throw Error('Expected one existing authoritative D1 binding');
if(!(bindings.bindings??[]).some(b=>b.type==='secret_text'&&b.name==='KP_EARNINGS_WEBHOOK_URL'))
 throw Error('Earnings Discord webhook is not configured on production Worker');
const databaseId=dbs[0].id;
async function sql(query,params=[]){
 const result=await cf('/accounts/'+account+'/d1/database/'+databaseId+'/query',{sql:query,params});
 if(!Array.isArray(result)||result[0]?.success!==true)throw Error('Remote D1 query failed');
 return result[0].results??[];
}
// Confirm the actual, shared production quote before announcing a completed bankruptcy.
const markets=await sql("SELECT guild,CAST(json_extract(prices,'$.vdk') AS INTEGER) AS vdk,CAST(json_extract(prices,'$.vdkc') AS INTEGER) AS vdkc FROM stock_markets");
if(markets.length!==1)throw Error('Expected one target KESO PLAY market; found '+markets.length);
if(Number(markets[0].vdk)!==1||!Number.isSafeInteger(markets[0].vdkc)||markets[0].vdkc<20)
 throw Error('Production has not reached terminal VDK 1 KP / active VDKC quote; no announcement queued');
console.log('Authoritative fictional market verified: old VDK=1 KP, new VDKC is listed');
// D1 SQL parameterization prevents quotation marks in the Japanese body from altering SQL.
const body=JSON.stringify({username:'等しいbot',content,allowed_mentions:{parse:['everyone']}});
await sql('INSERT OR IGNORE INTO kp_posts(id,body,at,sent) VALUES(?,?,?,0)',[ID,body,Date.now()]);
let rows=await sql('SELECT sent FROM kp_posts WHERE id=?',[ID]);
if(rows.length!==1)throw Error('Announcement was not persisted in the existing queue');
console.log('Official shareholder announcement queued exactly once; @everyone enabled');
for(let n=0;n<7&&Number(rows[0].sent)!==1;n++){
 await new Promise(resolve=>setTimeout(resolve,12000));
 rows=await sql('SELECT sent FROM kp_posts WHERE id=?',[ID]);
 if(rows.length!==1)throw Error('Announcement queue row disappeared');
}
if(Number(rows[0].sent)!==1)throw Error('Queued but existing Worker has not confirmed Discord delivery yet; retain idempotent queue for cron retry');
console.log('Discord earnings-channel delivery confirmed by kp_posts.sent=1; one-time @everyone posted');
