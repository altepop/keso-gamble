// A bounded, short-lived tail of existing scheduled requests. No match fetches.
import {observeProvider,safeTailError} from './coach-provider-tail.mjs';
import {safePositionEvidence} from '../src/coach-position-quality.ts';
if(process.argv[1]?.endsWith('/coach-position-tail.mjs')){
 try{
  let evidence=null;for(let i=0;i<6&&!evidence;i++)evidence=await observeProvider(process.env,fetch,undefined,55000,safePositionEvidence);
  console.log('COACH_PHASE0_POSITION_EVIDENCE '+JSON.stringify(evidence??{status:'no-normal-response-observed',extraHenrikRequests:0,d1Mutations:0}));
 }catch(e){console.error('COACH_PHASE0_POSITION_EVIDENCE_UNAVAILABLE '+JSON.stringify(safeTailError(e)));process.exitCode=1;}
}
