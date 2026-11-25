// A structural allowlist, not serialization followed by name/ID replacement.
// Source rows have already been limited to verified owner PUUIDs and other
// players' names removed before any analysis text is generated.
type Schema='scalar'|{[key:string]:Schema}|[Schema];
const fields=(keys:string):Record<string,Schema>=>Object.fromEntries(keys.split(/\s+/).filter(Boolean).map(k=>[k,'scalar']));
const stamps:Schema=fields('oldest newest');
const base:Schema=fields('numerator denominator rounds matches valid excluded value');
const stats:Schema={...fields('value matches kdMatches kdaMatches rateMatches acsMatches kills deaths assists kd averageKills averageDeaths averageAssists kpr dpr apr rateRounds acs scoreTotal scoreRounds meanMatchKd medianKd kdStandardDeviation killStandardDeviation deathStandardDeviation killVariance deathVariance ratioMatches zeroDeathRatioExclusions winPct losses draws unknownOutcomes wins knownOutcomes negativeKdMatches adr ddDeltaPerRound damageMatches damageRounds damageTotal damageDeltaMatches damageDeltaRounds damageDeltaTotal hsPct headHits totalHits hitMatches'),rateBases:{kpr:base,dpr:base,apr:base},statTotals:{kills:base,deaths:base,assists:base}};
const card:Schema=fields('title evidence action');
const lesson:Schema={...fields('title meaning why alternatives nextGame selfCheck track'),practice:{...fields('name minutes'),steps:['scalar']}};
const qualityMetric:Schema={...fields('valid excluded missingTimestamps numerator denominator reason'),recordedAt:stamps};
const exclusions:Schema=fields('invalid-roster time-only-record invalid-teams multiple-owned-accounts-in-match account-not-found duplicate-match missing-focus invalid-kills invalid-rounds missing-kills missing-rounds roster-mismatch unknownRole unknownMap noSameRoleTeammate unverifiedRounds');
const note:Schema=fields('kind title evidence action category status reason nextAction');
const opening:Schema={...fields('player map agent matches matchWins matchLosses matchDraws statsMatches totalKills totalDeaths totalAssists scoreMatches totalScore observedOpeningRounds rounds firstKills firstDeaths firstKillWins firstKillLosses firstDeathWins firstDeathLosses openingKillerDiedWithin5s firstDeathKillerEliminatedWithin5s'),attack:fields('rounds observedOpeningRounds firstKills firstDeaths firstKillWins firstKillLosses firstDeathWins firstDeathLosses'),defense:fields('rounds observedOpeningRounds firstKills firstDeaths firstKillWins firstKillLosses firstDeathWins firstDeathLosses')};
const schema:Schema={
 ...fields('person profile basis archivedMatches usableMatches invalidMatches roundDataMissing killDataMissing'),accounts:['scalar'],
 coverage:fields('discovered complete partial pending unavailable enabled analysisMatches existingArchiveMatches rowLimit limitReached allMatchesGuaranteed discoveryDone truncated'),
 individual:[opening],individualMapAgent:[opening],
 matchTrend:[fields('date map agent outcome kills deaths assists firstKills firstDeaths observedOpeningRounds')],
 fullDiagnosis:{items:[fields('subject category title status evidence reason nextAction numerator denominator ratePct referencePct differencePp')]},
 performance:{...fields('priorityPolicy'),overall:stats,
  ...Object.fromEntries('acts timeBuckets maps agents outcomes mapAgents roles parties compositions'.split(' ').map(k=>[k,[stats] as Schema])),
  windows:[{...fields('requested sameCondition'),recent:stats,previous:stats}],conditionalWindows:[{...fields('value control'),uncontrolled:['scalar'],recent:stats,previous:stats}],
  rolePeers:[{...fields('value candidateMatches'),...Object.fromEntries(['kpr','dpr','apr'].map(k=>[k,fields('own peers rounds peerRounds matches peerPlayerGames excluded ownRate peerRate')]))}],
  timeline:[fields('date map agent role rounds outcome kills deaths assists kd acs adr hsPct rollingWinPct5 rollingKd5 rollingKd5Matches form')],
  form:fields('valid positive negative unclassified currentPositiveStreak currentNegativeStreak definition'),notes:[note],limitations:['scalar'],
  quality:{...fields('source candidateMatches distinctMatches selectedMatches snapshotSource missingTimestamps'),recordedAt:stamps,
   timeSeries:fields('valid excluded reason'),rolePeerExclusions:exclusions,excluded:exclusions,
   missingFields:fields('kills deaths assists score verifiedRounds hitTriple damageDealt damageReceived'),
   metricCoverage:Object.fromEntries('kd kpr dpr apr acs hs adr ddDelta'.split(' ').map(k=>[k,qualityMetric])),
   ...Object.fromEntries('kd kpr dpr apr adr ddDelta acs hs'.split(' ').map(k=>[k,{...base,...fields('reason')}]))}},
 nextMatch:{...fields('version basis matches confidence timeCoverageNote'),strength:card,focus:card,
  lastReview:[fields('key label currentNumerator currentRounds current previousNumerator previousRounds previous previousMatches')],
  check:{...fields('title action caveat'),metrics:[{...base,...fields('key label')}]}},
 matchFeedback:{...fields('version rules delivery'),quality:fields('availableChronologicalMatches shown limit undatedExcluded ambiguousTimeMatches eventVerified incompleteExcluded'),starter:lesson,
  sessions:[{...fields('date map agent outcome kills deaths assists rounds topic scope baselineMatches eventVerified previousTopic'),lesson,evidence:['scalar'],
   followUp:fields('status title text practiceVerified'),metrics:[{...fields('key label'),current:base,baseline:base}]}]},
 roundContribution:{...fields('rounds noDeathRounds multiKillRounds multiKillWins multiKillKnownOutcomes'),
  quality:{...fields('source candidateMatches validMatches missingTimestamps'),recordedAt:stamps,excluded:exclusions},
  assistQuality:fields('validMatches matches rounds assistRounds killOrAssistRounds excludedMatches source'),
  combatFollowup:fields('enemyKills totalDeaths enemyKnownKillerDeaths teammateRetaliations5s tradeKills5s diedAfterKill5s'),
  killHistogram:[fields('kills count denominator')],sides:{attack:fields('rounds kills deaths'),defense:fields('rounds kills deaths')},limitations:['scalar']},
 roundContext:{...fields('peerComparableRounds lowWithArmedPeers'),
  quality:{...fields('candidateMatches validRoundMatches candidateRounds contextSizeCapMatches'),
   sideSources:fields('winnerRole explicitOrLegacy unknown'),excluded:exclusions,
   metricCoverage:[{...fields('metric source matches valid excluded numerator denominator unit'),recordedAt:stamps}],
   economy:{...fields('matches rounds loadoutTotal'),recordedAt:stamps},abilities:{...fields('matches rounds'),recordedAt:stamps}},
  bands:[fields('key rounds knownOutcomes wins combatRounds kills deaths')],
  ...Object.fromEntries(['abilities','matchAbilities'].map(k=>[k,Object.fromEntries('grenade ability1 ability2 ultimate'.split(' ').map(a=>[a,{...fields('casts matches rateCasts rounds rateMatches'),recordedAt:stamps}]))])),
  spike:Object.fromEntries(['plant','defuse'].map(k=>[k,{...fields('events rounds matches'),recordedAt:stamps}])),
  weapons:{...fields('knownKills totalKills matches validMatches'),recordedAt:stamps,counts:[fields('weapon kills')]},
  pistols:fields('definition rounds knownOutcomes wins kills deaths'),notes:[note],limitations:['scalar']},
 roundSequence:{...fields('matches excludedMatches'),
  kast:fields('matches excludedMatches rounds kastRounds pct'),
  advantage:{...fields('rounds wins losses conversionPct'),tiers:[fields('key rounds wins losses')],lossRefs:[fields('map round date')]},
  postPlant:{...fields('plants wins losses'),lossRefs:[fields('map round date')]},
  ult:{...fields('matches rounds wins losses'),lossRefs:[fields('map round date')]},
  snowball:{...fields('candidates'),refs:[fields('map round date')]},
  pistolFlip:{...fields('pairs flips against for'),againstRefs:[fields('map round date')]},
  firstBlood:{lostRefs:[fields('map round date')]},
  latest:fields('map date tradeDeaths tradeTraded tradePct advRounds advWins advPct')},
 mmr:{accounts:[fields('riotId tier tierPatched rankingInTier mmrChange peakTier peakPatched peakSeason fetchedAt')]}
};
function project(value:any,shape:Schema):any{
 if(value===null||value===undefined)return null;
 if(shape==='scalar')return typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)?value:null;
 if(Array.isArray(shape))return Array.isArray(value)?value.map(v=>project(v,shape[0])):[];
 if(typeof value!=='object'||Array.isArray(value))return null;
 return Object.fromEntries(Object.entries(shape).filter(([key])=>Object.hasOwn(value,key)).map(([key,s])=>[key,project(value[key],s)]));
}
export function projectCoachSelfReport(input:unknown){
 const report=input as any;
 const items=(report?.fullDiagnosis?.items??[]).filter((x:any)=>x.subject===report.profile&&!['VDKと同パーティーだった割合','パーティー情報の不明件数'].includes(x.title))
  .map((x:any)=>x.title==='参加試合の勝率'?{...x,reason:'本人が参加した確認済み試合の勝率です。役割・マップ・相手の違いは未補正です。'}:x);
 return project({...report,individual:(report?.individual??[]).filter((x:any)=>x.player===report.profile),individualMapAgent:(report?.individualMapAgent??[]).filter((x:any)=>x.player===report.profile),fullDiagnosis:{items}},schema);
}
