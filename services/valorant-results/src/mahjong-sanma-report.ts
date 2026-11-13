import type {PlacementFinding} from './mahjong-sanma-context.ts';
import type {SanmaFinding,SanmaReport} from './mahjong-sanma-efficiency.ts';
import type {SanmaValueFinding,SanmaRiichiFinding,SanmaTradeoffFinding} from './mahjong-sanma-value.ts';
import type {SanmaDefenseFinding,SanmaPushFoldFinding} from './mahjong-sanma-defense.ts';
export type SanmaRuleFinding=SanmaFinding|SanmaDefenseFinding|SanmaValueFinding|PlacementFinding|SanmaRiichiFinding|SanmaPushFoldFinding|SanmaTradeoffFinding;
export interface SanmaRulesReport {version:2|3|4|5;source:'sanma-rules';model:'sanma-rules-v2'|'sanma-rules-v3'|'sanma-rules-v4'|'sanma-rules-v5';uuid:string;findings:SanmaRuleFinding[]}
export type AcceptedSanmaReport=SanmaReport|SanmaRulesReport;
