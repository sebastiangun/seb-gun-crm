'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const fn=source.slice(source.indexOf('async function createCustomerFromDraft('),source.indexOf('// v22.0: local mirror')).split('// -----------------------------------------------------------------------------')[0];
class BlueSalesError extends Error{constructor(message,code){super(message);this.code=code;}}
function scenario({lookupFails=false,timeout=false}={}){
 let created=null,calls=0;const claims=new Set();
 const ctx={console:{warn(){}},BlueSalesError,pendingCustomerCreates:new Map(),storage:{claimCreate:async k=>{if(claims.has(k))return false;claims.add(k);return true;},confirmCreate:async()=>{}},findCustomerByVkEverywhere:async()=>{if(lookupFails)throw Error('network');return created;},sleep:async()=>{},arrayFromResponse:x=>Array.isArray(x)?x:[],normalizeCustomer:x=>x,clearAccountCache(){},getCustomerByVkId:async()=>created,getCustomerById:async()=>created,bsCall:async(_s,command,data)=>{if(command==='customers.add'){calls++;assert.equal(data.manager.login,'actor');assert.equal(data.crmStatus.name,'Запустил воронку');if(timeout)throw new BlueSalesError('timeout','TIMEOUT');created={id:10,...data};return created;}assert.equal(command,'customers.update');return {};}};
 vm.createContext(ctx);vm.runInContext(fn+'; this.create=createCustomerFromDraft;',ctx);
 return {run:()=>ctx.create({login:'actor'},{vkId:123,fullName:'Test',managerLogin:'wrong',crmStatus:'wrong'}),calls:()=>calls,ctx};
}
(async()=>{
 let test=scenario({lookupFails:true});await assert.rejects(test.run(),{code:'LOOKUP_UNAVAILABLE'});assert.equal(test.calls(),0);
 test=scenario();await test.run();await test.run();assert.equal(test.calls(),1);
 test=scenario({timeout:true});await assert.rejects(test.run());await assert.rejects(test.run());assert.equal(test.calls(),1);
 test.ctx.pendingCustomerCreates.clear();await assert.rejects(test.run(),{code:'CREATE_PENDING'});assert.equal(test.calls(),1);
 const sla=require('../lib/working-sla');const rule={timezone:'UTC',workStart:'10:00',workEnd:'22:00',workDays:[1,2,3,4,5]};assert.equal(sla.workingMinutesBetween(Date.parse('2026-09-04T21:55:00Z'),Date.parse('2026-09-07T10:05:00Z'),rule),10);
 console.log('PASS: duplicate lookup failure, one create, timeout/restart guard, forced actor/status, weekend SLA');
})().catch(e=>{console.error(e);process.exitCode=1;});
