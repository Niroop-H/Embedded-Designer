const {test}=require('node:test'); const assert=require('node:assert/strict');
const {createBrief,advance,lock,steps}=require('../frontend/js/design-brief.js');
test('sequential discovery requires explicit lock',()=>{let b=createBrief();for(const s of steps){b=advance(b,Object.fromEntries(s.fields.map(([k])=>[k,'unknown'])));assert.equal(b.locked,false);}const locked=lock(b);assert.equal(locked.locked,true);assert.throws(()=>advance(locked,{}));});
test('empty answers and premature lock are rejected',()=>{const b=createBrief();assert.throws(()=>advance(b,{}));assert.throws(()=>lock(b));assert.equal(b.step,0);});
