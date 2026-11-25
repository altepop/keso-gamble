// Fixed, evidence-backed competitive map rotation for V26 Act 6.
// Riot VALORANT patch 13.08 (2026-10-13): Bind/Corrode in, Ascent/Split out.
// https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-08/
// This is NOT an endpoint or auto-refresh mechanism. A later rotation requires
// a reviewed source change; historical matches outside this pool remain visible.
export const COACH_COMPETITIVE_MAP_POOL_V26_ACT6=[
 'Abyss','Bind','Corrode','Haven','Lotus','Summit','Sunset'
] as const;
export const COACH_COMPETITIVE_MAP_POOL_VERSION='2026-act6-patch-13.08';
export const COACH_COMPETITIVE_MAP_POOL_SOURCE='https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-08/';
