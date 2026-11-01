// Time-critical live screens retain the original 60-second forced state refresh.
// Other screens still receive balance and market changes via the 15-second pulse,
// but need no expensive full D1 state rebuild every minute when nothing changed.
const rapid=new Set(['race','mleague','market','stable']);
export function fullRefreshInterval(screen){
 return rapid.has(screen)?60000:120000;
}
