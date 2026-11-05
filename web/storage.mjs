const DB_NAME = 'bcu-web';
const DB_VERSION = 1;
let database;
export async function openStorage(){
  database = await new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>request.result.createObjectStore('workspace');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  return read('state');
}
function transaction(mode,callback){return new Promise((resolve,reject)=>{
  const tx=database.transaction('workspace',mode);let result;
  try{result=callback(tx.objectStore('workspace'));}catch(error){reject(error);return;}
  tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
});}
export function read(key){return transaction('readonly',store=>store.get(key));}
export function write(key,value){return transaction('readwrite',store=>store.put(value,key));}
export function remove(key){return transaction('readwrite',store=>store.delete(key));}
export async function listFiles(){return (await transaction('readonly',store=>store.getAllKeys())).filter(x=>String(x).startsWith('file:')).map(x=>x.slice(5));}
export async function exportWorkspace(state){
  const files={};
  for(const name of await listFiles()){
    const blob=await read('file:'+name);
    const bytes=new Uint8Array(await blob.arrayBuffer());
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    files[name]={type:blob.type,base64:btoa(binary)};
  }
  return {format:'bcu-web-workspace',version:1,state:structuredClone(state),files};
}
export async function importWorkspace(value){
  if(value?.format!=='bcu-web-workspace'||value.version!==1||!value.state||typeof value.state!=='object'||!value.files||typeof value.files!=='object')throw new Error('This is not a BCU Web workspace backup.');
  const decoded=[];
  for(const [path,file] of Object.entries(value.files)){
    if(!safePath(path)||typeof file?.base64!=='string')throw new Error('Invalid workspace file.');
    const bytes=Uint8Array.from(atob(file.base64),x=>x.charCodeAt(0));
    decoded.push(['file:'+path,new Blob([bytes],{type:String(file.type||'application/octet-stream')})]);
  }
  await transaction('readwrite',store=>{store.put(value.state,'state');for(const [key,blob]of decoded)store.put(blob,key);});
  return value.state;
}
export function safePath(path){return typeof path==='string'&&path.length>0&&path.length<1024&&!path.startsWith('/')&&!path.includes('\\')&&!path.includes('\0')&&!path.split('/').some(x=>x==='..'||x==='.');}
