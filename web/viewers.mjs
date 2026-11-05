// Original desktop resource viewers and ComparePage, adapted to DOM/Canvas.
import { displayStats, abilityDescriptions, displayDrop, defaultUnitLevels } from './information.mjs';

const rasterCache=new Map(),cutCache=new Map(),comparisons=new WeakMap();
const pad=value=>String(value).padStart(3,'0');
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const cleanText=value=>String(value??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'');
const apiFor=api=>({...api,...api.helpers});
const chosenId=params=>params.selectedId??params.item?.id;
const stageId=value=>Number(String(value??'').split('/').at(-1));
function labels(api,key,fallback=key,section='page'){let value=api.t(key,fallback,section);for(let i=0;i<8;i++){const next=value.replace(/#([^#]+)#/g,(_,k)=>api.t(k,k,section));if(next===value)break;value=next;}return value;}
function styles(){if(document.getElementById('bcu-viewer-styles'))return;const style=document.createElement('style');style.id='bcu-viewer-styles';style.textContent=`.bcu-resource-preview{overflow:hidden}.bcu-resource-preview canvas{display:block;width:100%;height:100%}.bcu-compare-cell{border:2px groove #ddd;justify-content:flex-start;align-items:center;white-space:nowrap;overflow:hidden;padding:0 2px}.bcu-compare-cell.heading{justify-content:center;text-align:center}.bcu-compare-cell img{max-height:100%;max-width:120px;object-fit:contain}.bcu-compare-abilities{overflow:auto;border:1px solid var(--border)}.bcu-compare-ability{display:flex;align-items:center;white-space:nowrap;min-height:calc((100dvh - 22px)*50/1300);border-bottom:2px groove #ddd;width:max-content;min-width:100%;padding-right:4px}.bcu-compare-ability img{max-height:calc((100dvh - 22px)*45/1300);max-width:45px;margin-right:4px}.bcu-viewer-error{color:#a80000;white-space:pre-wrap}`;document.head.append(style);}
function placement(api,page,id,fallback){const layout=api.layouts?.pages?.[page]?.defaultPlacements??{};return layout[id]??fallback;}
function image(path){if(!rasterCache.has(path))rasterCache.set(path,new Promise((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error('Could not load '+path));value.src=encodeURI(path);}));return rasterCache.get(path);}
async function cuts(path){if(!cutCache.has(path))cutCache.set(path,fetch(encodeURI(path)).then(async response=>{if(!response.ok)throw new Error('Could not read '+path);const lines=(await response.text()).replaceAll('\r','').split('\n'),count=Number(lines[3]);return lines.slice(4,4+count).map(line=>line.split(',').slice(0,4).map(Number));}));return cutCache.get(path);}
function rgba(color,alpha=1){return 'rgba('+color.slice(0,3).join(',')+','+alpha+')';}
function gradient(ctx,x,y,width,height,color0,color1,startY=y,endY=y+height,alpha=1){if(width<=0||height<=0)return;const fill=ctx.createLinearGradient(0,startY,0,endY===startY?endY+1:endY);fill.addColorStop(0,rgba(color0,alpha));fill.addColorStop(1,rgba(color1,alpha));ctx.fillStyle=fill;ctx.fillRect(x,y,width,height);}
function part(ctx,sprite,cut,x,y,width,height){if(!cut||width<=0||height<=0)return;const[sx,sy,w,h]=cut;if(w<=0||h<=0)return;ctx.drawImage(sprite,sx,sy,w,h,x,y,width,height);}

/** Port of UtilPC.getBg(), including its 204px sky/ground extensions. */
async function drawBackground(api,background,canvas){
  const [sprite,rects]=await Promise.all([image(background.image),cuts('assets/org/battle/bg/bg'+String(background.ic??background.imgcut??0).padStart(2,'0')+'.imgcut')]);
  const width=canvas.width,height=canvas.height,ctx=canvas.getContext('2d'),ground=rects[0];if(!ground)throw new Error('This background has no ground image.');
  const groundHeight=ground[3],skyHeight=Math.max(0,background.top&&rects[20]?rects[20][3]:1020-groundHeight),ratio=height/(groundHeight+skyHeight+408),fw=Math.trunc(768*ratio),sh=Math.trunc(skyHeight*ratio),gh=Math.trunc(groundHeight*ratio),skyGround=Math.trunc(204*ratio),colors=background.cs??background.colors;
  if(!colors||colors.length<4)throw new Error('This background has no gradient colors.');ctx.clearRect(0,0,width,height);ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
  if(background.top&&rects[20]){for(let i=0;fw>0&&i*fw<width;i++)part(ctx,sprite,rects[20],fw*i,skyGround,fw,sh);gradient(ctx,0,0,width,skyGround,colors[0],colors[1],0,skyGround);}else gradient(ctx,0,0,width,sh+skyGround,colors[0],colors[1],0,sh+skyGround);
  for(let i=0;fw>0&&i*fw<width;i++)part(ctx,sprite,ground,fw*i,sh+skyGround,fw,gh);
  gradient(ctx,0,sh+gh+skyGround,width,skyGround,colors[2],colors[3],sh+gh+skyGround,height);
  if(background.overlay?.length>=2)gradient(ctx,0,0,width,height,background.overlay[1],background.overlay[0],0,height,(background.overlayAlpha??0)/255);
}

export function renderBackgrounds(params={},rawApi){
  const api=apiFor(rawApi);styles();api.backButton();let selected=null,generation=0,alive=true;
  const preview=api.place(api.element('div',undefined,'bcu-resource-preview'),placement(api,'BGViewPage','jl',[650,100,1600,1100]),'background-preview'),canvas=api.element('canvas');preview.append(canvas);
  async function draw(){if(!selected||!alive)return;const current=++generation;backgroundError('');canvas.width=Math.max(1,preview.clientWidth);canvas.height=Math.max(1,preview.clientHeight);try{const temp=document.createElement('canvas');temp.width=canvas.width;temp.height=canvas.height;await drawBackground(api,selected,temp);if(alive&&current===generation)canvas.getContext('2d').drawImage(temp,0,0);}catch(error){if(alive&&current===generation)backgroundError(error.message);}}
  let error=null;function backgroundError(value){error?.remove();error=null;if(value){error=api.element('div',value,'bcu-viewer-error');Object.assign(error.style,{position:'absolute',top:'0',left:'0'});preview.append(error);}}
  const entries=api.catalog.backgrounds??[],list=api.list(placement(api,'BGViewPage','jspst',[50,100,300,1100]),entries,async item=>{selected=item;await draw();},{id:'background-list',render:item=>item.name??'000000/'+item.id});
  api.button('stage',placement(api,'BGViewPage','find',[400,150,200,50]),()=>selected&&api.navigate('stages',{filter:stage=>stageId(stage.background)===Number(selected.id)||stageId(stage.background1)===Number(selected.id)}));
  const observer=new ResizeObserver(()=>draw());observer.observe(preview);api.addCleanup(()=>{alive=false;generation++;observer.disconnect();});
  const id=chosenId(params);if(id!==undefined&&id!==null){const index=entries.findIndex(item=>String(item.id)===String(id));if(index>=0)list.select(index);}
}

export function renderCastles(params={},rawApi){
  const api=apiFor(rawApi);styles();api.backButton();let selected=null,generation=0,alive=true;
  const preview=api.place(api.element('div',undefined,'bcu-resource-preview'),placement(api,'CastleViewPage','jl',[800,50,1000,1000]),'castle-preview'),canvas=api.element('canvas');preview.append(canvas);
  api.label(labels(api,'bspwn','Boss spawn'),placement(api,'CastleViewPage','jbs',[400,500,200,50]),'castle-boss-label');const spawn=api.label('',placement(api,'CastleViewPage','bs',[600,500,100,50]),'castle-boss-spawn');
  async function draw(){const id=++generation;canvas.width=Math.max(1,preview.clientWidth);canvas.height=Math.max(1,preview.clientHeight);const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!selected)return;try{const img=await image(selected.image);if(!alive||id!==generation)return;ctx.drawImage(img,0,Math.trunc((canvas.height-img.height)/2));}catch(error){if(alive&&id===generation)preview.title=error.message;}}
  const groups=Object.groupBy(api.catalog.castles??[],item=>item.collection??item.pack??'000000'),groupNames=Object.keys(groups).sort();
  const children=api.list(placement(api,'CastleViewPage','jspst',[400,550,300,650]),[],item=>{selected=item;spawn.textContent=String(item.bossSpawn??'');draw();},{id:'castle-list',render:item=>item.name??(item.collection??'000000')+'/'+item.id});
  const parents=api.list(placement(api,'CastleViewPage','jspsm',[50,100,300,1100]),groupNames,group=>{children.setItems(groups[group]);if(groups[group].length)children.select(0);},{id:'castle-collections'});
  api.button('stage',placement(api,'CastleViewPage','find',[450,300,200,50]),()=>selected&&api.navigate('stages',{filter:stage=>stageId(stage.castle)===Number(selected.id)&&(!stage.castleCollection||stage.castleCollection===(selected.collection??'000000'))}));
  const observer=new ResizeObserver(draw);observer.observe(preview);api.addCleanup(()=>{alive=false;generation++;observer.disconnect();});
  const id=chosenId(params);if(id!==undefined&&id!==null){const group=String(params.collection??params.item?.collection??'000000'),values=groups[group]??[];parents.select(groupNames.indexOf(group),false);children.setItems(values);const index=values.findIndex(item=>String(item.id)===String(id));if(index>=0)children.select(index);}
}

export function renderMusic(params={},rawApi){
  const api=apiFor(rawApi);styles();api.backButton();let selected=null,audio=null,alive=true;
  const entries=api.catalog.music??[],list=api.list(placement(api,'MusicPage','jsp',[50,100,300,800]),entries,item=>selected=item,{id:'music-list',render:item=>(item.name??pad(item.id)+'.ogg')+' - '+(item.pack??'000000')});
  api.button('start',placement(api,'MusicPage','strt',[400,100,200,50]),async()=>{if(!selected||api.state.config.music===false)return;audio?.pause();audio=new Audio(api.assetPath?.(selected.url??selected.path??selected.audio)??selected.url??selected.path);audio.volume=clamp(Number(api.state.config.volumeBG??50)/100,0,1);audio.loop=!(selected.loop>0);if(selected.loop>0)audio.addEventListener('ended',()=>{if(alive&&audio){audio.currentTime=selected.loop/1000;audio.play().catch(error=>api.message('Audio error',error.message));}});await audio.play();});
  api.button('stage',placement(api,'MusicPage','find',[400,200,200,50]),()=>selected&&api.navigate('stages',{filter:stage=>stageId(stage.music)===Number(selected.id)||stageId(stage.music1)===Number(selected.id)}));
  const id=chosenId(params);if(id!==undefined&&id!==null){const index=entries.findIndex(item=>String(item.id)===String(id));if(index>=0)list.select(index);}
  api.addCleanup(()=>{alive=false;audio?.pause();if(audio){audio.removeAttribute('src');audio.load();}audio=null;});
}

function compareItem(api,record){if(!record)return null;if(record.kind==='enemy')return api.catalog.enemies.find(item=>String(item.id)===String(record.id));const unit=api.catalog.units.find(item=>String(item.id)===String(record.id));return unit?{...unit.forms[record.fid??0],unit}:null;}
function compareStats(api,record){const item=compareItem(api,record);if(!item)return null;const raw=item.maxStats??item;
  if(record.kind==='enemy')return{...raw,hp:Math.trunc(raw.hp*(record.hp??100)/100),attackValues:(raw.rawAttacks??[]).map(value=>Math.round(value[0]*(record.attack??100)/100)),dps:Math.trunc(raw.attack*(record.attack??100)/100*30/(raw.attackInterval||1)),drop:displayDrop(api,item)};
  const value=displayStats(api,item,item.unit,(record.level??1)+(record.plusLevel??0),{info:true});return{...raw,...value,attackValues:(raw.rawAttacks??[]).map(attack=>api.engine?.unitStatValue?api.engine.unitStatValue(item.unit.levelCurve.join(','),(record.level??1)+(record.plusLevel??0),raw.hp,attack[0],raw.attackInterval,api.state.treasures?.[8]??300,api.state.treasures?.[9]??300,1):'—')};
}

export function renderCompare(params={},rawApi){
  const api=apiFor(rawApi);styles();api.backButton();if(!comparisons.has(api.state))comparisons.set(api.state,{columns:[null,null,null],visible:Array(16).fill(true)});const context=comparisons.get(api.state),dynamic=[];
  const titles=['HP','hb','range','atk','dps','preaa','postaa','atkf','TBA','speed','cdo','price','drop','evolve','trait','ability'];
  const nameLabels=[],levelInputs=[],formButtons=[];let generation=0;
  for(let i=0;i<3;i++){
    const x=450+i*600;
    for(const [kind,y,key]of [['enemy',50,'veif'],['unit',100,'vuif']])api.button('choose-'+kind+'-'+i,[x,y,200,50],()=>api.navigate(kind==='enemy'?'enemyData':'unitData',{onChoose:(item,unit)=>{const previous=context.columns[i];if(kind==='unit'){const levels=previous?.kind==='unit'?{level:previous.level,plusLevel:previous.plusLevel}:defaultUnitLevels(api,unit);context.columns[i]={kind,id:unit.id,fid:item.fid,...levels};}else context.columns[i]={kind,id:item.id,hp:previous?.kind==='enemy'?previous.hp:100,attack:previous?.kind==='enemy'?previous.attack:100};}}),{text:labels(api,key)});
    nameLabels.push(api.label('-',[250+i*600,200,600,50],'compare-name-'+i,'bcu-compare-cell'));
    const level=api.input('-',[250+i*600,150,600,50],null,{id:'compare-level-'+i});level.addEventListener('change',()=>{const value=context.columns[i],item=compareItem(api,value),numbers=level.value.match(/\d+/g)?.map(Number);if(!value||!numbers?.length)return;if(value.kind==='enemy'){value.hp=numbers[0];value.attack=numbers[1]??numbers[0];}else{value.level=clamp(numbers[0],1,item.unit.max??130);value.plusLevel=clamp(numbers[1]??0,0,item.unit.maxPlus??0);}draw();});level.addEventListener('keydown',event=>{if(event.key==='Enter')level.blur();});levelInputs.push(level);
    formButtons.push([-1,1].map((step,j)=>api.button('compare-form-'+i+'-'+j,[x+(j?200:-100),100,100,50],()=>{const record=context.columns[i],item=compareItem(api,record);if(record?.kind==='unit'){record.fid=(record.fid+step+item.unit.forms.length)%item.unit.forms.length;draw();}},{text:j?'>':'<',disabled:true})));
  }
  for(let i=0;i<titles.length;i++)api.check('compare-row-'+i,[2075,250+i*50,200,50],context.visible[i],value=>{context.visible[i]=value;draw();},titles[i]==='ability'?'ability':labels(api,titles[i],titles[i],'info'));
  function put(text,bounds,id,heading=false){const el=api.label(text,bounds,id,'bcu-compare-cell'+(heading?' heading':''));dynamic.push(el);return el;}
  const frame=value=>api.state.config.seconds?(Number(value??0)/30).toFixed(2)+'s':String(value??0)+'f';
  function values(index){const record=context.columns[index],item=compareItem(api,record),stats=compareStats(api,record);if(!item||!stats)return Array(15).fill('-');return[stats.hp,stats.kb,stats.range,stats.attackValues.join(' / '),stats.dps,(stats.rawAttacks??[]).map(attack=>frame(attack[1])).join(' / '),frame(stats.post),frame(stats.attackInterval),frame(stats.tba),stats.speed,record.kind==='unit'?frame(stats.respawn):'-',record.kind==='unit'?stats.price:'-',record.kind==='enemy'?stats.drop:'-',null,(stats.traits??[]).map(trait=>labels(api,'c'+trait,String(trait),'util')).join(', ')];}
  function draw(){generation++;dynamic.forEach(el=>el.remove());dynamic.length=0;const columns=Array.from({length:3},(_,i)=>values(i));for(let i=0;i<3;i++){const record=context.columns[i],item=compareItem(api,record);nameLabels[i].replaceChildren();if(item?.editorIcon??item?.icon){const img=api.element('img');img.src=api.assetPath?.(item.editorIcon??item.icon)??item.icon;img.alt='';nameLabels[i].append(img);}nameLabels[i].append(document.createTextNode(item?.name??'-'));levelInputs[i].disabled=!record;levelInputs[i].value=!record?'-':record.kind==='enemy'?(record.hp===record.attack?record.hp:record.hp+', '+record.attack)+'%':record.level+(record.plusLevel?' + '+record.plusLevel:'');formButtons[i].forEach(button=>button.disabled=record?.kind!=='unit');}
    let y=250;for(let row=0;row<15;row++){if(!context.visible[row])continue;put(labels(api,titles[row],titles[row],'info'),[50,y,200,50],'compare-title-'+row,true);if(row===13){for(let i=0;i<18;i++)put('-',[250+i%3*200+Math.floor(i/6)*600,y+Math.floor(i/3)%2*50,200,50],'compare-evolve-'+i).title='Evolution cost data is not exported yet.';y+=100;continue;}for(let column=0;column<3;column++)put(columns[column][row],[250+column*600,y,600,50],'compare-value-'+row+'-'+column);y+=50;}
    const height=200+context.visible.filter(value=>!value).length*50;
    const traits=api.list([50,y,200,height],api.catalog.traits?.filter(item=>item.id<16)??[],null,{id:'compare-traits',render:item=>item.name});traits.setAttribute('aria-disabled','true');traits.title='Effective trait modifiers are not ported yet.';dynamic.push(traits);
    if(context.visible[15])for(let column=0;column<3;column++){const pane=api.place(api.element('div',undefined,'bcu-compare-abilities'),[250+column*600,y,600,height],'compare-abilities-'+column);dynamic.push(pane);const item=compareItem(api,context.columns[column]);if(!item)continue;for(const description of abilityDescriptions(api,item)){const row=api.element('div',undefined,'bcu-compare-ability');if(description.icon){const img=api.element('img');img.src=api.assetPath?.(description.icon)??description.icon;img.alt='';row.append(img);}row.append(document.createTextNode(cleanText(description.text)));if(description.title)row.title=description.title;pane.append(row);}}
  }
  draw();
}
