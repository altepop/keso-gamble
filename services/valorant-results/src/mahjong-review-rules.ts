// The standard replay/encoder cannot approximate special-event rules.
// Inspect only known rule flags, not player identities or free-form settings.
export const UNSUPPORTED_REVIEW_FLAGS=['begin_open_mode','open_hand','reveal_discard','muyu_mode','yongchang_mode','field_spell_mode','guyi_mode','dora3_mode','xuezhandaodi','huansanzhang','chuanma','zhanxing','tianming_mode','jiuchao_mode','hunzhiyiji_mode','wanxiangxiuluo_mode','beishuizhizhan_mode'] as const;
export function supportsReviewRules(head:{config?:{mode?:{mode?:number;detail_rule?:Record<string,unknown>}}}):boolean{
 const mode=head?.config?.mode;
 return Boolean(mode&&[1,2,11,12].includes(mode.mode??-1)&&UNSUPPORTED_REVIEW_FLAGS.every(k=>mode.detail_rule?.[k]===undefined||mode.detail_rule[k]===0||mode.detail_rule[k]===false));
}

/** Zero-filled detail rules cannot distinguish a custom room's rule choices
 * from ranked defaults. Only ranked metadata confirms our standard profile. */
export function confirmedStandardReviewRules(head:{config?:{mode?:{mode?:number;detail_rule?:Record<string,unknown>};meta?:{mode_id?:number;room_id?:number;contest_uid?:number}}}):boolean{
 const meta=head?.config?.meta;
 return supportsReviewRules(head)&&Boolean(meta&&Number.isInteger(meta.mode_id)&&(meta.mode_id??0)>0&&!meta.room_id&&!meta.contest_uid);
}
