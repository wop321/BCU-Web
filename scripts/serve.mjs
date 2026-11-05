import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../web/',import.meta.url)));
const port=Number(process.env.PORT||5173);
if(!Number.isInteger(port)||port<0||port>65535){console.error('PORT must be an integer from 0 to 65535.');process.exit(1);}
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wav':'audio/wav','.otf':'font/otf','.wasm':'application/wasm','.map':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const url=new URL(req.url,'http://localhost');
    let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{res.writeHead(400).end();return;}
    if(pathname.includes('\0')||pathname.includes('\\')){res.writeHead(400).end();return;}
    let file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    let info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return;}
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
    if(!req.headers.range&&/\bgzip\b/.test(req.headers['accept-encoding']??'')&&file.endsWith('.json')){
      const compressed=await stat(file+'.gz').catch(()=>null);
      if(compressed?.isFile()&&compressed.mtimeMs>=info.mtimeMs){file+='.gz';info=compressed;headers['Content-Encoding']='gzip';headers.Vary='Accept-Encoding';}
    }
    if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      const suffix=!match[1];const start=suffix?Math.max(0,info.size-Number(match[2])):Number(match[1]);const end=suffix?info.size-1:Math.min(info.size-1,match[2]?Number(match[2]):info.size-1);
      if(!Number.isSafeInteger(start)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);
    }else{res.writeHead(200,{...headers,'Content-Length':info.size});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);}
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500,{'Content-Type':'text/plain'}).end(error.code==='ENOENT'?'Not found':'Could not read file');}
});
// Reuse a matching BCU preview to preserve its IndexedDB origin. Leave other apps running.
async function isExistingPreview(candidate){
  try{
    const expected=await readFile(path.join(root,'index.html'));
    return await new Promise(resolve=>{
      const request=http.get({hostname:'127.0.0.1',port:candidate,path:'/index.html',timeout:1500},response=>{
        const chunks=[];let size=0;
        response.on('data',chunk=>{size+=chunk.length;if(size>expected.length){response.destroy();resolve(false);}else chunks.push(chunk);});
        response.on('end',()=>resolve(response.statusCode===200&&Buffer.concat(chunks).equals(expected)));
        response.on('error',()=>resolve(false));
      });
      request.on('timeout',()=>{request.destroy();resolve(false);});request.on('error',()=>resolve(false));
    });
  }catch{return false;}
}
let candidate=port,attempts=0;
server.on('error',async error=>{
  if(error.code==='EADDRINUSE'&&candidate!==0){
    if(await isExistingPreview(candidate)){console.log(`BCU Web is already running: http://127.0.0.1:${candidate}`);return;}
    if(++attempts<10&&candidate<65535){console.log(`Port ${candidate} is occupied; trying ${candidate+1}. Browser saves are separate for each port.`);candidate++;listen();return;}
  }
  console.error(`Could not start BCU Web: ${error.message}`);process.exitCode=1;
});
server.on('listening',()=>console.log(`BCU Web: http://127.0.0.1:${server.address().port}`));
function listen(){server.listen(candidate,'127.0.0.1');}
listen();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
