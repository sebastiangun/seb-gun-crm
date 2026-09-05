'use strict';

const formatterCache=new Map();

function timeParts(timestamp,timeZone='Europe/Moscow'){
  const key=String(timeZone||'Europe/Moscow');let formatter=formatterCache.get(key);
  if(!formatter){formatter=new Intl.DateTimeFormat('en-US',{timeZone:key,weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formatterCache.set(key,formatter)}
  const out={hour:0,minute:0,second:0,weekday:0},weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};for(const part of formatter.formatToParts(new Date(timestamp))){if(part.type==='weekday')out.weekday=weekdays[part.value]??0;else if(part.type in out)out[part.type]=Number(part.value)}return out
}
function hhmmMinutes(value='00:00'){const [hour,minute]=String(value).split(':').map(Number);return Math.max(0,Math.min(1439,(Number(hour)||0)*60+(Number(minute)||0)))}
function isWorkingTime(timestamp,rule={}){
  const parts=timeParts(timestamp,rule.timezone||'Europe/Moscow'),minute=parts.hour*60+parts.minute,start=hhmmMinutes(rule.workStart||'10:00'),end=hhmmMinutes(rule.workEnd||'22:00');
  const workDays=Array.isArray(rule.workDays)?rule.workDays.map(Number).filter(x=>x>=0&&x<=6):[];if(workDays.length&&!workDays.includes(parts.weekday))return false;
  if(start===end)return true;return start<end?(minute>=start&&minute<end):(minute>=start||minute<end)
}
function nextMinuteBoundary(timestamp){return Math.floor(Number(timestamp)/60000)*60000+60000}
function nextWorkingStart(startMs,rule={},maxDays=14){
  let cursor=Number(startMs);if(!Number.isFinite(cursor))return 0;if(isWorkingTime(cursor,rule))return cursor;
  cursor=nextMinuteBoundary(cursor);const limit=cursor+maxDays*24*60*60000;
  while(cursor<=limit){if(isWorkingTime(cursor,rule))return cursor;cursor+=60000}return 0
}
function workingMillisecondsBetween(startMs,endMs,rule={}){
  let cursor=Number(startMs),end=Number(endMs),worked=0;if(!Number.isFinite(cursor)||!Number.isFinite(end)||end<=cursor)return 0;
  const maxStart=Math.max(cursor,end-31*24*60*60000);cursor=maxStart;
  while(cursor<end){const boundary=Math.min(end,nextMinuteBoundary(cursor));if(isWorkingTime(cursor,rule))worked+=boundary-cursor;cursor=boundary}
  return worked
}
function workingMinutesBetween(startMs,endMs,rule={}){return Math.floor(workingMillisecondsBetween(startMs,endMs,rule)/60000)}
function workingDeadline(startMs,rule={},slaMinutes=8,maxDays=14){
  let cursor=nextWorkingStart(startMs,rule,maxDays),remaining=Math.max(1,Number(slaMinutes||8))*60000;if(!cursor)return 0;
  const limit=cursor+maxDays*24*60*60000;
  while(cursor<=limit&&remaining>0){const boundary=nextMinuteBoundary(cursor),span=boundary-cursor;if(isWorkingTime(cursor,rule)){const used=Math.min(span,remaining);remaining-=used;cursor+=used}else cursor=boundary}
  return remaining<=0?cursor:0
}
function responseWindow(receivedAtMs,rule={}){
  const start=nextWorkingStart(receivedAtMs,rule),due=workingDeadline(receivedAtMs,rule,rule.slaMinutes||8);
  return {responseStartAt:start,dueAt:due,outsideHoursAtReceipt:!isWorkingTime(receivedAtMs,rule)}
}

module.exports={isWorkingTime,nextWorkingStart,workingMillisecondsBetween,workingMinutesBetween,workingDeadline,responseWindow};
