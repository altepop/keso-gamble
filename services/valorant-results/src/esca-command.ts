export const ESCA_COMMAND={type:1,name:'esca',description:'KESO PLAY｜エスカランク・認定・ランキング',options:[
 {type:1,name:'rank',description:'エスカランク・認定進捗・前ACTの最高ランク（本人だけに表示）',options:[{type:6,name:'user',description:'見たいメンバー（省略で自分）',required:false}]},
 {type:1,name:'ranking',description:'今ACTのエスカランク上位10人をチャットへ公開'},
]} as const;
