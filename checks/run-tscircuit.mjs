import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runCapturedChecks,ENGINE_VERSION,SCHEMA_VERSION} from './tscircuit-checks.mjs';

const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,value,index,args)=>index%2?pairs:[...pairs,[value,args[index+1]]],[]));
if(!options['--input']||!options['--output'])throw Error('Use --input capture.json --output report.json.');
for(const [name,version] of [['@tscircuit/checks',ENGINE_VERSION],['circuit-json',SCHEMA_VERSION]]){
 const metadata=JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.resolve(name))),'../package.json'),'utf8'));
 if(metadata.version!==version)throw Error('Installed checking dependency differs from the pinned integration. Run npm ci.');
}
const input=await readFile(options['--input']);if(input.length>5*1024*1024)throw Error('Capture exceeds the 5 MB checking limit.');
const report=runCapturedChecks(JSON.parse(input));
report.input_sha256=createHash('sha256').update(input).digest('hex');
await writeFile(options['--output'],JSON.stringify(report,null,2));
