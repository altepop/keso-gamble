import type {SanmaFinding,SanmaReport} from './mahjong-sanma-efficiency.ts';
import type {SanmaDefenseFinding} from './mahjong-sanma-defense.ts';
export type SanmaRuleFinding=SanmaFinding|SanmaDefenseFinding;
export interface SanmaRulesReport {version:2;source:'sanma-rules';model:'sanma-rules-v2';uuid:string;findings:SanmaRuleFinding[]}
export type AcceptedSanmaReport=SanmaReport|SanmaRulesReport;
