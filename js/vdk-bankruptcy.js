// One-off, fictional KESO PLAY market event. Times are exact UTC instants (JST +09:00).
export const VDK_CRASH_START=Date.UTC(2026,10,20,0,30); // 2026-11-20 09:30 JST
export const VDK_IPO_AT=Date.UTC(2026,10,20,15); // 2026-11-21 00:00 JST
export function vdkEventPrice(initial,begin,now){
 if(now>=VDK_IPO_AT)return 1;
 if(now<begin)return initial;
 if(!Number.isFinite(initial)||initial<1)return 1;
 const span=Math.max(1,VDK_IPO_AT-begin);
 const remaining=Math.max(0,Math.min(1,(VDK_IPO_AT-now)/span));
 return Math.max(2,Math.ceil(1+(initial-1)*Math.pow(remaining,1.25)));
}
export function stockIsListed(symbol,now){
 return symbol!=='vdkc'||now>=VDK_IPO_AT;
}
export function stockTradeRestriction(symbol,side,now){
 if(symbol==='vdkc'&&now<VDK_IPO_AT)return 'VDKブラックコンサルは11月21日0時の新規上場まで取引できません。';
 if(symbol==='vdk'&&now>=VDK_IPO_AT)return 'VDKブラック商事は倒産・上場廃止のため売買できません。';
 if(symbol==='vdk'&&now>=VDK_CRASH_START&&side==='buy')return 'VDKブラック商事は倒産危機に伴い新規買付停止中です。売却は可能です。';
 return null;
}
