import pg from 'pg';
import {pipeline} from '@huggingface/transformers';

if(!process.env.DATABASE_URL){console.error('Set DATABASE_URL before running this script.');process.exit(1)}
const extractor=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
  const {rows}=await client.query('SELECT report_id,summary,strengths,weaknesses FROM scouting_reports WHERE embedding IS NULL ORDER BY report_id');
  for(const report of rows){
    const input=[report.summary,report.strengths,report.weaknesses].filter(Boolean).join(' ');
    const vector=await extractor(input,{pooling:'mean',normalize:true});
    if(vector.data.length!==384)throw Error(`Expected 384 dimensions for report ${report.report_id}`);
    await client.query('UPDATE scouting_reports SET embedding=$1::vector,embedded_at=now() WHERE report_id=$2',['['+Array.from(vector.data).join(',')+']',report.report_id]);
    console.log(`Embedded report ${report.report_id}`);
  }
  console.log(`Done: ${rows.length} reports embedded.`);
}finally{await client.end()}
