import test from 'node:test';
import assert from 'node:assert/strict';
import {activityLaunchComponents} from '../src/activity-link.ts';
test('Activity button uses the official Discord launch URL with only the public app ID',()=>{
 const rows=activityLaunchComponents('1556902772362969088'),button=rows[0].components[0];
 assert.equal(button.url,'https://discord.com/activities/1556902772362969088');assert.equal(button.style,5);assert.equal(button.label,'Activityを開く');assert.equal('custom_id'in button,false);assert.equal(new URL(button.url).search,'');
 for(const value of ['javascript:alert(1)','https://example.com','1556902772362969088?token=abc',''])assert.throws(()=>activityLaunchComponents(value));
});
