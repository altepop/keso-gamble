// Live wallet state is never written to the local demo save.
export function createKpClient({storage=globalThis.sessionStorage,request=globalThis.fetch,host=globalThis.location?.hostname??'',randomId=()=>crypto.randomUUID()}={}){
 const root=host.endsWith('.discordsays.com')?'/.proxy/kp-api':'https://valorant-results.tealeaforest.workers.dev';
 const tokenKey='keso-kp-session-v1',pendingKey='keso-kp-pending-v1';
 const read=key=>{try{return storage.getItem(key);}catch{return null;}};
 const write=(key,value)=>{try{value===null?storage.removeItem(key):storage.setItem(key,value);}catch{throw Error('口座の接続情報を保存できません。ブラウザーの保存設定を確認してください。');}};
 let token=read(tokenKey),pending;try{pending=JSON.parse(read(pendingKey)||'null');}catch{pending=null;}
 async function api(path,body){
  let response;try{response=await request(root+'/api/kp/'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw Error('通信を確認できません。送信済みの操作は「通信結果を確認」で確認できます。');}
  let data;try{data=await response.json();}catch{throw Error('応答を確認できません。「通信結果を確認」を押してください。');}
  if(!response.ok){const error=Error(data.error||'処理に失敗しました。');error.status=response.status;error.definitive=data.retryable===false;throw error;}
  return data;
 }
 async function resume(){
  if(!pending)return null;
  // Save before sending, and reuse this ID even after a lost response/reload.
  let result;try{result=await api('operation',pending);}catch(error){if(error.definitive){pending=null;write(pendingKey,null);}throw error;}pending=null;write(pendingKey,null);return result.result;
 }
 return {
  get connected(){return !!token;},get pending(){return !!pending;},
  async connect(code){if(pending)throw Error('先に通信結果を確認してください。');const result=await api('auth',{code:code.trim()});write(tokenKey,result.token);token=result.token;return api('state');},
  state:()=>api('state'),resume,
  async operate(action,args){if(pending)throw Error('前の通信結果を確認してから操作してください。');pending={id:randomId(),action,args};write(pendingKey,JSON.stringify(pending));return resume();},
  discardRejected(){pending=null;write(pendingKey,null);},
  disconnect(){if(pending)throw Error('先に通信結果を確認してください。');write(tokenKey,null);token=null;},
 };
}
