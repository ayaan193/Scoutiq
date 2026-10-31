let extractor:Promise<any>|undefined;
export async function embed(text:string):Promise<number[]>{extractor??=import('@huggingface/transformers').then(async({pipeline})=>pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2'));const output=await (await extractor)(text,{pooling:'mean',normalize:true});return Array.from(output.data as Float32Array)}
