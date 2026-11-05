import {readFile,writeFile,stat} from 'node:fs/promises';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
const compress=promisify(gzip);
for(const name of ['catalog.json','engine-assets.json','resources.json','layouts.json','locales.json']){
  const url=new URL('../web/data/'+name,import.meta.url);
  const source=await stat(url).catch(()=>null);if(!source)continue;
  const target=new URL(url.href+'.gz');
  const existing=await stat(target).catch(()=>null);
  if(existing&&existing.mtimeMs>=source.mtimeMs)continue;
  const bytes=await readFile(url),result=await compress(bytes,{level:6});await writeFile(target,result);
  console.log(`${name}: ${(bytes.length/1048576).toFixed(1)} MB → ${(result.length/1048576).toFixed(1)} MB`);
}
