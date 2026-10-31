import {NextRequest,NextResponse} from 'next/server';
import {authenticate,sign} from '@/lib/auth';
export async function POST(req:NextRequest){const {username,password}=await req.json();const user=await authenticate(String(username||''),String(password||''));if(!user)return NextResponse.json({error:'Invalid username or password'},{status:401});const res=NextResponse.json(user);res.cookies.set('scoutiq_session',sign(user),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:604800});return res}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.delete('scoutiq_session');return res}
