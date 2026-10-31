import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const db=new pg.Client({connectionString:env.DATABASE_URL});
await db.connect();
let user;
try{user=(await db.query("SELECT user_id,username,role FROM users WHERE username='demo_scout_1' LIMIT 1")).rows[0]}finally{await db.end()}
if(!user)throw Error('Demo scout missing');
const body=Buffer.from(JSON.stringify({id:user.user_id,username:user.username,role:user.role,exp:Date.now()+60000})).toString('base64url');
const token=body+'.'+crypto.createHmac('sha256',env.SESSION_SECRET).update(body).digest('base64url');
const url=(process.argv[2]||'http://localhost:3000')+'/api/data?kind=search&q='+encodeURIComponent('quick wide player who presses from the front');
const response=await fetch(url,{headers:{Cookie:'scoutiq_session='+token}});
const result=await response.json();
console.log(JSON.stringify({status:response.status,semantic:result.semantic?.length,keyword:result.keyword?.length,players:result.semantic?.map(x=>x.name),error:result.error}));
if(!response.ok||!result.semantic?.length||!result.keyword?.length)process.exitCode=1;
for(const params of [{kind:'players'},{kind:'players',name:'viktor'},{kind:'players',name:'victor'},{kind:'players',name:'gyokeres'},{kind:'players',name:'gyokres'},{kind:'players',name:'mbappe'},{kind:'players',position:'Winger'},{kind:'players',position:'wing'},{kind:'players',age:'23'},{kind:'players',sort:'name'}]){
 const target=(process.argv[2]||'http://localhost:3000')+'/api/data?'+new URLSearchParams(params);
 const reply=await fetch(target,{headers:{Cookie:'scoutiq_session='+token}});
 const payload=await reply.json();
 console.log(JSON.stringify({params,status:reply.status,count:Array.isArray(payload)?payload.length:undefined,error:payload.error}));
 if(!reply.ok||(params.name&&Array.isArray(payload)&&payload.length===0))process.exitCode=1;
}
