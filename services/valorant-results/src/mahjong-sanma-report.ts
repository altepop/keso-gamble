import type {SanmaFinding,SanmaReport} from './mahjong-sanma-efficiency.ts';
import type {SanmaValueFinding} from './mahjong-sanma-value.ts';
import type {SanmaDefenseFinding} from './mahjong-sanma-defense.ts';
export type SanmaRuleFinding=SanmaFinding|SanmaDefenseFinding|SanmaValueFinding;
export interface SanmaRulesReport {version:2|3;source:'sanma-rules';model:'sanma-rules-v2'|'sanma-rules-v3';uuid:string;findings:SanmaRuleFinding[]}
export type AcceptedSanmaReport=SanmaReport|SanmaRulesReport;
