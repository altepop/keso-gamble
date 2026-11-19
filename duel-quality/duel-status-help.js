// A read-only explanation of states already shown by the duel client.
// This module never sends, retries, authenticates, mutates KP or assumes success.
export function describeDuelIssue({retry=false,error=false,loading=false,hasSynced=false,noOpponent=false}={}){
 if(retry)return {kind:'retry',title:'前回の操作結果を確認',message:'操作が確定したか分からない間は、新しい着手・招待を送らず「前回の操作を確認」を使う。'};
 if(error)return {kind:'error',title:'対戦画面にエラーがある',message:'表示されているエラーを確認する。操作結果が未確認なら連続送信せず、「更新」で確定状態を確認する。'};
 if(loading)return hasSynced
  ?{kind:'refresh',title:'対戦情報を更新中',message:'以前に表示した結果はそのまま保持している。新しい確定結果が届いたとは限らない。'}
  :{kind:'initial',title:'最初の対戦情報を確認中',message:'読み込みが完了するまでは、対戦相手や最新の結果を確定したものとして扱わない。'};
 if(noOpponent)return {kind:'empty',title:'対戦相手が表示されていない',message:'まだ相手候補を確認できない。接続が必要なら確認し、画面内の「更新」から再取得する。'};
 return null;
}
