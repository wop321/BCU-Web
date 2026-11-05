import {cp,mkdir,readFile,realpath,rm,stat,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const web=path.join(root,'web');
const output=path.join(root,'.vercel','output');
const staticDir=path.join(output,'static');

for(const script of ['check.mjs','compress.mjs']){
  const result=spawnSync(process.execPath,[path.join(root,'scripts',script)],{stdio:'inherit'});
  if(result.status!==0)throw new Error(`Deployment preparation failed in ${script}. Build BCU Web locally first.`);
}
for(const file of ['engine-assets.json.gz','resources.json'])await stat(path.join(web,'data',file));

await mkdir(output,{recursive:true});
if(await realpath(output)!==output)throw new Error('The Vercel output directory must be inside this checkout.');
const existing=await realpath(staticDir).catch(error=>{
  if(error.code==='ENOENT')return null;
  throw error;
});
if(existing&&existing!==staticDir)throw new Error('The static output directory must be inside this checkout.');
await rm(staticDir,{recursive:true,force:true});
await cp(web,staticDir,{recursive:true,filter:source=>{
  const relative=path.relative(web,source).split(path.sep).join('/');
  if(relative==='engine/src'||(relative.startsWith('engine/')&&relative.endsWith('.map'))||relative==='data/engine-assets.json')return false;
  return !relative.endsWith('.json.gz')||relative==='data/engine-assets.json.gz';
}});
const bundle=path.join(staticDir,'engine','bcu.js');
const code=await readFile(bundle,'utf8');
await writeFile(bundle,code.replace(/^\/\/# sourceMappingURL=.*$/m,''));
await writeFile(path.join(output,'config.json'),JSON.stringify({version:3}));
console.log('Prepared .vercel/output. Deploy from this folder with vercel deploy --prebuilt --archive=split-tgz.');
