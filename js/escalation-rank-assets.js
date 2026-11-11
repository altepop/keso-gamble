// Original KESO artwork: SVG for Activity, raster PNG for Discord embeds.
export const ESCALATION_ART=[
 {key:'iron',name:'アイアン',color:'#9aabba'},
 {key:'bronze',name:'ブロンズ',color:'#d79b62'},
 {key:'silver',name:'シルバー',color:'#c6e2f2'},
 {key:'gold',name:'ゴールド',color:'#f1cf70'},
 {key:'platinum',name:'プラチナ',color:'#60e5db'},
 {key:'diamond',name:'ダイヤモンド',color:'#bfa0f8'},
 {key:'ascendant',name:'アセンダント',color:'#70e9ac'},
 {key:'immortal',name:'イモータル',color:'#fa83ac'},
 {key:'radiant',name:'レディアント',color:'#fff4be'},
];
export function escalationArt(tier){return Number.isInteger(tier)&&tier>=0&&tier<ESCALATION_ART.length?ESCALATION_ART[tier]:{key:'unranked',name:'未認定',color:'#93a3be'};}
