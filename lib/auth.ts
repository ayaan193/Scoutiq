import crypto from 'node:crypto';
import {cookies} from 'next/headers';
import {pool} from './db';
import bcrypt from 'bcryptjs';
export type Actor={id:number;username:string;role:'scout'|'admin'};
const secret=()=>{if(!process.env.SESSION_SECRET)throw Error('SESSION_SECRET is required');return process.env.SESSION_SECRET};
export function sign(actor:Actor){const body=Buffer.from(JSON.stringify({...actor,exp:Date.now()+7*86400000})).toString('base64url');return body+'.'+crypto.createHmac('sha256',secret()).update(body).digest('base64url')}
export function verify(value?:string):Actor|null{if(!value)return null;const [body,mac]=value.split('.');if(!body||!mac)return null;const expected=crypto.createHmac('sha256',secret()).update(body).digest();const got=Buffer.from(mac,'base64url');if(expected.length!==got.length||!crypto.timingSafeEqual(expected,got))return null;try{const x=JSON.parse(Buffer.from(body,'base64url').toString());return x.exp>Date.now()&&['scout','admin'].includes(x.role)?{id:x.id,username:x.username,role:x.role}:null}catch{return null}}
export async function actor(){return verify((await cookies()).get('scoutiq_session')?.value)}
export async function authenticate(username:string,password:string){const r=await pool.query('SELECT user_id,username,role,password_hash FROM users WHERE username=$1',[username]);const u=r.rows[0];if(!u||!await bcrypt.compare(password,u.password_hash))return null;return {id:u.user_id,username:u.username,role:u.role} as Actor}
