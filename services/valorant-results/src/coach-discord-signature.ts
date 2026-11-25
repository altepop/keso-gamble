// Phase 3-E2: Discord Ed25519 request verification, detached from HTTP routing.
// A caller must use the exact raw request body, not reserialized JSON.
// No database mutation, notification dispatch or role elevation occurs here.
const hexBytes=(value:string,length:number):Uint8Array|null=>{
 if(typeof value!=='string'||value.length!==length*2||!/^[0-9a-f]+$/i.test(value))return null;
 const bytes=new Uint8Array(length);
 for(let i=0;i<length;i++)bytes[i]=Number.parseInt(value.slice(2*i,2*i+2),16);
 return bytes;
};
export async function verifyCoachDiscordSignature(input:{
 publicKeyHex:string;signatureHex:string;timestamp:string;rawBody:string;
 nowSeconds:number;
},subtle:SubtleCrypto=crypto.subtle):Promise<boolean>{
 try{
  const key=hexBytes(input.publicKeyHex,32),signature=hexBytes(input.signatureHex,64);
  if(!key||!signature||typeof input.timestamp!=='string'||
   !/^[0-9]{10,13}$/.test(input.timestamp)||typeof input.rawBody!=='string'||
   !Number.isSafeInteger(input.nowSeconds)||input.nowSeconds<0)return false;
  const timestamp=Number(input.timestamp);
  if(!Number.isSafeInteger(timestamp)||timestamp<0||
   input.nowSeconds-timestamp<0||input.nowSeconds-timestamp>300)return false;
  const payload=new TextEncoder().encode(input.timestamp+input.rawBody);
  const imported=await subtle.importKey('raw',key,{name:'Ed25519'},false,['verify']);
  return await subtle.verify('Ed25519',imported,signature,payload);
 }catch{return false;}
}
