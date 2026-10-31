import {Pool,PoolClient} from 'pg';
const globalPool=globalThis as unknown as {scoutiqPool?:Pool};
export const pool=globalPool.scoutiqPool??new Pool({connectionString:process.env.DATABASE_URL});
if(process.env.NODE_ENV!=='production') globalPool.scoutiqPool=pool;
export async function withActor<T>(user:{id:number;role:string},fn:(db:PoolClient)=>Promise<T>):Promise<T>{const db=await pool.connect();try{await db.query('BEGIN');await db.query("SELECT set_config('app.user_id',$1,true),set_config('app.role',$2,true)",[String(user.id),user.role]);const result=await fn(db);await db.query('COMMIT');return result}catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}}
