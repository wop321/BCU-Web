// Browser editors for the original BCU text formats. Rendering stays in the TeaVM engine.
const routes={sprite:'spriteEditor',model:'modelEditor',animation:'animationEditor'};
const modifications=['0 parent','1 id','2 sprite','3 z-order','4 pos-x','5 pos-y','6 pivot-x','7 pivot-y','8 scale','9 scale-x','10 scale-y','11 angle','12 opacity','13 horizontal flip','14 vertical flip','50 extendX','52 extendY','53 scale mult'];
const modelColumns=['id','parent','img','z-order','pos-x','pos-y','pivot-x','pivot-y','scale-x','scale-y','angle','opacity','glow','name'];
const cutsColumns=['id','x','y','width','height','name'];
const tracksColumns=['part id','modification','loop','name'];
const movesColumns=['frame','value','easing','parameter'];
const integer=(value,name='value')=>{const n=Number(String(value).trim());if(!Number.isInteger(n)||Math.abs(n)>2147483647)throw new Error(name+' must be a 32-bit integer.');return n;};
const cleanName=value=>String(value??'').replace(/[\r\n,]/g,' ').trim();
const storedName=value=>String(value??'').replace(/[\r\n]/g,' ');
const lines=text=>String(text).replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');
const row=(text,count)=>{const values=String(text??'').split(',');if(values.length<count)throw new Error('Incomplete BCU data row.');return {values:values.slice(0,count).map(x=>integer(x)),name:values.slice(count).join(',')};};
const count=value=>{const n=integer(value,'Row count');if(n<0||n>100000)throw new Error('Invalid row count.');return n;};

export function parseImgCut(text){const l=lines(text);if(!/imgcut/.test(l[0]))throw new Error('Not an image-cut file.');let p=4;const n=count(l[3]),cuts=[];for(let i=0;i<n;i++)cuts.push(row(l[p++],4));return {header:l.slice(0,2),image:l[2],cuts,tail:l.slice(p)};}
export function serializeImgCut(c){return [...c.header,c.image,c.cuts.length,...c.cuts.map(r=>r.values.join(',')+(r.name?','+storedName(r.name):'')),...c.tail].join('\n');}
export function parseMaModel(text){const l=lines(text);if(!/mamodel|modelanim:model/.test(l[0]))throw new Error('Not a model file.');let p=3;const n=count(l[2]),parts=[];for(let i=0;i<n;i++)parts.push(row(l[p++],13));const units=row(l[p++],3).values;const m=count(l[p++]),configs=[];for(let i=0;i<m;i++)configs.push(row(l[p++],6));return {header:l.slice(0,2),parts,units,configs,tail:l.slice(p)};}
export function serializeMaModel(m){return [...m.header,m.parts.length,...m.parts.map(r=>r.values.join(',')+','+storedName(r.name)),m.units.join(','),m.configs.length,...m.configs.map(r=>r.values.join(',')+','+storedName(r.name)),...m.tail].join('\n');}
export function parseMaAnim(text){const l=lines(text);if(!/maanim|modelanim:animation/.test(l[0]))throw new Error('Not an animation file.');let p=3;const n=count(l[2]),tracks=[];for(let i=0;i<n;i++){const r=row(l[p++],5),nMoves=count(l[p++]);r.moves=[];for(let j=0;j<nMoves;j++)r.moves.push(row(l[p++],4).values);tracks.push(r);}return {header:l.slice(0,2),tracks,tail:l.slice(p)};}
export function serializeMaAnim(a){return [...a.header,a.tracks.length,...a.tracks.flatMap(r=>[r.values.join(',')+','+storedName(r.name),r.moves.length,...r.moves.map(m=>m.join(','))]),...a.tail].join('\n');}

export function validateDocuments(d){
  for(const [i,cut]of d.cut.cuts.entries()){const [x,y,w,h]=cut.values;if(x<0||y<0||w<1||h<1)throw new Error('Sprite '+i+' requires nonnegative coordinates and positive dimensions.');if(d.image&&(x+w>d.image.naturalWidth||y+h>d.image.naturalHeight))throw new Error('Sprite '+i+' extends outside the image.');}
  const ps=d.model.parts;
  for(let i=0;i<ps.length;i++){
    const parent=ps[i].values[0],image=ps[i].values[2];
    if(parent < -1||parent>=ps.length||parent===i)throw new Error('Invalid parent on model part '+i+'.');
    if(image < -1||image>=d.cut.cuts.length)throw new Error('Invalid sprite on model part '+i+'.');
    const seen=new Set([i]);let p=parent;while(p>=0){if(seen.has(p))throw new Error('Model parent cycle at part '+i+'.');seen.add(p);p=ps[p].values[0];}
  }
  for(const a of d.animations)for(const track of a.data.tracks){if(track.values[0]<0||track.values[0]>=ps.length)throw new Error('An animation refers to an absent model part.');let previous=-Infinity;for(const move of track.moves){if(move[0]<previous)throw new Error('Keyframes must be sorted by frame.');previous=move[0];if(track.values[1]===2&&(move[1]<0||move[1]>=d.cut.cuts.length))throw new Error('An animation refers to an absent sprite.');}}
}

function layout(api,name){const spec=api.layouts?.pages?.[name]??{};const map=new Map((spec.resolvedWidgets??spec.widgets??[]).map(w=>[w.id,w]));return {bounds:(id,fallback)=>spec.defaultPlacements?.[id]??fallback,button(id,fn,options={}){const w=map.get(id)??{};return api.button(w.localeKey??id,spec.defaultPlacements?.[id]??[0,0,0,0],fn,{text:w.text||id,...options});}};}
function disabled(button,title){button.disabled=true;button.title=title;return button;}
function showError(api,error){return api.message('Error',String(error?.message??error));}
function safe(api,fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(error=>showError(api,error));}
const filename=path=>decodeURIComponent(String(path).split('/').at(-1));
const extension=name=>String(name).split('.').at(-1).toLowerCase();
const newBlob=text=>new Blob([text],{type:'text/plain;charset=utf-8'});

async function materialize(custom,api){
  if(!custom.source||custom.materialized)return;
  custom.files??={};
  const source=custom.source,paths=[source.sprite,source.imgcut,source.mamodel,...(source.maanim??source.animations??[])].filter(Boolean).map(p=>typeof p==='string'?p:p.path);
  const downloaded=await Promise.all(paths.map(async path=>{const response=await fetch(api.assetPath(path));if(!response.ok)throw new Error('Cannot copy '+path+' ('+response.status+').');return [filename(path),await response.blob()];}));
  for(const [name,blob]of downloaded){const path='animations/'+custom.id+'/'+name;await api.storage.write('file:'+path,blob);custom.files[name]=path;}
  custom.materialized=true;await api.save();
}
async function readFile(custom,name,api){const path=custom.files?.[name];if(!path)throw new Error('Missing '+name);const value=await api.storage.read('file:'+path);if(!(value instanceof Blob))throw new Error('The animation file '+name+' is missing from browser storage.');return value;}
async function loadDocuments(custom,api){
  await materialize(custom,api);
  const names=Object.keys(custom.files??{}),cutName=names.find(n=>extension(n)==='imgcut'),modelName=names.find(n=>extension(n)==='mamodel');
  if(!cutName||!modelName)throw new Error('Import a PNG, .imgcut, .mamodel and at least one .maanim file, or copy a complete animation from the viewer.');
  const cut=parseImgCut(await(await readFile(custom,cutName,api)).text()),model=parseMaModel(await(await readFile(custom,modelName,api)).text());
  const spriteName=names.find(n=>n===cut.image)||names.find(n=>extension(n)==='png');if(!spriteName)throw new Error('This animation has no PNG sprite.');
  const spriteBlob=await readFile(custom,spriteName,api),spriteURL=URL.createObjectURL(spriteBlob),image=new Image();image.src=spriteURL;
  try{await image.decode();}catch(error){URL.revokeObjectURL(spriteURL);throw new Error('The sprite PNG could not be decoded.');}
  api.addCleanup(()=>URL.revokeObjectURL(spriteURL));
  const animations=await Promise.all(names.filter(n=>extension(n)==='maanim').sort().map(async name=>({name,data:parseMaAnim(await(await readFile(custom,name,api)).text())})));
  if(!animations.length)animations.push({name:spriteName.replace(/\.png$/i,'00.maanim'),data:{header:['[maanim]','1'],tracks:[],tail:['']}});
  return {custom,cutName,modelName,spriteName,spriteBlob,spriteURL,image,cut,model,animations};
}
async function persist(d,api){
  const files=[[d.cutName,newBlob(serializeImgCut(d.cut))],[d.modelName,newBlob(serializeMaModel(d.model))],...d.animations.map(a=>[a.name,newBlob(serializeMaAnim(a.data))])];
  for(const [name,blob]of files){const path=d.custom.files[name]??'animations/'+d.custom.id+'/'+name;d.custom.files[name]=path;await api.storage.write('file:'+path,blob);}
  await api.save();
}
function snapshot(d){return structuredClone({cut:d.cut,model:d.model,animations:d.animations});}
function restore(d,s){d.cut=s.cut;d.model=s.model;d.animations=s.animations;}

function editableTable(api,bounds,columns,getRows,onEdit,onSelect,{readonly=[]}={}){
  const wrap=api.element('div',undefined,'table-wrap'),table=api.element('table'),head=api.element('thead'),body=api.element('tbody'),tr=api.element('tr');
  for(const label of columns)tr.append(api.element('th',label));head.append(tr);table.append(head,body);wrap.append(table);let selection=-1;
  function select(index,notify=true){selection=index;[...body.children].forEach((row,i)=>row.classList.toggle('selected',i===index));if(notify)onSelect?.(index);}
  function draw(){body.replaceChildren();getRows().forEach((values,index)=>{const row=api.element('tr');if(index===selection)row.classList.add('selected');values.forEach((value,column)=>{const cell=api.element('td',String(value??''));cell.tabIndex=0;cell.addEventListener('click',()=>select(index));if(!readonly.includes(column)){cell.contentEditable='true';cell.spellcheck=false;cell.addEventListener('focus',()=>{cell.dataset.original=cell.textContent;select(index);});cell.addEventListener('blur',safe(api,async()=>{const next=cell.textContent;if(next===cell.dataset.original)return;try{await onEdit(index,column,next);cell.dataset.original=next;}catch(error){cell.textContent=cell.dataset.original;throw error;}}));cell.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();cell.blur();}else if(event.key==='Escape'){cell.textContent=cell.dataset.original;cell.blur();}});}row.append(cell);});body.append(row);});}
  wrap.draw=draw;wrap.select=select;wrap.selected=()=>selection;draw();api.place(wrap,bounds);return wrap;
}

function spritePreview(api,bounds,d,onSelect){
  const wrap=api.place(api.element('div',undefined,'preview'),bounds),canvas=api.element('canvas');wrap.append(canvas);let selected=-1,zoom=1,white=true,transform;
  function draw(){const ratio=devicePixelRatio||1,w=wrap.clientWidth,h=wrap.clientHeight;canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle=white?'#fff':'#999';c.fillRect(0,0,w,h);const scale=Math.min((w-8)/d.image.naturalWidth,(h-8)/d.image.naturalHeight)*zoom;const x=(w-d.image.naturalWidth*scale)/2,y=(h-d.image.naturalHeight*scale)/2;transform={x,y,scale};c.imageSmoothingEnabled=false;c.drawImage(d.image,x,y,d.image.naturalWidth*scale,d.image.naturalHeight*scale);for(let i=0;i<d.cut.cuts.length;i++){const [cx,cy,cw,ch]=d.cut.cuts[i].values;c.strokeStyle=i===selected?'#ff0000':'#555';c.lineWidth=i===selected?2:1;c.strokeRect(x+cx*scale,y+cy*scale,cw*scale,ch*scale);}}
  const observer=new ResizeObserver(draw);observer.observe(wrap);api.addCleanup(()=>observer.disconnect());
  canvas.addEventListener('click',event=>{if(!transform)return;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left-transform.x)/transform.scale,y=(event.clientY-r.top-transform.y)/transform.scale;for(let i=d.cut.cuts.length-1;i>=0;i--){const [cx,cy,w,h]=d.cut.cuts[i].values;if(x>=cx&&x<cx+w&&y>=cy&&y<cy+h){selected=i;onSelect?.(i);draw();break;}}});
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(.05,Math.min(30,zoom*Math.pow(.95,event.deltaY/100)));draw();},{passive:false});
  return {wrap,draw,select(i){selected=i;draw();},reset(){zoom=1;draw();},white(value){white=value;draw();}};
}

function animationPreview(api,bounds,d,{staticModel=false,onFrame}={}){
  const wrap=api.place(api.element('div',undefined,'preview'),bounds),canvas=api.element('canvas');canvas.id='custom-preview-'+crypto.randomUUID();wrap.append(canvas);let id=null,selected=0,frame=0,paused=staticModel,zoom=1,alive=true,errorBox=null;
  const paint=()=>{if(!alive||id===null)return;const ratio=devicePixelRatio||1;canvas.width=Math.max(1,Math.round(wrap.clientWidth*ratio));canvas.height=Math.max(1,Math.round(wrap.clientHeight*ratio));api.engine.renderAnimation(id,canvas.id,frame,canvas.width/2,canvas.height*.65,zoom*ratio);onFrame?.(frame);};
  function rebuild(){if(!alive)return;if(id!==null){api.engine?.disposeAnimation(id);id=null;}errorBox?.remove();if(!api.engine){errorBox=api.element('div','TeaVM engine is unavailable.','empty error');wrap.append(errorBox);return;}try{validateDocuments(d);id=api.engine.createAnimation(serializeImgCut(d.cut),serializeMaModel(d.model),staticModel?'[maanim]\n1\n0\n':serializeMaAnim(d.animations[selected]?.data??{header:['[maanim]','1'],tracks:[],tail:['']}),d.image);paint();}catch(error){errorBox=api.element('div',String(error.message??error),'empty error');wrap.append(errorBox);}}
  const timer=setInterval(()=>{if(!paused&&id!==null)frame=(frame+1)%Math.max(1,api.engine.animationLength(id));try{paint();}catch(error){paused=true;}},1000/30);
  const observer=new ResizeObserver(()=>paint());observer.observe(wrap);api.addCleanup(()=>{alive=false;clearInterval(timer);observer.disconnect();if(id!==null)api.engine?.disposeAnimation(id);});
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(.05,Math.min(30,zoom*Math.pow(.95,event.deltaY/100)));paint();},{passive:false});
  rebuild();return {wrap,canvas,rebuild,select(i){selected=i;frame=0;rebuild();},pause(value){paused=value;},frame(value){frame=Math.max(0,Number(value)||0);paint();},next(){frame++;paint();},length(){return id===null?1:api.engine.animationLength(id);},reset(){zoom=1;frame=0;paint();}};
}

function editorHeader(api,kind,custom,onUndo,onSave){
  const entries=[['undo','Undo',950,onUndo],['save','Save all',1150,onSave],['vdiy','Custom animation',1400,()=>api.navigate('customAnimations',{customId:custom?.id})],['caic','Sprite Editor',1600,()=>api.navigate('spriteEditor',{customId:custom?.id})],['camm','Model Editor',1800,()=>api.navigate('modelEditor',{customId:custom?.id})],['cama','Animation Editor',2000,()=>api.navigate('animationEditor',{customId:custom?.id})]];
  const buttons=entries.map(([key,text,x,fn])=>api.button(key,[x,0,200,50],fn,{text,disabled:kind===({vdiy:'view',caic:'sprite',camm:'model',cama:'animation'})[key]}));return {undo:buttons[0],save:buttons[1]};
}

export async function renderEditor(kind,params,api){
  let alive=true;api.addCleanup(()=>alive=false);api.backButton();const custom=api.state.animations.find(x=>x.id===params.customId),pageName={sprite:'ImgCutEditPage',model:'MaModelEditPage',animation:'MaAnimEditPage'}[kind],ui=layout(api,pageName);let d,refresh=()=>{},header;
  const history=[];header=editorHeader(api,kind,custom,async()=>{if(!d||!history.length)return;restore(d,history.pop());await persist(d,api);refresh();header.undo.disabled=history.length===0;},async()=>{if(d){await persist(d,api);await api.save(true);}});header.undo.disabled=true;
  const selectedList=api.list(ui.bounds('jspu',[50,100,300,500]),api.state.animations,item=>api.navigate(routes[kind],{customId:item.id}),{selected:api.state.animations.findIndex(x=>x===custom),render:x=>(x.group?x.group+' / ':'')+x.name});
  if(!custom){
    if(kind==='sprite'){ui.button('add',()=>importAnimation(api));disabled(ui.button('rem'), 'Select an animation first.');disabled(ui.button('copy'),'Select an animation first.');ui.button('impt',()=>importAnimation(api));}
    api.label('Select a custom animation, import original animation files, or copy an animation from the viewer.',[400,350,1700,100]);return;
  }
  try{d=await loadDocuments(custom,api);if(!alive)return;}catch(error){if(!alive)return;api.label(error.message,[400,350,1700,150]);api.button('import',[450,250,200,50],()=>importAnimation(api,{existing:custom}));return;}
  async function mutate(fn){const previous=snapshot(d);try{fn();validateDocuments(d);history.push(previous);if(history.length>50)history.shift();await persist(d,api);header.undo.disabled=false;refresh();}catch(error){restore(d,previous);refresh();throw error;}}
  const selection={cut:0,part:0,track:0,move:0,animation:0};
  if(kind==='sprite')renderSpriteEditor(api,ui,d,selection,mutate,fn=>refresh=fn);
  else if(kind==='model')renderModelEditor(api,ui,d,selection,mutate,fn=>refresh=fn);
  else renderTimelineEditor(api,ui,d,selection,mutate,fn=>refresh=fn);
}

function renderSpriteEditor(api,ui,d,s,mutate,setRefresh){
  const preview=spritePreview(api,ui.bounds('sb'),d,index=>{s.cut=index;cuts.select(index);});
  api.input(d.custom.name,ui.bounds('name'),async value=>{d.custom.name=value.trim();await api.save();});
  const cuts=editableTable(api,ui.bounds('jspic'),cutsColumns,()=>d.cut.cuts.map((r,i)=>[i,...r.values,r.name]),(r,c,value)=>mutate(()=>{if(c===5)d.cut.cuts[r].name=cleanName(value);else d.cut.cuts[r].values[c-1]=integer(value);}),index=>{s.cut=index;preview.select(index);},{readonly:[0]});
  ui.button('addl',()=>mutate(()=>{d.cut.cuts.push({values:[0,0,1,1],name:''});s.cut=d.cut.cuts.length-1;}));
  ui.button('reml',()=>mutate(()=>{const index=s.cut;if(index<0||index>=d.cut.cuts.length)return;if(d.model.parts.some(p=>p.values[2]===index)||d.animations.some(a=>a.data.tracks.some(t=>t.values[1]===2&&t.moves.some(m=>m[1]===index))))throw new Error('This sprite is used by the model or animation. Change those references before removing it.');d.cut.cuts.splice(index,1);for(const part of d.model.parts)if(part.values[2]>index)part.values[2]--;for(const a of d.animations)for(const t of a.data.tracks)if(t.values[1]===2)for(const m of t.moves)if(m[1]>index)m[1]--;s.cut=Math.max(0,index-1);}));
  const resize=api.input('resize to: _%',ui.bounds('resz'),()=>{});resize.disabled=true;resize.title='Original sprite coordinate rescaling is not ported yet.';
  ui.button('add',()=>importAnimation(api));
  ui.button('rem',async()=>{if(!await api.message('Confirm','This action cannot be undone. Are you sure to delete?',{cancel:true}))return;for(const path of Object.values(d.custom.files??{}))await api.storage.remove('file:'+path);api.state.animations.splice(api.state.animations.indexOf(d.custom),1);await api.save();await api.navigate('spriteEditor');});
  ui.button('copy',async()=>{const name=await api.message('Input','Animation name',{input:d.custom.name+'_copy',cancel:true});if(name===null)return;const id=crypto.randomUUID(),copy={id,name,files:{},materialized:true,group:d.custom.group};for(const [file,path]of Object.entries(d.custom.files)){const destination='animations/'+id+'/'+file;await api.storage.write('file:'+destination,await api.storage.read('file:'+path));copy.files[file]=destination;}api.state.animations.push(copy);await api.save();await api.navigate('spriteEditor',{customId:id});});
  disabled(ui.button('merg'),'Sprite merge is not ported yet.');
  ui.button('impt',()=>importAnimation(api,{existing:d.custom}));ui.button('expt',()=>exportFiles(d.custom,api));
  disabled(ui.button('spri'),'Pixel painting is not ported yet. You can replace the PNG with Reload sprite.');
  disabled(ui.button('loca'),'Pack animation localization is not ported yet.');
  ui.button('relo',async()=>{const file=await api.pickFile('.png,image/png');if(!file)return;await replaceSprite(d,api,file);preview.draw();});
  ui.button('save',async()=>api.download(await readFile(d.custom,d.spriteName,api),d.spriteName));
  ui.button('white',button=>preview.white(button.getAttribute('aria-pressed')==='true'),{toggle:true,selected:true});
  disabled(ui.button('icob'),'Display icon cropping is not ported yet.');disabled(ui.button('unib'),'Deploy icon cropping is not ported yet.');
  api.place(api.element('div',undefined,'preview'),ui.bounds('icon'));api.place(api.element('div',undefined,'preview'),ui.bounds('uni'));
  const from=api.list(ui.bounds('jspf'),['red','alien','zombie'],()=>{}),to=api.list(ui.bounds('jspt'),['red','alien','zombie','white','black'],()=>{});from.setAttribute('aria-disabled','true');to.setAttribute('aria-disabled','true');
  disabled(ui.button('swcl',undefined,{text:'Change color'}),'Original color replacement is not ported yet.');
  setRefresh(()=>{cuts.draw();cuts.select(s.cut,false);preview.select(s.cut);});cuts.select(0);preview.draw();
}

function renderModelEditor(api,ui,d,s,mutate,setRefresh){
  const modelPreview=animationPreview(api,ui.bounds('mb'),d,{staticModel:true}),sprites=spritePreview(api,ui.bounds('sb'),d,index=>{s.cut=index;cutList.select(index,false);});
  const cutList=api.list(ui.bounds('jspp'),d.cut.cuts,(_,i)=>{s.cut=i;sprites.select(i);},{render:(cut,i)=>i+' '+cut.name});
  const tree=api.list(ui.bounds('jsptr'),[],(_,index)=>{s.part=index;parts.select(index);},{render:part=>part});
  const parts=editableTable(api,ui.bounds('jspmm'),modelColumns,()=>d.model.parts.map((p,i)=>[i,p.values[0],...p.values.slice(2),p.name]),(r,c,value)=>mutate(()=>{if(c===13)d.model.parts[r].name=cleanName(value);else d.model.parts[r].values[c===1?0:c]=integer(value);}),index=>{s.part=index;tree.select(index,false);const img=d.model.parts[index]?.values[2];sprites.select(img);cutList.select(img,false);},{readonly:[0]});
  ui.button('camres',()=>modelPreview.reset());ui.button('zomres',()=>{sprites.reset();modelPreview.reset();});
  ui.button('addl',()=>mutate(()=>{d.model.parts.push({values:[s.part>=0?s.part:-1,-1,s.cut,0,0,0,0,0,d.model.units[0],d.model.units[0],0,d.model.units[2],0],name:''});s.part=d.model.parts.length-1;}));
  ui.button('reml',()=>mutate(()=>{const index=s.part;if(d.model.parts.length<=1)throw new Error('An animation requires at least one model part.');if(d.model.parts.some(p=>p.values[0]===index)||d.animations.some(a=>a.data.tracks.some(t=>t.values[0]===index)))throw new Error('This part is used by a child or an animation. Remove those references first.');d.model.parts.splice(index,1);for(const p of d.model.parts)if(p.values[0]>index)p.values[0]--;for(const a of d.animations)for(const t of a.data.tracks)if(t.values[0]>index)t.values[0]--;s.part=Math.max(0,index-1);}));
  disabled(ui.button('rema'),'Removing a complete model subtree is not ported yet.');disabled(ui.button('sort'),'Model reordering with animation remapping is not ported yet.');
  ui.button('revt',()=>mutate(()=>{d.model.parts[0].values[8]*=-1;for(const p of d.model.parts)p.values[10]*=-1;for(const a of d.animations)for(const t of a.data.tracks)if(t.values[1]===11)for(const key of t.moves)key[1]*=-1;}));
  setRefresh(()=>{parts.draw();parts.select(s.part,false);tree.setItems(d.model.parts.map((p,i)=>i+' '+p.name+' ('+p.values[0]+')'),s.part);modelPreview.rebuild();sprites.draw();});
  tree.setItems(d.model.parts.map((p,i)=>i+' '+p.name+' ('+p.values[0]+')'),0);parts.select(0);sprites.draw();
}

function renderTimelineEditor(api,ui,d,s,mutate,setRefresh){
  let selectedModification=5;
  const frameSlider=api.input(0,ui.bounds('jtl'),value=>preview.frame(value),{type:'range',min:0,max:100});
  const preview=animationPreview(api,ui.bounds('ab'),d,{onFrame:frame=>frameSlider.value=frame}),sprites=spritePreview(api,ui.bounds('sb'),d,index=>{s.cut=index;cutList.select(index,false);});
  const typeList=api.list(ui.bounds('jspt'),d.animations,(entry,index)=>{s.animation=index;s.track=0;s.move=0;refreshTables();preview.select(index);},{selected:0,render:a=>a.name});
  const modelList=api.list(ui.bounds('jspm'),d.model.parts,(_,index)=>s.part=index,{selected:0,render:(part,i)=>i+' '+part.name});
  const cutList=api.list(ui.bounds('jspp'),d.cut.cuts,(_,index)=>{s.cut=index;sprites.select(index);},{render:(cut,i)=>i+' '+cut.name});
  api.list(ui.bounds('jspv'),modifications,value=>selectedModification=Number(value.split(' ')[0]),{selected:5});
  const track=()=>d.animations[s.animation]?.data.tracks[s.track];
  const tracks=editableTable(api,ui.bounds('jspma'),tracksColumns,()=>d.animations[s.animation].data.tracks.map(t=>[...t.values.slice(0,3),t.name]),(r,c,value)=>mutate(()=>{const t=d.animations[s.animation].data.tracks[r];if(c===3)t.name=cleanName(value);else t.values[c]=integer(value);}),index=>{s.track=index;s.move=0;moves.draw();updateFields();modelList.select(track()?.values[0]??-1,false);});
  const moves=editableTable(api,ui.bounds('jspmp'),movesColumns,()=>track()?.moves??[],(r,c,value)=>mutate(()=>track().moves[r][c]=integer(value)),index=>{s.move=index;updateFields();preview.frame(track()?.moves[index]?.[0]??0);});
  const infoType=api.input('',ui.bounds('inft'),()=>{}),infoFrame=api.input('',ui.bounds('inff'),()=>{}),infoValue=api.input('',ui.bounds('infv'),()=>{}),infoMaximum=api.input('',ui.bounds('infm'),()=>{});for(const field of [infoType,infoFrame,infoValue,infoMaximum])field.readOnly=true;
  function updateFields(){const t=track(),key=t?.moves[s.move];infoType.value=t?'type: '+t.values[1]:'';infoFrame.value=key?'frame: '+key[0]:'';infoValue.value=key?'value: '+key[1]:'';infoMaximum.value=t?'loop: '+t.values[2]:'';}
  ui.button('addp',()=>mutate(()=>{d.animations[s.animation].data.tracks.push({values:[s.part,selectedModification,-1,0,0],name:'',moves:[]});s.track=d.animations[s.animation].data.tracks.length-1;}));
  ui.button('remp',()=>mutate(()=>{d.animations[s.animation].data.tracks.splice(s.track,1);s.track=Math.max(0,s.track-1);}));
  ui.button('addl',()=>mutate(()=>{const t=track();if(!t)throw new Error('Select or add an animation part first.');t.moves.push([t.moves.length?t.moves.at(-1)[0]+1:0,0,0,0]);s.move=t.moves.length-1;}));
  ui.button('reml',()=>mutate(()=>track()?.moves.splice(s.move,1)));
  ui.button('jtb',button=>{const paused=button.getAttribute('aria-pressed')==='true';preview.pause(paused);},{toggle:true});ui.button('nex',()=>{preview.pause(true);preview.next();});
  ui.button('camres',()=>preview.reset());ui.button('zomres',()=>{preview.reset();sprites.reset();});
  const speedSelected=api.input('Set speed for selected',ui.bounds('lmul'),()=>{}),speedAll=api.input('Set speed for all',ui.bounds('tmul'),()=>{});
  for(const [field,all]of [[speedSelected,false],[speedAll,true]])field.addEventListener('keydown',safe(api,async event=>{if(event.key!=='Enter')return;const multiplier=Number.parseFloat(field.value);if(!(multiplier>0&&multiplier<=1000))throw new Error('Enter a positive speed multiplier.');await mutate(()=>{for(const t of all?d.animations[s.animation].data.tracks:[track()].filter(Boolean))for(const key of t.moves)key[0]=Math.round(key[0]/multiplier);});}));
  disabled(ui.button('advs'),'The advanced animation editor is not ported yet.');ui.button('sort',()=>mutate(()=>d.animations[s.animation].data.tracks.sort((a,b)=>a.values[0]-b.values[0])));
  function refreshTables(){tracks.draw();tracks.select(s.track,false);moves.draw();moves.select(s.move,false);updateFields();frameSlider.max=Math.max(1,...d.animations[s.animation].data.tracks.flatMap(t=>t.moves.map(k=>k[0])));}
  setRefresh(()=>{refreshTables();preview.rebuild();sprites.draw();});refreshTables();tracks.select(0);
}

async function replaceSprite(d,api,blob){const url=URL.createObjectURL(blob),image=new Image();image.src=url;try{await image.decode();const previous=d.image;d.image=image;try{validateDocuments(d);}catch(error){d.image=previous;throw error;}d.spriteBlob=blob;d.spriteURL=url;await api.storage.write('file:'+d.custom.files[d.spriteName],blob);await api.save();api.addCleanup(()=>URL.revokeObjectURL(url));}catch(error){URL.revokeObjectURL(url);throw error;}}

export async function importAnimation(api,{existing}={}){
  const files=await api.pickFile('.png,.imgcut,.mamodel,.maanim',true);if(!files?.length)return;
  const pngOnly=!existing&&files.length===1&&extension(files[0].name)==='png';
  const animationType=pngOnly?await chooseAnimationType(api):null;if(pngOnly&&animationType===null)return;
  const name=existing?.name??await api.message('Input','Animation name',{input:files[0].name.replace(/\.[^.]+$/,''),cancel:true});if(name===null)return;
  const custom=existing??{id:crypto.randomUUID(),name:String(name).trim()||'new anim',files:{},materialized:true};custom.files??={};
  for(const file of files){if(!['png','imgcut','mamodel','maanim'].includes(extension(file.name)))throw new Error('Unsupported animation file.');const path='animations/'+custom.id+'/'+file.name;await api.storage.write('file:'+path,file);custom.files[file.name]=path;}
  if(pngOnly){
    const sprite=files[0].name,prefix=sprite.replace(/\.png$/i,''),initial=[
      [prefix+'.imgcut','[imgcut]\n0\n'+sprite+'\n1\n0,0,1,1,default\n'],
      [prefix+'.mamodel','[mamodel]\n3\n1\n-1,-1,0,0,0,0,0,0,1000,1000,0,1000,0,default\n1000,3600,1000\n1\n0,0,0,0,0,0,default\n']
    ];
    for(let i=0;i<(animationType==='Soul'?1:7);i++)initial.push([prefix+String(i).padStart(2,'0')+'.maanim','[maanim]\n1\n0\n']);
    for(const [file,text]of initial){const path='animations/'+custom.id+'/'+file;custom.files[file]=path;await api.storage.write('file:'+path,newBlob(text));}
    custom.animationType=animationType;
  }
  if(!existing)api.state.animations.push(custom);await api.save();await api.navigate('spriteEditor',{customId:custom.id});
}

function chooseAnimationType(api){return new Promise(resolve=>{const dialog=api.element('dialog'),title=api.element('h2','Select Animation Type'),text=api.element('p','What kind of animation do you want to create?'),actions=api.element('div');dialog.append(title,text,actions);document.body.append(dialog);let selected=null;for(const value of ['Unit/Enemy','Soul','Cancel']){const button=api.element('button',value);button.type='button';button.addEventListener('click',()=>{selected=value==='Cancel'?null:value;dialog.close();});actions.append(button);}dialog.addEventListener('close',()=>{dialog.remove();resolve(selected);},{once:true});dialog.showModal();});}

export async function renderCustomAnimations(api,params={}){
  let alive=true;api.addCleanup(()=>alive=false);api.backButton();let selected=api.state.animations.find(x=>x.id===params.customId)??api.state.animations[0],preview=null,doc=null,selectedType=0;
  const header=editorHeader(api,'view',selected,()=>{},()=>api.save(true));disabled(header.undo,'Open an editor to undo an edit.');
  const ui=layout(api,'DIYViewPage');
  const picker=api.list(ui.bounds('jspu',[50,100,300,1050]),api.state.animations,async custom=>{selected=custom;await open(custom);},{selected:api.state.animations.indexOf(selected),render:x=>(x.group?x.group+' / ':'')+x.name});
  const typeList=api.list([400,550,300,400],[],(_,i)=>{selectedType=i;preview?.select(i);},{render:a=>a.name});
  const pause=api.button('pause',[1300,1050,200,50],button=>preview?.pause(button.getAttribute('aria-pressed')==='true'),{toggle:true});api.button('nextf',[1600,1050,200,50],()=>preview?.next());
  api.button('png',[1300,1150,200,50],()=>preview?.canvas.toBlob(blob=>blob&&api.download(blob,'animation.png'),'image/png'));
  api.button('copy',[250,0,200,50],async()=>{if(!selected)return;await materialize(selected,api);const name=await api.message('Input','Animation name',{input:selected.name+'_copy',cancel:true});if(name===null)return;const copy={id:crypto.randomUUID(),name,files:{},materialized:true,group:selected.group};for(const [file,path]of Object.entries(selected.files)){const target='animations/'+copy.id+'/'+file;await api.storage.write('file:'+target,await api.storage.read('file:'+path));copy.files[file]=target;}api.state.animations.push(copy);await api.save();await api.navigate('customAnimations',{customId:copy.id});});
  api.button('import',[50,50,150,50],()=>importAnimation(api));api.button('export',[200,50,150,50],()=>selected&&exportFiles(selected,api));
  const groupButton=ui.button('group',async()=>{if(!selected)return;const group=await api.message('Input','Group name',{input:selected.group??'',cancel:true});if(group!==null){selected.group=group.trim();await api.save();picker.setItems(api.state.animations,api.state.animations.indexOf(selected));}});
  ui.button('remgroup',async()=>{if(!selected?.group)return;const group=selected.group;for(const a of api.state.animations)if(a.group===group)delete a.group;await api.save();picker.setItems(api.state.animations,api.state.animations.indexOf(selected));});
  for(const id of ['ics','icc'])disabled(ui.button(id),'Custom icon editing is not ported yet.');
  async function open(custom){await api.navigate('customAnimations',{customId:custom.id});}
  if(selected){try{doc=await loadDocuments(selected,api);if(!alive)return;preview=animationPreview(api,[1000,100,1000,600],doc);typeList.setItems(doc.animations,0);api.label(selected.name,[400,100,500,100]);const name=api.input(selected.name,[400,250,500,50],async value=>{selected.name=value.trim();await api.save();picker.setItems(api.state.animations,api.state.animations.indexOf(selected));});}catch(error){if(alive)api.label(error.message,[400,150,1700,200]);}}
  else api.label('Import original animation files, or use Copy in a unit/enemy animation viewer.',[400,150,1700,200]);
}

// ZIP store mode exports original files without introducing another animation format.
function crc32(bytes){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
export function zipFiles(files){let offset=0;const chunks=[],central=[];for(const [name,bytes]of files){const filename=new TextEncoder().encode(name),crc=crc32(bytes),local=new Uint8Array(30+filename.length),view=new DataView(local.buffer);view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,filename.length,true);local.set(filename,30);chunks.push(local,bytes);const header=new Uint8Array(46+filename.length),cv=new DataView(header.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);header.set(filename,46);central.push(header);offset+=local.length+bytes.length;}const centralLength=central.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralLength,true);v.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});}
async function exportFiles(custom,api){await materialize(custom,api);const files=[];for(const [name,path]of Object.entries(custom.files??{})){const blob=await api.storage.read('file:'+path);if(blob instanceof Blob)files.push([name,new Uint8Array(await blob.arrayBuffer())]);}api.download(zipFiles(files),(custom.name||'animation').replace(/[\\/:*?"<>|]/g,'_')+'.zip');}
