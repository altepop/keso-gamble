// Phase 3-E2: pure retry decisions. No D1 queries or Discord delivery.
export type CoachOutboxState='pending'|'claimed'|'delivered'|'cancelled';
export type CoachOutboxLease={state:CoachOutboxState;attempts:number;nextAttemptAt:number;claimedUntil:number};
export const COACH_OUTBOX_MAX_ATTEMPTS=5;
const BACKOFF_MS=[60_000,120_000,240_000,480_000,960_000] as const;
const timestamp=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export function canClaimCoachOutbox(item:CoachOutboxLease,now:number):boolean{
 if(!timestamp(now)||!timestamp(item.nextAttemptAt)||!timestamp(item.claimedUntil)||
  !Number.isSafeInteger(item.attempts)||item.attempts<0||
  item.attempts>=COACH_OUTBOX_MAX_ATTEMPTS)return false;
 return item.state==='pending'&&item.nextAttemptAt<=now ||
  item.state==='claimed'&&item.claimedUntil>0&&item.claimedUntil<=now&&item.nextAttemptAt<=now;
}
export function nextCoachOutboxRetry(attempts:number,now:number):number|null{
 if(!timestamp(now)||!Number.isSafeInteger(attempts)||attempts<1||
  attempts>=COACH_OUTBOX_MAX_ATTEMPTS)return null;
 const delay=BACKOFF_MS[attempts-1];
 const next=now+delay;
 return Number.isSafeInteger(next)?next:null;
}
export function coachOutboxTerminal(state:CoachOutboxState,attempts:number):boolean{
 return state==='delivered'||state==='cancelled'||!Number.isSafeInteger(attempts)||
  attempts>=COACH_OUTBOX_MAX_ATTEMPTS;
}
