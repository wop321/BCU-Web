import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import http from 'node:http';

test('static server serves root, range audio, correct MIME and gzip manifests',async t=>{
  const process=spawn(globalThis.process.execPath,['scripts/serve.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...globalThis.process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>process.kill());
  let output='';const base=await new Promise((resolve,reject)=>{process.stdout.on('data',chunk=>{output+=chunk;const match=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(match)resolve(match[0]);});process.once('error',reject);process.once('exit',code=>reject(new Error('Server exited '+code)));});
  const root=await fetch(base+'/');assert.equal(root.status,200);assert.match(root.headers.get('content-type'),/text\/html/);assert.match(await root.text(),/Battle Cats Ultimate/);
  const duplicate=spawn(globalThis.process.execPath,['scripts/serve.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...globalThis.process.env,PORT:new URL(base).port},stdio:['ignore','pipe','pipe']});
  t.after(()=>duplicate.kill());let duplicateOutput='';duplicate.stdout.on('data',chunk=>duplicateOutput+=chunk);
  const [exitCode]=await once(duplicate,'exit');assert.equal(exitCode,0);assert.match(duplicateOutput,/already running/);assert.ok(duplicateOutput.includes(base));
  const javascript=await fetch(base+'/app.mjs');assert.match(javascript.headers.get('content-type'),/javascript/);
  const audio=await fetch(base+'/assets/music/000.ogg',{headers:{Range:'bytes=0-3'}});assert.equal(audio.status,206);assert.equal(await audio.text(),'OggS');assert.match(audio.headers.get('content-range'),/^bytes 0-3\//);
  const data=await fetch(base+'/data/catalog.json',{headers:{'Accept-Encoding':'gzip'}});assert.equal(data.status,200);assert.equal(data.headers.get('content-encoding'),'gzip');assert.ok((await data.json()).units.length>800);
  const invalid=await fetch(base+'/assets/music/000.ogg',{headers:{Range:'bytes=9999999999-'}});assert.equal(invalid.status,416);
  const outside=await fetch(base+'/%2e%2e%5cREADME.md');assert.ok([400,403,404].includes(outside.status));
});

test('an unrelated occupied port is left running and BCU selects another port',async t=>{
  const occupied=http.createServer((req,res)=>res.end('Another application'));
  occupied.listen(0,'127.0.0.1');await once(occupied,'listening');t.after(()=>occupied.close());
  const port=occupied.address().port;
  const child=spawn(process.execPath,['scripts/serve.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());let output='';
  const base=await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{output+=chunk;const match=/BCU Web: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);if(match)resolve(match[1]);});child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code)));});
  assert.notEqual(new URL(base).port,String(port));assert.match(output,/occupied; trying/);
  assert.equal(await(await fetch(`http://127.0.0.1:${port}`)).text(),'Another application');
  assert.equal((await fetch(base)).status,200);
});
