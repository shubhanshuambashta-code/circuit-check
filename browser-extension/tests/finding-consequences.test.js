import test from 'node:test';
import assert from 'node:assert/strict';
import {explainConsequence} from '../extension/finding-consequences.js';
test('beginners get conditional consequences for shorts, reversed LEDs, opens and layout markings',()=>{
 assert.match(explainConsequence({rule:'supplyShort'}).consequence,/excess current/);
 assert.match(explainConsequence({rule:'ledPolarity'}).consequence,/stay dark/);
 assert.match(explainConsequence({rule:'openPins'}).consequence,/may not reach/);
 assert.match(explainConsequence({rule:'silk_overlap'}).consequence,/not evidence of an electrical failure/);
 assert.match(explainConsequence({rule:'not-a-known-rule'}).consequence,/has not been established/);
});
