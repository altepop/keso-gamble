// The standard replay/encoder cannot approximate special-event rules.
// Inspect only known rule flags, not player identities or free-form settings.
export const UNSUPPORTED_REVIEW_FLAGS=['begin_open_mode','open_hand','reveal_discard','muyu_mode','yongchang_mode','field_spell_mode','guyi_mode','dora3_mode','xuezhandaodi','huansanzhang','chuanma','zhanxing','tianming_mode','jiuchao_mode','hunzhiyiji_mode','wanxiangxiuluo_mode','beishuizhizhan_mode'] as const;
export function supportsReviewRules(head:{config?:{mode?:{mode?:number;detail_rule?:Record<string,unknown>}}}):boolean{
 const mode=head?.config?.mode;
 return Boolean(mode&&[1,2,11,12].includes(mode.mode??-1)&&UNSUPPORTED_REVIEW_FLAGS.every(k=>mode.detail_rule?.[k]===undefined||mode.detail_rule[k]===0||mode.detail_rule[k]===false));
}
