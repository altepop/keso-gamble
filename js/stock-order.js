// Shared estimate only. The server recomputes from the authoritative market and settles atomically.
export const STOCK_ORDER_VERSION=1,STOCK_PRICE_SCALE=1_000_000,STOCK_LIQUIDITY=1_000_000;
const SCALE=BigInt(STOCK_PRICE_SCALE),LOW=20n*SCALE,HIGH=10_000_000n*SCALE;
const ceil=(a,b)=>(a+b-1n)/b;
export function stockOrderQuote({priceUnits,initialPrice,side,quantity}){
 if(!Number.isSafeInteger(priceUnits)||priceUnits<Number(LOW)||priceUnits>Number(HIGH)||!Number.isSafeInteger(initialPrice)||initialPrice<=0||!Number.isSafeInteger(quantity)||quantity<1||quantity>100000||!['buy','sell'].includes(side))throw Error('株の注文内容を確認してください。');
 const p=BigInt(priceUnits),q=BigInt(quantity),raw=BigInt(initialPrice)**2n,s=raw<SCALE?SCALE:raw;
 const distance=side==='buy'?HIGH-p:p-LOW,move=s*q;
 let numerator,denominator;
 if(move<=distance){numerator=2n*p*q+(side==='buy'?1n:-1n)*s*q*q;denominator=2n*SCALE;}
 else {numerator=2n*s*(side==='buy'?HIGH:LOW)*q+(side==='buy'?-1n:1n)*distance*distance;denominator=2n*s*SCALE;}
 const gross=Number(side==='buy'?ceil(numerator,denominator):numerator/denominator),fee=Math.ceil(gross/100),total=side==='buy'?gross+fee:gross-fee;
 if(!Number.isSafeInteger(gross)||!Number.isSafeInteger(total)||total<0)throw Error('取引額が大きすぎます。');
 const after=side==='buy'?(p+move>HIGH?HIGH:p+move):(p-move<LOW?LOW:p-move);
 return {gross,fee,total,price:gross/quantity,priceBefore:Math.round(priceUnits/STOCK_PRICE_SCALE),priceAfter:Math.round(Number(after)/STOCK_PRICE_SCALE),beforeUnits:priceUnits,afterUnits:Number(after)};
}
