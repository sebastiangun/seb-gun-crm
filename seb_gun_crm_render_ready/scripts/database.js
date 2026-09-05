'use strict';
const path=require('path');
const {Storage}=require('../lib/postgres-storage');
// Node 22 supports loading local secrets without printing them.
const envFile=path.join(__dirname,'../.env.local');if(require('fs').existsSync(envFile)&&process.loadEnvFile)process.loadEnvFile(envFile);
const db=new Storage(path.join(__dirname,'..'));
(async()=>{
 if(!db.enabled)throw new Error('Set DATABASE_URL in the environment');
 process.env.DB_IMPORT_ON_START='0';await db.init();
 const cmd=process.argv[2]||'status';
 if(cmd==='import')console.log(await db.importDirectory(path.resolve(process.argv[3]||path.join(__dirname,'../data'))));
 else if(cmd==='migrate')console.log('Schema ready');
 else if(cmd==='status'){
  for(const table of ['clients','lead_journal','lead_events','sla_settings','notification_deliveries','calendar_events','client_events','app_documents','user_sessions'])console.log(table,(await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
 }else throw new Error('Use migrate, import [data-directory], or status');
})().catch(e=>{console.error('Database command failed:',e.code||e.message);process.exitCode=1;}).finally(()=>db.close());
