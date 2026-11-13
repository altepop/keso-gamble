// Counts and fixed categories only. Never serialize errors, player/game IDs,
// tiles, worker messages, or data supplied by a caller as a reason string.
const statuses=new Set(['report','no-findings','no-decisions','analysis-error','disabled','closed','budget-exhausted','worker-disabled','unsupported-mode','timeout','worker-error','worker-exit','send-error','setup-error']);
const countKeys=['replayed','rounds','shapeEligible','shapeSampled','defenseSampled','valueEvaluated','findings'];
const valueStates=new Set(['ok','failed','no-cases','not-configured']);
export function reviewDiagnostic(raw){
 const result={status:statuses.has(raw?.status)?raw.status:'analysis-error'};
 for(const key of countKeys)if(Number.isSafeInteger(raw?.[key])&&raw[key]>=0&&raw[key]<=10000)result[key]=raw[key];
 if(valueStates.has(raw?.valueStatus))result.valueStatus=raw.valueStatus;
 return result;
}

export function displayDiagnostic(raw){
 const states=['invalid-report','missing-report','no-member-findings','no-comparison-findings','posting-disabled','queued'];
 const result={status:states.includes(raw?.status)?raw.status:'invalid-report'};
 for(const key of ['findings','memberFindings','comments','posts'])if(Number.isSafeInteger(raw?.[key])&&raw[key]>=0&&raw[key]<=4)result[key]=raw[key];
 return result;
}
