// Native BCU PackLoader interoperability. This is the original .pack.bcuzip container,
// not a ZIP archive: MD5 signature/key, little-endian descriptor length and AES-CBC.
const utf8=new TextEncoder(),textDecoder=new TextDecoder('utf-8',{fatal:true});
const emptyIndex=()=>({data:[],order:Array(16).fill(0)});
const language=name=>({dat:[{key:'en',val:String(name??'')}]});
const pad16=n=>Math.ceil(n/16)*16;
const concat=(...arrays)=>{const result=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of arrays){result.set(a,offset);offset+=a.length;}return result;};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const fromHex=value=>Uint8Array.from(String(value).match(/../g)??[],x=>parseInt(x,16));
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);

export function md5(input){
  const bytes=typeof input==='string'?utf8.encode(input):new Uint8Array(input),length=pad16(Math.ceil((bytes.length+9)/64)*64),data=new Uint8Array(length);data.set(bytes);data[bytes.length]=128;
  const view=new DataView(data.buffer);view.setUint32(length-8,(bytes.length*8)>>>0,true);view.setUint32(length-4,Math.floor(bytes.length/0x20000000),true);
  const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21],constants=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0);
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  for(let offset=0;offset<length;offset+=64){let a=a0,b=b0,c=c0,d=d0;for(let i=0;i<64;i++){let f,g;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}const n=(a+f+constants[i]+view.getUint32(offset+g*4,true))>>>0,s=shifts[(i>>>4)*4+i%4];a=d;d=c;c=b;b=(b+((n<<s)|(n>>>(32-s))))>>>0;}a0=(a0+a)>>>0;b0=(b0+b)>>>0;c0=(c0+c)>>>0;d0=(d0+d)>>>0;}
  const result=new Uint8Array(16),out=new DataView(result.buffer);[a0,b0,c0,d0].forEach((x,i)=>out.setUint32(i*4,x,true));return result;
}
const signature=md5('battlecatsultimate');
async function cryptoKey(bytes){if(!globalThis.crypto?.subtle)throw new Error('Native BCU packs require Web Crypto. Open this app on localhost or HTTPS.');return crypto.subtle.importKey('raw',bytes,{name:'AES-CBC'},false,['encrypt','decrypt']);}
async function encryptRaw(bytes,key){if(!bytes.length)return new Uint8Array();const padded=new Uint8Array(pad16(bytes.length));padded.set(bytes);const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:signature},key,padded));return encrypted.slice(0,-16);}
async function decryptRaw(bytes,key){if(!bytes.length)return new Uint8Array();if(bytes.length%16)throw new Error('BCU encrypted data is not aligned to an AES block.');const finalBlock=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:bytes.slice(-16)},key,new Uint8Array()));return new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:signature},key,concat(bytes,finalBlock)));}
function safePackPath(path){if(typeof path!=='string'||!path.length||path.includes('\\')||path.includes('\0'))throw new Error('Invalid file path in BCU pack.');const relative=path.replace(/^\.\//,'');if(relative.startsWith('/')||/^[A-Za-z]:/.test(relative)||relative.split('/').some(x=>!x||x==='.'||x==='..'))throw new Error('Invalid file path in BCU pack: '+path);return relative;}

export async function decodeNativePack(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length<36||!equal(bytes.subarray(0,16),signature))throw new Error('This file does not have the original BCU pack signature.');
  const keyBytes=bytes.slice(16,32),key=await cryptoKey(keyBytes),descriptorSize=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(32,true),payloadOffset=36+pad16(descriptorSize);
  if(!descriptorSize||descriptorSize>bytes.length-36||payloadOffset>bytes.length)throw new Error('BCU pack descriptor length is invalid.');
  const descriptor=JSON.parse(textDecoder.decode((await decryptRaw(bytes.slice(36,payloadOffset),key)).slice(0,descriptorSize)));
  if(!descriptor.desc||typeof descriptor.desc.id!=='string'||!Array.isArray(descriptor.files))throw new Error('BCU pack descriptor is incomplete.');
  const files=new Map();for(const entry of descriptor.files){const path=safePackPath(entry.path),size=entry.size,offset=entry.offset;if(!Number.isInteger(size)||size<0||!Number.isInteger(offset)||offset<0||offset%16||payloadOffset+offset+pad16(size)>bytes.length)throw new Error('Invalid BCU file bounds: '+path);if(files.has(path))throw new Error('Duplicate BCU file path: '+path);const plaintext=await decryptRaw(bytes.slice(payloadOffset+offset,payloadOffset+offset+pad16(size)),key);files.set(path,plaintext.slice(0,size));}
  if(!files.has('pack.json'))throw new Error('The BCU pack contains no pack.json.');const document=JSON.parse(textDecoder.decode(files.get('pack.json')));if(!document.desc||document.desc.id!==descriptor.desc.id)throw new Error('The BCU pack ID does not match its descriptor.');
  return {descriptor,document,files,keyBytes,bytes};
}

export async function encodeNativePack(desc,files,password=''){
  if(!desc||typeof desc.id!=='string')throw new Error('A native BCU pack descriptor is required.');
  const entries=files instanceof Map?[...files]:Object.entries(files);let offset=0;const prepared=[];
  for(const [rawPath,value]of entries){const path=safePackPath(rawPath),data=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value instanceof Uint8Array?value:utf8.encode(String(value));prepared.push({path,data,size:data.length,offset});offset+=pad16(data.length);}
  if(!prepared.some(f=>f.path==='pack.json'))throw new Error('A native BCU pack requires pack.json.');
  const descriptor={desc:structuredClone(desc),files:prepared.map(({path,size,offset})=>({path:'./'+path,size,offset}))},json=utf8.encode(JSON.stringify(descriptor)),length=new Uint8Array(4);new DataView(length.buffer).setUint32(0,json.length,true);
  const keyBytes=md5(password),key=await cryptoKey(keyBytes),blocks=[signature,keyBytes,length,await encryptRaw(json,key)];for(const file of prepared)blocks.push(await encryptRaw(file.data,key));return concat(...blocks);
}

export function createEmptyPack(id,author='',name=''){
  const pack={};for(const key of ['traits','enemies','randEnemies','unitLevels','units','souls','demonSouls','bgs','groups','lvrs','musics','combos'])pack[key]=emptyIndex();
  pack.desc={BCU_VERSION:'0.7.19.1',id,author,names:language(name),desc:'',time:null,version:0,allowAnim:false,parentPassword:null,dependency:[]};pack.castles=emptyIndex();pack.mc={maps:emptyIndex(),si:[]};return pack;
}
const displayName=(value,fallback='')=>value?.names?.dat?.find(x=>x.key==='en')?.val??value?.names?.dat?.find(x=>x.val)?.val??value?.name??fallback;
function setName(value,name){value.names??={dat:[]};const entry=value.names.dat.find(x=>x.key==='en');if(entry)entry.val=String(name);else value.names.dat.push({key:'en',val:String(name)});}
function indexEntries(index){const data=index?.data??[],byId=new Map(data.map(e=>[e.ind,e]));const order=(index?.order??[]).slice(0,data.length);return order.length===data.length&&new Set(order).size===order.length&&order.every(id=>byId.has(id))?order.map(id=>byId.get(id)):data;}
function removeIndex(index,id){index.data=index.data.filter(x=>x.ind!==id);const order=(index.order??[]).filter((x,i,a)=>index.data.some(d=>d.ind===x)&&a.indexOf(x)===i);for(const entry of index.data)if(!order.includes(entry.ind))order.push(entry.ind);index.order=[...order,...Array(Math.max(16,order.length)-order.length).fill(0)];}
function packId(){const alphabet='abcdefghijklmnopqrstuvwxyz0123456789';return [...crypto.getRandomValues(new Uint8Array(8))].map(x=>alphabet[x%alphabet.length]).join('');}
function ui(api,name){const page=api.layouts?.pages?.[name]??{},spec=new Map((page.resolvedWidgets??page.widgets??[]).map(x=>[x.id,x]));return {bounds:id=>page.defaultPlacements?.[id]??[0,0,0,0],button(id,fn,options={}){const w=spec.get(id)??{};return api.button(w.localeKey??id,page.defaultPlacements?.[id]??[0,0,0,0],fn,{text:w.text||id,...options});},label(id){const w=spec.get(id)??{};return api.label(w.text??'',page.defaultPlacements?.[id]??[0,0,0,0]);}};}
function unavailable(button,text){button.disabled=true;button.title=text;return button;}
async function saveNative(pack,api){if(!pack.native)throw new Error('This item has no original BCU pack document.');pack.id=pack.native.desc.id;pack.name=displayName(pack.native.desc,pack.id);pack.author=pack.native.desc.author;const path=pack.files?.['pack.json']??'packs/'+pack.id+'/pack.json';pack.files??={};pack.files['pack.json']=path;await api.storage.write('file:'+path,new Blob([JSON.stringify(pack.native)],{type:'application/json'}));await api.save();}

export async function importNativePack(file,api){
  const result=await decodeNativePack(await file.arrayBuffer()),id=result.descriptor.desc.id,existing=api.state.packs.find(p=>p.id===id);
  if(existing&&!await api.message('Confirm','A pack with ID '+id+' already exists. Replace it?',{cancel:true}))return null;
  const pack={id,name:displayName(result.document.desc,id),author:result.document.desc.author,native:result.document,descriptor:result.descriptor.desc,editable:false,files:{},keyHash:hex(result.keyBytes),useCombos:true,original:'packs/'+id+'/.original.pack.bcuzip'};
  for(const [path,data]of result.files){const stored='packs/'+id+'/'+path;await api.storage.write('file:'+stored,new Blob([data]));pack.files[path]=stored;}
  await api.storage.write('file:'+pack.original,new Blob([result.bytes],{type:'application/octet-stream'}));if(existing)api.state.packs.splice(api.state.packs.indexOf(existing),1,pack);else api.state.packs.push(pack);await api.save();return pack;
}

export async function loadPackIntoEngine(pack,api){
  await api.ensureEngine?.();if(!api.engine?.loadPackJson||!api.engine.registerPackAsset)throw new Error('Native pack loading requires the initialized TeaVM battle engine.');
  const urls=[];
  for(const [path,stored]of Object.entries(pack.files??{})){const blob=await api.storage.read('file:'+stored);if(!(blob instanceof Blob))throw new Error('Pack file is missing: '+path);const bytes=new Uint8Array(await blob.arrayBuffer()),url=URL.createObjectURL(blob);urls.push(url);let text=null,width=0,height=0;if(bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);width=view.getUint32(16);height=view.getUint32(20);}else if(!bytes.includes(0))try{text=textDecoder.decode(bytes);}catch{}api.engine.registerPackAsset(pack.id,'./'+safePackPath(path),url,text,width,height,bytes.length);}
  try{return JSON.parse(api.engine.loadPackJson(JSON.stringify(pack.native)));}catch(error){for(const url of urls)URL.revokeObjectURL(url);throw error;}
}

async function exportPack(pack,api){
  if(!pack?.native)return;
  if(!pack.editable&&pack.original){const original=await api.storage.read('file:'+pack.original);if(original){api.download(original,pack.id+'.pack.bcuzip');return;}}
  const password=await api.message('Export','Password for unpacking this pack',{input:'',cancel:true});if(password===null)return;
  await saveNative(pack,api);const files=new Map();for(const [path,stored]of Object.entries(pack.files)){const blob=await api.storage.read('file:'+stored);if(!(blob instanceof Blob))throw new Error('Missing pack file: '+path);files.set(path,new Uint8Array(await blob.arrayBuffer()));}
  const desc=structuredClone(pack.native.desc);const bytes=await encodeNativePack(desc,files,password);api.download(new Blob([bytes],{type:'application/octet-stream'}),pack.id+'.pack.bcuzip');
}

export async function renderPacks(api){
  api.backButton();const page=ui(api,'PackEditPage');let selected=null,enemy=null,map=null,sourceAnimation=null,parent=null;const controls=[];
  for(const id of ['lbp','lbe','lbd','lbs','lbr','lbt'])page.label(id);
  const packs=api.list(page.bounds('jspp'),api.state.packs,p=>selectPack(p),{render:p=>displayName(p.native?.desc,p.name??p.id)+' - '+p.id});
  const enemies=api.list(page.bounds('jspe'),[],entry=>{enemy=entry;enemyName.value=displayName(entry.val,String(entry.ind));},{render:e=>String(e.ind).padStart(3,'0')+' '+displayName(e.val)});
  const maps=api.list(page.bounds('jsps'),[],entry=>{map=entry;mapName.value=displayName(entry.val,String(entry.ind));},{render:m=>String(m.ind).padStart(3,'0')+' '+displayName(m.val)});
  const animations=api.list(page.bounds('jspd'),api.state.animations,item=>sourceAnimation=item,{render:a=>a.name});
  const parents=api.list(page.bounds('jspr'),[],()=>{},{render:p=>displayName(p.native?.desc,p.name??p.id)});
  const candidates=api.list(page.bounds('jspt'),api.state.packs,p=>parent=p,{render:p=>displayName(p.native?.desc,p.name??p.id)});
  const name=api.input('',page.bounds('jtfp'),async value=>{if(selected?.editable){setName(selected.native.desc,value.trim());await saveNative(selected,api);packs.setItems(api.state.packs,api.state.packs.indexOf(selected));}});
  const enemyName=api.input('',page.bounds('jtfe'),async value=>{if(selected?.editable&&enemy){setName(enemy.val,value.trim());await saveNative(selected,api);enemies.setItems(indexEntries(selected.native.enemies));}});
  const mapName=api.input('',page.bounds('jtfs'),async value=>{if(selected?.editable&&map){setName(map.val,value.trim());await saveNative(selected,api);maps.setItems(indexEntries(selected.native.mc.maps));}});
  api.input('',page.bounds('searchp'),value=>packs.setItems(api.state.packs.filter(p=>(p.name+' '+p.id).toLowerCase().includes(value.toLowerCase()))));
  const idLabel=api.label('',page.bounds('pid')),authorLabel=api.label('',page.bounds('pauth')),coreLabel=api.label('',page.bounds('pcore')),animationLabel=api.label('',page.bounds('animall'));
  const combo=page.button('cmbo',async button=>{if(selected){selected.useCombos=button.getAttribute('aria-pressed')==='true';await api.save();}},{toggle:true,selected:true});
  page.button('addp',async()=>{const id=packId(),native=createEmptyPack(id,api.state.config.author,'');const pack={id,name:id,author:api.state.config.author,native,editable:true,files:{},useCombos:true};api.state.packs.push(pack);await saveNative(pack,api);packs.setItems(api.state.packs,api.state.packs.length-1);candidates.setItems(api.state.packs);selectPack(pack);});
  page.button('remp',async()=>{if(!selected)return;if(!await api.message('Confirm','This action cannot be undone. Are you sure to delete?',{cancel:true}))return;for(const stored of Object.values(selected.files??{}))await api.storage.remove('file:'+stored);if(selected.original)await api.storage.remove('file:'+selected.original);api.state.packs.splice(api.state.packs.indexOf(selected),1);await api.save();packs.setItems(api.state.packs);candidates.setItems(api.state.packs);selectPack(null);});
  const exportButton=page.button('extr',()=>selected&&exportPack(selected,api));
  const unpack=page.button('unpk',async()=>{if(!selected?.native||selected.editable)return;const password=await api.message('Unpack','Input password',{input:'',cancel:true});if(password===null)return;if(hex(md5(password))!==selected.keyHash)throw new Error('Password does not match.');selected.editable=true;await saveNative(selected,api);selectPack(selected);});
  const validate=page.button('vali',async()=>{if(!selected)return;const result=await loadPackIntoEngine(selected,api);await api.message('Pack validation',JSON.stringify(result));});
  const addEnemy=page.button('adde',async()=>{await addFromAnimation('enemy');});controls.push(addEnemy);
  controls.push(page.button('reme',async()=>{if(!selected||!enemy)return;if(!await api.message('Confirm','Remove this enemy?',{cancel:true}))return;removeIndex(selected.native.enemies,enemy.ind);enemy=null;await saveNative(selected,api);selectPack(selected);}));
  const edit=page.button('edit',()=>selected&&enemy&&api.navigate('packEditor',{packId:selected.id,kind:'enemy',index:enemy.ind}));
  controls.push(page.button('adds',async()=>{if(!selected)return;await loadPackIntoEngine(selected,api);if(!api.engine.addPackMap)throw new Error('Original map creation is unavailable.');selected.native=JSON.parse(api.engine.addPackMap(selected.id));await saveNative(selected,api);selectPack(selected);}));
  controls.push(page.button('rems',async()=>{if(!selected||!map)return;if(!await api.message('Confirm','Remove this map and its stages?',{cancel:true}))return;removeIndex(selected.native.mc.maps,map.ind);selected.native.mc.si=(selected.native.mc.si??[]).filter(s=>s.st?.pack!==selected.id+'/'+map.ind);map=null;await saveNative(selected,api);selectPack(selected);}));
  const stages=page.button('sdiy',()=>selected&&map&&api.navigate('packEditor',{packId:selected.id,kind:'stages',index:map.ind}));
  const units=page.button('cunt',()=>selected&&api.navigate('packEditor',{packId:selected.id,kind:'units'}));
  controls.push(page.button('addr',async()=>{if(!selected?.editable||!parent||selected===parent)return;if(parent.native?.desc?.parentPassword){const value=await api.message('Parent password','Input parent password',{input:'',cancel:true});if(value===null)return;if(!equal(md5(value),new Uint8Array(parent.native.desc.parentPassword)))throw new Error('Parent password does not match.');}const deps=selected.native.desc.dependency??=[];if(!deps.includes(parent.id))deps.push(parent.id);await saveNative(selected,api);selectPack(selected);}));
  controls.push(page.button('remr',async()=>{if(!selected?.editable)return;const current=parents.getSelected();if(!current)return;selected.native.desc.dependency=(selected.native.desc.dependency??[]).filter(id=>id!==current.id);await saveNative(selected,api);selectPack(selected);}));
  for(const [id,title]of [['erea','Animation reassignment'],['vene','Native enemy animation viewing'],['ener','Random enemy editing'],['vbgr','Custom background editing'],['vcas','Custom castle editing'],['vrcg','Character restrictions'],['vrlr','Level restrictions'],['vmsc','Custom audio editing'],['ccmb','Custom combo editing'],['tdiy','Custom trait editing'],['csol','Custom soul editing'],['recd','Pack replay management']])unavailable(page.button(id),title+' is not ported yet.');
  api.button('import',[250,0,200,50],async()=>{const file=await api.pickFile('.pack.bcuzip,.bcuzip');if(!file)return;const pack=await importNativePack(file,api);if(pack){packs.setItems(api.state.packs,api.state.packs.indexOf(pack));candidates.setItems(api.state.packs);selectPack(pack);}});
  function selectPack(pack){selected=pack;enemy=map=null;name.value=pack?displayName(pack.native?.desc,pack.name??''):'';name.disabled=!pack?.editable;enemyName.value=mapName.value='';enemyName.disabled=mapName.disabled=!pack?.editable;enemies.setItems(indexEntries(pack?.native?.enemies));maps.setItems(indexEntries(pack?.native?.mc?.maps));parents.setItems((pack?.native?.desc?.dependency??[]).map(id=>api.state.packs.find(p=>p.id===id)??{id,name:id}));idLabel.textContent=pack?'ID: '+pack.id:'';authorLabel.textContent=pack?'Author: '+(pack.native?.desc?.author??''):'';coreLabel.textContent=pack?'Core: '+(pack.native?.desc?.BCU_VERSION??''):'';animationLabel.textContent=pack?'Allow animation use: '+Boolean(pack.native?.desc?.allowAnim):'';for(const control of controls)control.disabled=!pack?.editable;exportButton.disabled=unpack.disabled=validate.disabled=!pack?.native;unpack.disabled=unpack.disabled||pack.editable;edit.disabled=stages.disabled=units.disabled=!pack?.native;combo.disabled=!pack;combo.setAttribute('aria-pressed',String(pack?.useCombos!==false));}
  async function addFromAnimation(kind){if(!selected?.editable||!sourceAnimation)throw new Error('Select a pack and a custom animation first.');await embedAnimation(selected,sourceAnimation,api);await loadPackIntoEngine(selected,api);const fn=kind==='enemy'?api.engine.addPackEnemy:api.engine.addPackUnit;if(!fn)throw new Error('Original entity creation is unavailable.');selected.native=JSON.parse(fn(selected.id,sourceAnimation.id));await saveNative(selected,api);selectPack(selected);}
  selectPack(api.state.packs[0]??null);
}

async function embedAnimation(pack,animation,api){
  const files=animation.files??{};const source=Object.keys(files).length?null:animation.source;
  const sourcePaths=source?[source.sprite,source.imgcut,source.mamodel,...(source.maanim??[])]:Object.keys(files);
  const destinations=['sprite.png','imgcut.txt','mamodel.txt','maanim_walk.txt','maanim_idle.txt','maanim_attack.txt','maanim_kb.txt','maanim_burrow_down.txt','maanim_burrow_move.txt','maanim_burrow_up.txt'];
  const sorted=source?sourcePaths:[Object.keys(files).find(n=>n.endsWith('.png')),Object.keys(files).find(n=>n.endsWith('.imgcut')),Object.keys(files).find(n=>n.endsWith('.mamodel')),...Object.keys(files).filter(n=>n.endsWith('.maanim')).sort()];
  for(let i=0;i<sorted.length;i++){const name=sorted[i];if(!name)continue;let blob;if(source){const response=await fetch(api.assetPath(name));if(!response.ok)throw new Error('Missing animation asset: '+name);blob=await response.blob();}else blob=await api.storage.read('file:'+files[name]);if(!(blob instanceof Blob))throw new Error('Missing custom animation file: '+name);const path='animations/'+animation.id+'/'+destinations[i],stored='packs/'+pack.id+'/'+path;pack.files[path]=stored;await api.storage.write('file:'+stored,blob);}
  const original=animation.source?api.catalog.units.flatMap(u=>u.forms).find(f=>f.animation?.sprite===animation.source.sprite):null;
  if(original)for(const [name,url]of [['icon_deploy.png',original.icon],['icon_display.png',original.editorIcon??original.icon]])if(url){const response=await fetch(api.assetPath(url));if(response.ok){const path='animations/'+animation.id+'/'+name,stored='packs/'+pack.id+'/'+path;pack.files[path]=stored;await api.storage.write('file:'+stored,await response.blob());}}
  await saveNative(pack,api);
}
