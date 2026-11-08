import test from 'node:test';import assert from 'node:assert/strict';
import {publicProductVersion} from '../scripts/mahjong-paipu.mjs';
test('official quoted JSON and unquoted Unity product versions are read as bounded data',()=>{
 for(const text of ['productVersion: "4.0.18"','"productVersion": "4.0.18"',"'productVersion': '4.0.18'"])assert.equal(publicProductVersion(text),'4.0.18');
 assert.equal(publicProductVersion('productVersion: "4.0.18(19)"'),'4.0.18(19)');
 for(const text of ['no version','productVersion: "private-token"','productVersion: "$(secret)"'])assert.equal(publicProductVersion(text),null);
});
