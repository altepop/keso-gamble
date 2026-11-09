// Time-critical live screens retain the original 60-second forced state refresh.
// Other screens still receive balance and market changes via the 15-second pulse,
// but need no expensive full D1 state rebuild every minute when nothing changed.
const rapid=new Set(['race','mleague','market','stable']);
export function fullRefreshInterval(screen){
 return rapid.has(screen)?60000:120000;
}

/** Community history is an optional disclosure, not a financial price feed.
 * Do not hit D1 while the disclosure is collapsed. The open home feed gets
 * a responsive 10-second revision check; background screens stay query-free.
 */
export function communityRefreshEnabled(screen,open,visible=true,connected=true){
 return screen!=='title'&&Boolean(open)&&Boolean(visible)&&Boolean(connected);
}
export const COMMUNITY_REFRESH_INTERVAL=10000;
