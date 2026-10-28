// A four-player hanchan in decoded form: haneman deal-in after riichi, a draw, a kokushi tsumo, and a bust.
import type {PaipuAction} from '../../src/mahjong-summary.ts';
export const head={uuid:'261027-0123abcd-4567-89ab-cdef-0123456789ab',start_time:1793000000,end_time:1793002400,config:{mode:{mode:2}},
 accounts:[{account_id:11,seat:0,nickname:'Aさん'},{account_id:22,seat:1,nickname:'B'},{account_id:33,seat:2,nickname:'C'},{account_id:44,seat:3,nickname:'D'}],
 result:{players:[{seat:1,part_point_1:52000},{seat:2,part_point_1:31000},{seat:3,part_point_1:20000},{seat:0,part_point_1:-3000}]}};
const round=(chang:number,ju:number,scores:number[],ben=0):PaipuAction=>({name:'RecordNewRound',data:{chang,ju,ben,scores}});
const discard=(seat:number,riichi=false):PaipuAction=>({name:'RecordDiscardTile',data:{seat,is_liqi:riichi,is_wliqi:false}});
export const sample:PaipuAction[]=[
 // East 1: A riichi, then deals into B's haneman (riichi, ippatsu, dora 3).
 round(0,0,[25000,25000,25000,25000]),discard(0,true),discard(1),discard(0),
 {name:'RecordHule',data:{hules:[{seat:1,zimo:false,count:6,fu:40,yiman:false,point_sum:12000,fans:[{id:2,val:1},{id:30,val:1},{id:31,val:3},{id:12,val:1}]}],delta_scores:[-13000,13000,0,0]}},
 // East 2: C calls, exhaustive draw with only C tenpai.
 round(0,1,[12000,38000,25000,25000]),{name:'RecordChiPengGang',data:{seat:2,type:1}},discard(2),
 {name:'RecordNoTile',data:{players:[{tingpai:false},{tingpai:false},{tingpai:true},{tingpai:false}],scores:[{delta_scores:[-1000,-1000,3000,-1000]}]}},
 // East 3: D tsumo yakuman (kokushi).
 round(0,2,[11000,37000,28000,24000],1),discard(3),
 {name:'RecordHule',data:{hules:[{seat:3,zimo:true,count:1,fu:0,yiman:true,point_sum:32300,fans:[{id:42,val:1}]}],delta_scores:[-8100,-8100,-16100,32300]}},
 // South 1: A deals into B again, ends below zero.
 round(1,0,[2900,28900,11900,56300]),discard(0),
 {name:'RecordHule',data:{hules:[{seat:1,zimo:false,count:2,fu:30,yiman:false,point_sum:2000,fans:[{id:12,val:1},{id:32,val:1}]}],delta_scores:[-2000,2000,0,0]}},
];
