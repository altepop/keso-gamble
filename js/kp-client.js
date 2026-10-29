// Live wallet state is never written to the local demo save.
const browserStorage=name=>{try{return globalThis[name]??null;}catch{return null;}};
export function createKpClient({storage,temporaryStorage,request=globalThis.fetch,host=globalThis.location?.hostname??'',randomId=()=>crypto.randomUUID()}={}){
 const persistent=storage??browserStorage('localStorage');
 const temporary=temporaryStorage??storage??browserStorage('sessionStorage');
 // Login survives closing the Activity. An in-flight payment belongs to its own tab.
 const pendingStorage=temporary??persistent;
 let remembered=false;
 const root=host.endsWith('.discordsays.com')?'/.proxy/kp-api':'https://valorant-results.tealeaforest.workers.dev';
 const tokenKey='keso-kp-session-v1',pendingKey='keso-kp-pending-v1';
 const read=(store,key)=>{try{return store?.getItem(key)??null;}catch{return null;}};
 const write=(key,value)=>{try{if(!pendingStorage)throw Error('unavailable');value===null?pendingStorage.removeItem(key):pendingStorage.setItem(key,value);}catch{throw Error('操作の確認情報を保存できません。ブラウザーの保存設定を確認してください。');}};
 function saveToken(value){
  if(value===null){for(const store of new Set([persistent,temporary])){try{store?.removeItem(tokenKey);}catch{}}remembered=false;return;}
  for(const store of new Set([persistent,temporary])){
   if(!store)continue;try{store.setItem(tokenKey,value);remembered=store===persistent;if(remembered&&temporary!==persistent){try{temporary?.removeItem(tokenKey);}catch{}}return;}catch{}
  }
  throw Error('口座の接続情報を保存できません。ブラウザーの保存設定を確認してください。');
 }
 let ownerUserId;
 let token=read(persistent,tokenKey),pending;remembered=!!token;
 if(!token){token=read(temporary,tokenKey);if(token){try{saveToken(token);}catch{}}}
 try{pending=JSON.parse(read(pendingStorage,pendingKey)||'null');}catch{pending=null;}
 async function api(path,body,session=token){
  let response;try{response=await request(root+'/api/kp/'+path,{method:body?'POST':'GET',headers:{...(session?{Authorization:'Bearer '+session}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw Error('通信を確認できません。送信済みの操作は「通信結果を確認」で確認できます。');}
  let data;try{data=await response.json();}catch{throw Error('応答を確認できません。「通信結果を確認」を押してください。');}
  if(!response.ok){const error=Error(data.error||'処理に失敗しました。');error.status=response.status;error.definitive=data.retryable===false;throw error;}
  return data;
 }
 async function readState(){const state=await api('state');ownerUserId=state.selfUserId;return state;}
 async function acceptSession(candidate,expectedUser){
  if(typeof candidate!=='string'||!candidate)throw Error('接続情報を確認できません。');
  const state=await api('state',undefined,candidate);
  if(expectedUser&&state.selfUserId!==expectedUser)throw Error('接続する口座が一致しません。');
  if(pending){
   const previousOwner=pending.owner??ownerUserId??(token? (await api('state')).selfUserId:null);
   if(!previousOwner||previousOwner!==state.selfUserId)throw Error('別の口座に未確認の操作があります。元のアカウントで通信結果を確認してください。');
  }
  saveToken(candidate);token=candidate;ownerUserId=state.selfUserId;return state;
 }
 async function resume(){
  if(!pending)return null;
  // Save before sending, and reuse this ID even after a lost response/reload.
  let result;try{result=await api('operation',pending);}catch(error){if(error.definitive){pending=null;write(pendingKey,null);}throw error;}pending=null;write(pendingKey,null);return result.result;
 }
 return {
  get connected(){return !!token;},get remembered(){return remembered;},get pending(){return !!pending;},
  async connect(code){const result=await api('auth',{code:code.trim()});return acceptSession(result.token);},
  activityConfig:()=>api('activity/config'),activityChallenge:codeChallenge=>api('activity/challenge',{codeChallenge}),exchangeActivity:input=>api('activity/auth',input),acceptActivitySession:acceptSession,
  state:readState,resume,
  // Whether anything changed since the last full state (a short string; compare for equality).
  pulse:async()=>(await api('pulse')).pulse,
  async operate(action,args){if(pending)throw Error('前の通信結果を確認してから操作してください。');pending={id:randomId(),action,args,...(ownerUserId?{owner:ownerUserId}:{})};write(pendingKey,JSON.stringify(pending));return resume();},
  discardRejected(){pending=null;write(pendingKey,null);},
  async disconnect(){if(pending)throw Error('先に通信結果を確認してください。');if(token){try{await api('logout',{});}catch(error){if(error.status!==401)throw error;}}saveToken(null);token=null;},
 };
}
