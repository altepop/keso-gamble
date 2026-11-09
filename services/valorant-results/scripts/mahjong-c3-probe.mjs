// Manual, read-only GitHub Actions verification of the original private model.
import {createC3Reviewer} from './mahjong-c3-infer.mjs';
if(!process.env.C3_ASSETS_ROOT)throw Error('C3_ASSETS_ROOT missing');
const reviewer=await createC3Reviewer(process.env.C3_ASSETS_ROOT);
try{
 await reviewer.probe();
 console.log('equal_review: Node ONNX inference succeeded; no paipu, Discord, D1 or KP touched');
}finally{await reviewer.close();}
