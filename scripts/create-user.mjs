import pg from 'pg';
import bcrypt from 'bcryptjs';
const [username,password,role]=process.argv.slice(2);
if(!username||!password||!['scout','admin'].includes(role)){console.error('Usage: node scripts/create-user.mjs <username> <password> <scout|admin>');process.exit(1)}
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{const hash=await bcrypt.hash(password,12);await client.query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3)',[username,hash,role]);console.log('Created',username,role)}finally{await client.end()}
