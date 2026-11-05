// Browser implementation of the original BasisPage and LineUpBox geometry.
// Advanced combo/talent/orb simulation stays disabled until the engine exposes
// those systems. Lineup management, unit placement, forms, levels, castles and
// the supported treasure calculations use real catalog data and saved state.

const GROUPS=[[0,8],[8,6],[14,3],[17,4],[21,3],[29,22]];
const ORDER=[0,1,18,19,20,21,22,23,2,3,4,5,24,25,26,27,28,6,7,8,9,10,11,12,13,14,15,16,17,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50];
const SUPPORTED_TREASURES=new Set([0,1,8,9,10,11]);
const imageCache=new Map(),drafts=new WeakMap();
let glyphAssets;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const pad=value=>String(value).padStart(3,'0');
const uuid=()=>crypto.randomUUID();
const clone=value=>structuredClone(value);

function apiFor(raw){return{...raw,...raw.helpers};}
function text(api,key,fallback=key,section='page'){let value=api.t(key,fallback,section);for(let i=0;i<8;i++){const next=value.replace(/#([^#]+)#/g,(_,k)=>api.t(k,k,section));if(next===value)break;value=next;}return value;}
function style(){if(document.getElementById('bcu-lineup-styles'))return;const node=document.createElement('style');node.id='bcu-lineup-styles';node.textContent=`.bcu-lineup-box canvas,.bcu-castle-box canvas{display:block;width:100%;height:100%;touch-action:none}.bcu-lineup-box{outline:none;overflow:hidden}.bcu-lineup-box:focus-visible{outline:1px dotted #555}.bcu-treasure-scroll{border:1px solid var(--border);overflow:auto}.bcu-treasure-rows{width:88.8889%;min-width:0}.bcu-treasure-row{display:grid;grid-template-columns:1fr 1fr;height:calc((100dvh - 22px)*50/1300)}.bcu-treasure-row>div{border:2px groove #ddd;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden}.bcu-treasure-row>input,.bcu-treasure-row>button{width:100%;height:100%;min-width:0}.bcu-treasure-row>input:disabled{color:inherit;opacity:1}.bcu-lineup-list .list-row[draggable=true]{cursor:default}`;document.head.append(node);}
function defaultTreasures(api){return[...(api.catalog.treasureValues??Array(51).fill(300))];}
function emptyLineup(name='lineup 0'){return{id:uuid(),name,slots:Array(10).fill(null),levels:{},nyc:[0,0,0]};}
function normalizeLineup(line,index){line.id??=uuid();line.name??='lineup '+index;line.slots=Array.from({length:10},(_,i)=>line.slots?.[i]??null);line.levels??={};line.nyc??=[0,0,0];return line;}

export function ensureState(api){
  const state=api.state;
  if(!Array.isArray(state.basisSets)||!state.basisSets.length){
    const previous=state.lineups?.length?state.lineups:[emptyLineup()];
    const fresh=previous.length===1&&previous[0].name==='Default'&&previous[0].slots?.every(slot=>slot===null);
    if(fresh)previous[0].name='lineup 0';
    state.basisSets=[{id:uuid(),name:'temporary',lineups:previous,selected:state.lineup??0,treasures:state.treasures??defaultTreasures(api)}];state.basisSet=0;
  }
  state.basisSet=clamp(Number(state.basisSet)||0,0,state.basisSets.length-1);
  state.defaultBasisSet??=state.basisSets[0].id;
  const set=state.basisSets[state.basisSet];set.id??=uuid();set.lineups??=[emptyLineup()];if(!set.lineups.length)set.lineups.push(emptyLineup());set.lineups.forEach(normalizeLineup);set.treasures??=defaultTreasures(api);set.selected=clamp(Number(set.selected)||0,0,set.lineups.length-1);
  state.lineups=set.lineups;state.lineup=set.selected;state.treasures=set.treasures;
  return set;
}

function draftFor(state,lineup){if(!drafts.has(state))drafts.set(state,new Map());const map=drafts.get(state);if(!map.has(lineup.id))map.set(lineup.id,{backup:Array(5).fill(null),selected:null});return map.get(lineup.id);}
function unitFor(api,slot){return slot?api.catalog.units.find(unit=>String(unit.id)===String(slot.unitId)):null;}
function formFor(api,slot){return unitFor(api,slot)?.forms?.[slot.fid??0];}
function defaultLevel(api,unit){return{level:Math.min(Number(api.state.config.prefLevel)||50,unit.max??50),plusLevel:Math.min(unit.maxPlus??0,unit.rarity<2&&unit.maxPlus>0?Math.trunc(((Number(api.state.config.prefLevel)||50)-1)/49*unit.maxPlus):0)};}
function slotFor(api,form,unit){return{unitId:unit.id,fid:form.fid??0,...defaultLevel(api,unit)};}
function loadImage(path){if(!imageCache.has(path)){const promise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load '+path));image.src=encodeURI(path);});imageCache.set(path,promise);}return imageCache.get(path);}
function readCut(text){const lines=text.replaceAll('\r','').split('\n'),count=Number(lines[3]);return lines.slice(4,4+count).map(line=>line.split(',').slice(0,4).map(Number));}
function loadGlyphs(){if(!glyphAssets)glyphAssets=Promise.all([loadImage('assets/org/page/uni.png'),loadImage('assets/org/page/img001.png'),loadImage('assets/org/page/moneySign.png'),fetch('assets/org/page/img001.imgcut').then(response=>{if(!response.ok)throw new Error('Missing original number glyphs.');return response.text();}),fetch('assets/org/page/moneySign.imgcut').then(response=>{if(!response.ok)throw new Error('Missing original currency glyphs.');return response.text();})]).then(([empty,numbers,currency,numberCut,moneyCut])=>({empty,numbers,currency,numberCuts:readCut(numberCut),currencyCuts:readCut(moneyCut)}));return glyphAssets;}

function drawNumber(ctx,glyphs,value,x,y,scale=1,money=false,lang='en'){
  const digits=String(Math.max(0,Math.trunc(value))).split('').map(Number),parts=digits.map(digit=>({image:glyphs.numbers,cut:glyphs.numberCuts[35+digit]}));
  if(money)parts.push({image:glyphs.currency,cut:glyphs.currencyCuts[8+({kr:2,jp:3}[lang]??0)]});
  const height=Math.max(...parts.map(part=>part.cut?.[3]??0))*scale;
  for(const part of parts){if(!part.cut)continue;const[sx,sy,w,h]=part.cut;ctx.drawImage(part.image,sx,sy,w,h,x,y-height,w*scale,h*scale);x+=w*scale;}
}

export function createLineupCanvas(rawApi,bounds,onChange=()=>{}){
  const api=apiFor(rawApi);style();const set=ensureState(api),lineup=set.lineups[set.selected],draft=draftFor(api.state,lineup);
  const box=api.place(api.element('div',undefined,'bcu-lineup-box'),bounds,'lineup-box');box.tabIndex=0;box.setAttribute('aria-label','Lineup slots. Select a unit, then use keys 1 to 0 to place it. Press D to move it to the spare row.');
  const canvas=api.element('canvas');canvas.width=600;canvas.height=300;box.append(canvas);const ctx=canvas.getContext('2d');let glyphs=null,disposed=false,flash=false,dragOrigin=null;
  function slots(){return[...lineup.slots,...draft.backup];}
  function position(unitId){return slots().findIndex(slot=>slot&&String(slot.unitId)===String(unitId));}
  function getSlot(index){return index<10?lineup.slots[index]:draft.backup[index%5];}
  function setSlot(index,slot){const previous=getSlot(index);if(index<10)lineup.slots[index]=slot;else draft.backup[index%5]=slot;return previous;}
  function selectedSlot(){const at=position(draft.selected);return at<0?null:getSlot(at);}
  function update(){const deployed=new Set(lineup.slots.filter(Boolean).map(slot=>String(slot.unitId)));draft.backup=draft.backup.map(slot=>slot&&deployed.has(String(slot.unitId))?null:slot);draw();onChange(selectedSlot());api.save?.();}
  function selectForm(form,unit=api.catalog.units.find(item=>String(item.id)===String(form.unitId??form.id))){
    if(!form||!unit)return;draft.selected=unit.id;let at=position(unit.id);
    if(at<0){at=draft.backup.findIndex(slot=>!slot);if(at<0)at=4;draft.backup[at]=slotFor(api,form,unit);}
    const slot=selectedSlot();if(slot){const saved=lineup.levels[String(unit.id)];if(saved)Object.assign(slot,saved);else lineup.levels[String(unit.id)]={level:slot.level,plusLevel:slot.plusLevel??0};}
    draw();onChange(slot);
  }
  function jump(origin,dest){if(origin<0||dest<0||dest>14||origin===dest)return;let item=getSlot(origin);if(!item)return;
    if(origin>dest){for(let i=dest;i<=origin;i++)item=setSlot(i,item);}else{if(dest>9){item=setSlot(dest,item);if(origin>9)setSlot(origin,item);else{const empty=draft.backup.findIndex(slot=>!slot);if(empty>=0)setSlot(10+empty,item);}dest=9;item=null;}for(let i=dest;i>=origin;i--)item=setSlot(i,item);}
    const compact=lineup.slots.filter(Boolean);lineup.slots=[...compact,...Array(10-compact.length).fill(null)];update();
  }
  function moveSelected(dest){jump(position(draft.selected),dest);}
  function setLevel(level,plusLevel=0){const slot=selectedSlot();if(!slot)return;const unit=unitFor(api,slot);if(!unit)return;slot.level=clamp(level,1,unit.max??130);slot.plusLevel=clamp(plusLevel,0,unit.maxPlus??0);lineup.levels[String(slot.unitId)]={level:slot.level,plusLevel:slot.plusLevel};update();}
  function nextForm(){const slot=selectedSlot(),unit=unitFor(api,slot);if(!slot||!unit)return;slot.fid=(slot.fid+1)%unit.forms.length;update();}
  function clearBackup(){draft.backup.fill(null);if(position(draft.selected)<0)draft.selected=null;draw();onChange(selectedSlot());}
  function point(event){const rect=canvas.getBoundingClientRect();return clamp(Math.floor((event.clientY-rect.top)/rect.height*3),0,2)*5+clamp(Math.floor((event.clientX-rect.left)/rect.width*5),0,4);}
  function selectIndex(index){draft.selected=getSlot(index)?.unitId??null;draw();onChange(selectedSlot());}
  function openInfo(){const slot=selectedSlot(),unit=unitFor(api,slot),form=formFor(api,slot);if(form)api.navigate('unitInfo',{unit,item:form,level:slot.level,plusLevel:slot.plusLevel??0});}
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;box.focus();dragOrigin=point(event);selectIndex(dragOrigin);if(selectedSlot())canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(dragOrigin===null||!(event.buttons&1))return;const dest=point(event),origin=position(draft.selected);if(origin>=0&&dest!==origin){jump(origin,dest);dragOrigin=position(draft.selected);}});
  canvas.addEventListener('pointerup',()=>{dragOrigin=null;});canvas.addEventListener('pointercancel',()=>{dragOrigin=null;});canvas.addEventListener('contextmenu',event=>{event.preventDefault();selectIndex(point(event));openInfo();});
  function keyboard(event){if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable)return;const digit=event.key.match(/^\d$/);if(digit){event.preventDefault();moveSelected(event.key==='0'?9:Number(event.key)-1);}else if(event.key.toLowerCase()==='d'){event.preventDefault();moveSelected(10);}}
  document.addEventListener('keydown',keyboard);
  function draw(){if(disposed)return;ctx.clearRect(0,0,600,300);const pending=[];slots().forEach((slot,index)=>{const x=index%5*120,y=Math.floor(index/5)*100,form=formFor(api,slot);
    if(!slot){if(glyphs)ctx.drawImage(glyphs.empty,9,21,110,85,x,y,110,85);return;}
    const url=form?.icon;if(url){const cached=imageCache.get(url);if(cached?.image)ctx.drawImage(cached.image,x,y);else pending.push(loadImage(url).then(image=>{const cached=imageCache.get(url);cached.image=image;if(!disposed)draw();}));}
    if(String(slot.unitId)===String(draft.selected)){ctx.strokeStyle=flash?'#ff00ff':'#ffff00';ctx.lineWidth=5;ctx.strokeRect(x+2.5,y+2.5,105,80);}
    if(glyphs){drawNumber(ctx,glyphs,(slot.level??1)+(slot.plusLevel??0),x,y+85/3.5,.8);drawNumber(ctx,glyphs,form?.display?.price??(form?.price??0)*1.5,x,y+85,1,true,api.state.config.lang);}
  });for(const promise of pending)promise.catch(()=>{});}
  loadGlyphs().then(value=>{glyphs=value;draw();}).catch(()=>{});const timer=setInterval(()=>{flash=!flash;draw();},167);
  function dispose(){disposed=true;clearInterval(timer);document.removeEventListener('keydown',keyboard);}
  api.addCleanup?.(dispose);draw();return{element:box,canvas,selectForm,selectedSlot,setLevel,nextForm,clearBackup,moveSelected,draw,dispose,openInfo};
}

function reorderList(list,values,selected,onReorder,kind){
  list.classList.add('bcu-lineup-list');for(const row of list.children)row.draggable=true;
  list.addEventListener('dragstart',event=>{const row=event.target.closest('.list-row');if(!row)return;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-bcu-'+kind,row.dataset.index);});
  list.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('application/x-bcu-'+kind)){event.preventDefault();event.dataTransfer.dropEffect='move';}});
  list.addEventListener('drop',event=>{const row=event.target.closest('.list-row');if(!row)return;const raw=event.dataTransfer.getData('application/x-bcu-'+kind);if(raw==='')return;const from=Number(raw),to=Number(row.dataset.index);if(!Number.isInteger(from)||from<0||from>=values.length)return;event.preventDefault();const item=values.splice(from,1)[0];values.splice(to,0,item);onReorder(values.indexOf(typeof selected==='function'?selected():selected));});
}

function treasurePanel(api,bounds,onChange){
  const shell=api.place(api.element('div',undefined,'bcu-treasure-scroll'),bounds,'lineup-treasures'),content=api.element('div',undefined,'bcu-treasure-rows');shell.append(content);let expanded=-1;
  const current=()=>ensureState(api).treasures;
  function draw(){content.replaceChildren();const values=current();const row=(name,index,{group=-1}={})=>{const line=api.element('div',undefined,'bcu-treasure-row'),heading=api.element(group<0?'div':'button',name);if(group>=0){heading.type='button';heading.setAttribute('aria-pressed',String(expanded===group));heading.addEventListener('click',()=>{expanded=expanded===group?-1:group;draw();});}else heading.style.color='blue';const field=api.element('input');const same=group>=0?values.slice(GROUPS[group][0],GROUPS[group][0]+GROUPS[group][1]).every(value=>value===values[index]):true;field.value=group>=0?(!same?'---':(group===0||group===5?'Lv.':'')+values[index]+(group===0||group===5?'':'%')):index<8||index>=29?'Lv.'+values[index]:values[index]+'%';field.disabled=group>=0||!SUPPORTED_TREASURES.has(index)||!api.engine?.unitLevelMultiplier;
    if(field.disabled)field.title=group>=0?'Expand this category to inspect individual treasure values.':'Displayed from BCU; this treasure needs a browser battle adapter.';
    field.addEventListener('change',async()=>{const value=Number(field.value.match(/\d+/)?.[0]);if(Number.isFinite(value)){values[index]=clamp(value,0,index<8?30:300);await api.save?.();onChange();draw();}});line.append(heading,field);content.append(line);};
    for(let i=0;i<51;){const group=GROUPS.findIndex(([start])=>start===i);if(group>=0){const[start,count]=GROUPS[group];row(text(api,'tc'+group,'','util'),i,{group});if(expanded===group)for(let index=start;index<start+count;index++)row(text(api,'t'+ORDER[index],'','util'),index);i+=count;}else{row(text(api,'t'+ORDER[i],'','util'),i);i++;}}
  }draw();return{draw};
}

export function renderLineup(rawApi){
  const api=apiFor(rawApi);style();let set=ensureState(api);const {state,catalog,button,label,input,list,table,place,element,navigate,t}=api;api.backButton();
  let activeSet=state.basisSet,selectedLine=set.selected,disposed=false,picker;
  const bounds=api.layouts?.pages?.BasisPage?.defaultPlacements??{},at=(id,fallback)=>bounds[id]??fallback;
  const byId=id=>catalog.units.find(unit=>String(unit.id)===String(id));
  const pcoin=label('',at('pcoin',[500,50,1200,50]),'pcoin');
  const level=input('',at('lvjtf',[500,100,400,50]),null,{id:'lvjtf'});level.disabled=true;level.addEventListener('change',()=>{const values=level.value.match(/\d+/g)?.map(Number);if(values?.length)picker.setLevel(values[0],values[1]??0);});level.addEventListener('keydown',event=>{if(event.key==='Enter')level.blur();});
  const orb=button('orb',at('lvorb',[900,100,200,50]),null,{disabled:true,title:'Talent and orb validation are not ported yet.'});
  const sets=list(at('jspbs',[50,100,200,500]),state.basisSets,(_,index)=>switchSet(index),{id:'basis-sets',selected:activeSet});
  const lines=list(at('jspb',[275,100,200,500]),set.lineups,(_,index)=>switchLine(index),{id:'lineups',selected:selectedLine});
  const setName=input(set.name,at('bsjtf',[50,750,200,50]),null,{id:'bsjtf'});setName.addEventListener('change',()=>{if(setName.value.trim())set.name=setName.value.trim();else setName.value=set.name;refreshLists();api.save?.();});
  const lineName=input(set.lineups[selectedLine].name,at('bjtf',[275,750,200,50]),null,{id:'bjtf'});lineName.addEventListener('change',()=>{const line=set.lineups[selectedLine];if(lineName.value.trim())line.name=lineName.value.trim();else lineName.value=line.name;refreshLists();api.save?.();});
  const removeSet=button('remove-set',at('bsrem',[50,650,200,50]),async()=>{if(set.id===state.defaultBasisSet)return;state.basisSets.splice(activeSet,1);await switchSet(state.basisSets.length-1);},{text:t('rem'),disabled:set.id===state.defaultBasisSet});
  button('add-set',at('bsadd',[50,600,200,50]),async()=>{state.basisSets.push({id:uuid(),name:'set '+state.basisSets.length,lineups:[emptyLineup()],selected:0,treasures:defaultTreasures(api)});await switchSet(state.basisSets.length-1);},{text:t('add')});
  button('copy-set',at('bscop',[50,700,200,50]),async()=>{const next=clone(set);next.id=uuid();next.name='set '+state.basisSets.length;next.lineups.forEach((line,index)=>{line.id=uuid();line.name='lineup '+index;});next.selected=next.lineups.length-1;state.basisSets.push(next);await switchSet(state.basisSets.length-1);},{text:t('copy')});
  const removeLine=button('remove-lineup',at('brem',[275,650,200,50]),async()=>{if(set.lineups.length<=1)return;set.lineups.splice(selectedLine,1);await switchLine(0);},{text:t('rem'),disabled:set.lineups.length<=1});
  button('add-lineup',at('badd',[275,600,200,50]),async()=>{const next=emptyLineup('lineup '+set.lineups.length),insert=selectedLine+1;set.lineups.splice(insert,0,next);await switchLine(insert);},{text:t('add')});
  button('copy-lineup',at('bcop',[275,700,200,50]),async()=>{const next=clone(set.lineups[selectedLine]);next.id=uuid();next.name='lineup '+set.lineups.length;set.lineups.push(next);await switchLine(set.lineups.length-1);},{text:t('copy')});
  button('form',at('form',[500,450,200,50]),()=>picker.nextForm());button('renew',at('reset',[700,450,200,50]),()=>picker.clearBackup());
  const modifier=list(at('jspcn',[500,500,600,250]),[],null,{id:'combo-modifiers'});modifier.title='Combo modifiers are not ported yet.';modifier.setAttribute('aria-disabled','true');
  const comboSearch=input('',at('cjtf',[500,750,400,50]),null,{id:'combo-search'});comboSearch.disabled=true;comboSearch.title='The original combo index is not ported yet.';
  button('set0',at('setc',[900,750,200,50]),null,{disabled:true,title:'The original combo index is not ported yet.'});button('combo',at('combo',[1100,750,200,50]),null,{disabled:true,toggle:true,title:'The original combo index is not ported yet.'});
  const comboColumns=[{label:'name'},{label:'Lv.'},{label:t('desc','Description','info')},{label:t('group','Group','info')},...Array.from({length:5},(_,i)=>({label:t('unit','Unit','info')+' '+(i+1)}))];table(at('jspc',[50,800,1550,450]),comboColumns,[],{id:'combo-table'}).title='The original combo index is not ported yet.';
  const categories=Array.from({length:6},(_,i)=>({name:text(api,'na'+i,'','util')}));const types=Array.from({length:29},(_,i)=>({name:text(api,'nb'+i,'','util')}));
  const categoryList=list(at('jspcs',[1600,800,300,450]),categories,null,{id:'combo-categories',selected:0});categoryList.setAttribute('aria-disabled','true');categoryList.title='Combo filtering is not ported yet.';
  const typeList=list(at('jspcl',[1900,800,300,450]),types,null,{id:'combo-types'});typeList.setAttribute('aria-disabled','true');typeList.title='Combo filtering is not ported yet.';
  let currentUnits=catalog.units.map(unit=>({unit,form:unit.forms.at(-1),name:pad(unit.id)+' '+unit.forms.at(-1).name}));
  const unitList=list(at('jspul',[1450,150,300,600]),currentUnits,item=>picker.selectForm(item.form,item.unit),{id:'lineup-units',render:item=>{const row=element('span'),image=element('img');image.src=item.form.icon;image.alt='';row.append(image,document.createTextNode(item.name));return row;}});
  const search=input('',at('ujtf',[1450,100,300,50]),value=>{if(state.config.searchPerKey)filterUnits(value);},{id:'unit-search',placeholder:'Search cat'});search.addEventListener('change',()=>filterUnits(search.value));search.addEventListener('keydown',event=>{if(event.key==='Enter')filterUnits(search.value);});
  button('vuif',at('unit',[1500,50,200,50]),()=>navigate('unitData',{lineupPicker:true}));
  const castle=place(element('div',undefined,'bcu-castle-box'),at('ncb',[1220,160,128,256]),'cat-castle'),castleCanvas=element('canvas');castleCanvas.width=128;castleCanvas.height=256;castle.append(castleCanvas);let castleGeneration=0;
  for(let i=0;i<3;i++){button('castle-left-'+i,[1100,160+103*i,100,50],()=>changeCastle(i,-1),{text:'<'});button('castle-right-'+i,[1350,160+103*i,100,50],()=>changeCastle(i,1),{text:'>'});}
  const treasures=treasurePanel(api,at('jspt',[1750,150,450,600]),()=>picker.draw());
  function selected(slot){level.disabled=!slot;if(!slot){level.value='';pcoin.textContent='';return;}const unit=byId(slot.unitId);level.value=slot.level+(slot.plusLevel?' + '+slot.plusLevel:'');pcoin.textContent='';orb.disabled=true;}
  function mountPicker(){if(picker){picker.dispose();picker.element.remove();}picker=createLineupCanvas(api,at('lub',[500,150,600,300]),selected);selected(picker.selectedSlot());}
  function refreshLists(){sets.setItems(state.basisSets,activeSet);lines.setItems(set.lineups,selectedLine);for(const row of sets.children)row.draggable=true;for(const row of lines.children)row.draggable=true;setName.value=set.name;lineName.value=set.lineups[selectedLine].name;removeSet.disabled=set.id===state.defaultBasisSet;removeLine.disabled=set.lineups.length<=1;}
  async function switchSet(index){state.basisSet=index;set=ensureState(api);activeSet=state.basisSet;selectedLine=set.selected;mountPicker();refreshLists();treasures.draw();await drawCastle();await api.save?.();}
  async function switchLine(index){set.selected=clamp(index,0,set.lineups.length-1);state.lineup=set.selected;selectedLine=set.selected;state.lineups=set.lineups;mountPicker();refreshLists();await drawCastle();await api.save?.();}
  function filterUnits(query){const lower=query.trim().toLowerCase();currentUnits=catalog.units.map(unit=>({unit,form:unit.forms.at(-1),name:pad(unit.id)+' '+unit.forms.at(-1).name})).filter(item=>!lower||item.unit.forms.some(form=>form.name.toLowerCase().includes(lower))||String(item.unit.id)===lower);unitList.setItems(currentUnits);}
  async function drawCastle(){const generation=++castleGeneration,nyc=set.lineups[selectedLine].nyc;try{const images=await Promise.all([0,2,3].map((part,i)=>loadImage('assets/org/castle/'+pad(part)+'/nyankoCastle_'+pad(part)+'_0'+nyc[i]+'.png')));if(disposed||generation!==castleGeneration)return;const ctx=castleCanvas.getContext('2d');ctx.clearRect(0,0,128,256);ctx.drawImage(images[2],0,128);ctx.drawImage(images[0],0,-2);ctx.drawImage(images[1],0,128);}catch(error){castle.title=error.message;}}
  function changeCastle(index,delta){const nyc=set.lineups[selectedLine].nyc;nyc[index]=(nyc[index]+delta+8)%8;drawCastle();api.save?.();}
  reorderList(sets,state.basisSets,()=>set,index=>{state.basisSet=index;activeSet=index;refreshLists();api.save?.();},'sets');
  // Reorder handlers resolve the current set each time rather than retaining a
  // list from a previously selected set.
  lines.addEventListener('dragstart',event=>{const row=event.target.closest('.list-row');if(row)event.dataTransfer.setData('application/x-bcu-lineup',row.dataset.index);});lines.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('application/x-bcu-lineup'))event.preventDefault();});lines.addEventListener('drop',event=>{const row=event.target.closest('.list-row');if(!row)return;const raw=event.dataTransfer.getData('application/x-bcu-lineup');if(raw==='')return;const from=Number(raw),to=Number(row.dataset.index);if(!Number.isInteger(from)||from<0||from>=set.lineups.length)return;event.preventDefault();const current=set.lineups[selectedLine],line=set.lineups.splice(from,1)[0];set.lineups.splice(to,0,line);selectedLine=set.lineups.indexOf(current);set.selected=selectedLine;state.lineup=selectedLine;refreshLists();api.save?.();});
  mountPicker();refreshLists();drawCastle();api.addCleanup?.(()=>{disposed=true;castleGeneration++;api.save?.();});
}
