// Browser adapters for the original ConfigPage, data filters and info panels.
// Geometry and headings follow the supplied BCU Swing pages. BCU's exported
// TeaVM growth/stat routines provide the values; unsupported controls stay
// disabled instead of claiming to change a missing subsystem.

import { createLineupCanvas } from './lineup.mjs';

const UNIT_PROCS = ['BSTHUNT','KB','STOP','SLOW','WEAK','BOUNTY','CRIT','METALKILL','WAVE','MINIWAVE','VOLC','MINIVOLC','BARRIER','DEMONSHIELD','BREAK','SHIELDBREAK','WARP','CURSE','SEAL','SATK','POIATK','ATKBASE','SUMMON','MOVEWAVE','SNIPER','BOSS','TIME','THEME','POISON','ARMOR','SPEED','STRONG','SPEEDUP','LETHAL','BURROW','REVIVE','HPREGEN','CRITI','COUNTER','IMUATK','DMGCUT','DMGCAP','IMUKB','IMUSTOP','IMUSLOW','IMUWAVE','IMUWEAK','IMUWARP','IMUCURSE','IMUSEAL','IMUMOVING','IMUARMOR','IMUPOI','IMUPOIATK','IMUVOLC','IMUSPEED','IMUSUMMON','DEATHSURGE','SPIRIT','BLAST','IMUBLAST','DELAY','IMUDELAY','LETHARGY'];
const ENEMY_PROCS = UNIT_PROCS.filter(name => !['BSTHUNT','BOUNTY','SPIRIT'].includes(name));
const ENEMY_ABILITIES = [19,5,6,7,8,11,12];
const TREASURE_GROUPS = [[0,8],[8,6],[14,3],[17,4],[21,3],[29,22]];
const TREASURE_ORDER = [0,1,18,19,20,21,22,23,2,3,4,5,24,25,26,27,28,6,7,8,9,10,11,12,13,14,15,16,17,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50];
const SUPPORTED_TREASURES = new Set([0,1,8,9,10,11]);
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const pad = value => String(value).padStart(3,'0');
const textDescription = text => String(text??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,'');

function adapter(api){return {...api,...api.helpers};}
function installStyles(){
  if(document.getElementById('bcu-information-styles'))return;
  const style=document.createElement('style');style.id='bcu-information-styles';
  style.textContent=`.bcu-info-content{position:relative;width:96.9697%;--info-row:calc((100dvh - 22px)*50/1300)}.bcu-info-form{position:relative;width:100%;margin-bottom:var(--info-row)}.bcu-info-cell{position:absolute;display:flex;align-items:center;overflow:hidden;white-space:pre-wrap;border:2px groove #ddd;padding:0 2px;min-width:0;min-height:0}.bcu-info-cell.center{justify-content:center;text-align:center}.bcu-info-cell img{max-height:100%;max-width:100%;object-fit:contain}.bcu-info-cell input{width:100%;height:100%;min-width:0;text-align:left}.bcu-info-cell.description{align-items:flex-start;white-space:pre-wrap;overflow:auto;padding:3px}.bcu-info-cell.proc{gap:4px}.bcu-info-cell.proc img{max-width:8%;height:100%;object-fit:contain}.bcu-filter-row{padding:1px 3px;min-height:var(--row-height);white-space:nowrap;display:flex;align-items:center;user-select:none}.bcu-filter-row[aria-selected=true]{background:var(--selection)}.bcu-filter-row[aria-disabled=true]{color:#999}.bcu-filter-row img,.bcu-filter-button img{height:calc(var(--row-height)*.85);max-width:35%;object-fit:contain;margin-right:3px}.bcu-filter-button{display:flex;align-items:center;justify-content:center;padding:0 2px;overflow:hidden}.bcu-filter-button span{overflow:hidden}.bcu-treasure-label{border:2px groove #ddd;justify-content:center;text-align:center}.bcu-info-scroll{overflow:auto;border:1px solid var(--border)}.bcu-info-missing{color:#777}.bcu-info-cell input:disabled{box-shadow:none;color:inherit;opacity:1}`;
  document.head.append(style);
}

function boundsFor(api,name){const source=api.layouts?.pages?.[name]?.defaultPlacements??{};return Array.isArray(source)?Object.fromEntries(source.map(item=>[item.id,item.bounds])):source;}
function setWidgetBounds(el,bounds){el.dataset.bounds=bounds.join(',');const page=el.parentElement;Object.assign(el.style,{left:Math.floor(bounds[0]*page.clientWidth/2300)+'px',top:Math.floor(bounds[1]*page.clientHeight/1300)+'px',width:Math.floor(bounds[2]*page.clientWidth/2300)+'px',height:Math.floor(bounds[3]*page.clientHeight/1300)+'px'});}
function saveSoon(api){return api.save?.();}
function supported(api,key){const values=api.supportedSettings;return values instanceof Set?values.has(key):Array.isArray(values)?values.includes(key):false;}
function metadataIcon(api,type,index){const icons=api.catalog?.[type+'Icons'];const value=icons?.[index];return typeof value==='string'?value:value?.icon??value?.path;}
function iconElement(api,path,alt=''){if(!path)return null;const img=api.element('img');img.src=encodeURI(path);img.alt=alt;img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});return img;}
function procMetadata(api,key){const item=api.catalog.procMetadata?.[key];return typeof item==='string'?{name:item}:item??{};}
function localized(api,key,fallback=key,section='page'){let text=api.t(key,fallback,section);for(let i=0;i<8;i++){const next=text.replace(/#([^#]+)#/g,(_,linked)=>api.t(linked,linked,section));if(next===text)break;text=next;}return text;}
function traitName(api,index){return localized(api,'c'+index,String(index),'util');}
function procName(api,key,short=false){const meta=procMetadata(api,key);return short?(meta.abbr??meta.abbr_name??meta.name??meta.full_name??key):(meta.name??meta.full_name??meta.abbr??key);}
function abilityName(api,index,short=true){return short?localized(api,'sa'+index,'Ability '+index,'util'):api.catalog.abilities?.[index]?.name??localized(api,'a'+index,'Ability '+index,'util');}
function preferredLevel(api,unit){return Math.min(Math.max(1,Number(api.state.config.prefLevel)||50),unit.max??50);}
function preferredPlus(api,unit){return Math.min(unit.maxPlus??0,unit.rarity<2&&unit.maxPlus>0?Math.trunc(((Number(api.state.config.prefLevel)||50)-1)/49*unit.maxPlus):0);}

function treasureState(api){
  if(!Array.isArray(api.state.treasures)){
    api.state.treasures=api.catalog.treasureValues?[...api.catalog.treasureValues]:Array.from({length:51},(_,i)=>i<8?(i===7?10:30):i===24?600:i===25?1500:i>=26&&i<=28?100:i>=29?30:300);
  }
  return api.state.treasures;
}

function calculatedStats(api,item,unit,level,{info=false}={}){
  const raw=item.maxStats??item,display=item.display??raw,engine=api.engine;
  if(!unit)return {...raw,dps:Math.trunc((raw.attack??0)*30/(raw.attackInterval||1)),drop:item.displayDrop??item.drop,foreswing:raw.rawAttacks?.[0]?.[1]};
  const trea=treasureState(api),atkTreasure=Number(trea[8]??300),defTreasure=Number(trea[9]??300),curve=unit.levelCurve?.join(',');
  let hp=display.hp,attack=display.attack,dps=display.dps,multiplier=null;
  if(engine?.unitLevelMultiplier&&curve){
    multiplier=engine.unitLevelMultiplier(curve,level);
    if(engine.unitStatValue){
      hp=engine.unitStatValue(curve,level,raw.hp,raw.attack,raw.attackInterval,atkTreasure,defTreasure,info?3:0);
      attack=engine.unitStatValue(curve,level,raw.hp,raw.attack,raw.attackInterval,atkTreasure,defTreasure,1);
      dps=engine.unitStatValue(curve,level,raw.hp,raw.attack,raw.attackInterval,atkTreasure,defTreasure,2);
    }else{
      const atkMulti=Math.fround(1+Math.fround(atkTreasure*Math.fround(.005))),defMulti=Math.fround(1+Math.fround(defTreasure*Math.fround(.005)));
      hp=Math.trunc((info?Math.round(raw.hp*multiplier):raw.hp*multiplier)*defMulti);
      attack=Math.trunc(Math.round(raw.attack*multiplier)*atkMulti);
      dps=Math.trunc(raw.attack*multiplier*atkMulti*30/(raw.attackInterval||1));
    }
  }
  const research=(Number(trea[0]??30)-1)*6+Math.fround(Number(trea[10]??300)*Math.fround(.3));
  return {...raw,...display,hp,attack,dps,level,respawn:Math.trunc(Math.max(60,(item.respawn??raw.respawn??display.respawn??60)-research)),price:display.price??(item.price??0)*1.5,foreswing:raw.rawAttacks?.[0]?.[1],levelMultiplier:multiplier};
}

function enemyDrop(api,item){const values=treasureState(api),multiplier=Math.fround(Math.fround(Math.fround(.95)+Math.fround(Math.fround(.05)*Number(values[1]??30)))+Math.fround(Math.fround(.005)*Number(values[11]??300)));return Math.floor(Math.fround((item.drop??0)*multiplier))/100;}

export function renderConfig(rawApi){
  const api=adapter(rawApi);installStyles();const {state,button,label,input,check,list,t,navigate,backButton}=api,cfg=state.config;
  cfg.filterType??=1;cfg.searchTolerance??=4;cfg.dynamicSearch??=false;cfg.searchPerKey??=false;cfg.seconds??=false;
  const bounds=boundsFor(api,'ConfigPage'),descriptors=new Map((api.layouts?.pages?.ConfigPage?.resolvedWidgets??[]).map(item=>[item.id,item]));
  const done=new Set(['back']);backButton();
  const text=id=>{const desc=descriptors.get(id);return desc?.localeKey?t(desc.localeKey,desc.text,desc.section??'page'):desc?.text??'';};
  function bindCheck(id,key,fallback,{enabled=true}={}){if(!bounds[id])return;done.add(id);const el=check(id,bounds[id],cfg[key],async value=>{cfg[key]=value;await saveSoon(api);},fallback??text(id));if(!enabled){el.querySelector('input').disabled=true;el.title='This desktop setting has no browser adapter yet.';}return el;}
  function bindInput(id,key,{type='number',min=0,max=100,enabled=true,format=value=>value,parse=value=>Number(value)}={}){if(!bounds[id])return;done.add(id);const el=input(format(cfg[key]),bounds[id],async value=>{const next=parse(value);if(Number.isFinite(next)){cfg[key]=clamp(next,min,max);await saveSoon(api);}},{id,type,min,max});el.disabled=!enabled;if(!enabled)el.title='This desktop setting has no browser adapter yet.';return el;}
  function bindToggle(id,key,onKey,offKey,{enabled=true,initial=false}={}){if(!bounds[id])return;done.add(id);if(cfg[key]===undefined)cfg[key]=initial;return button(id,bounds[id],async el=>{cfg[key]=!cfg[key];el.textContent=t(cfg[key]?onKey:offKey);api.applyTheme?.();await saveSoon(api);},{text:t(cfg[key]?onKey:offKey),disabled:!enabled});}
  bindCheck('whit','white',undefined,{enabled:supported(api,'white')});bindCheck('refe','axis',undefined,{enabled:supported(api,'axis')});bindCheck('perfo','performance','60 FPS');
  bindCheck('musc','music',undefined,{enabled:supported(api,'music')});bindCheck('jcsea','searchPerKey');
  bindInput('jsbg','volumeBG',{type:'range'});bindInput('jsse','volumeSE',{type:'range',enabled:supported(api,'volumeSE')});bindInput('jsui','volumeUI',{type:'range',enabled:supported(api,'volumeUI')});
  bindInput('prlvmd','prefLevel',{min:1,max:130});bindInput('tole','searchTolerance',{min:0,max:50});
  bindInput('savetime','autosave',{type:'text',min:0,max:1440,format:value=>value>0?value+'min':'deactivated',parse:value=>value.trim()==='deactivated'?0:parseInt(value,10),enabled:supported(api,'autosave')});
  bindToggle('secs','seconds','secs','frame');bindToggle('row','twoRow','tworow','onerow');
  if(bounds.theme){done.add('theme');button('theme',bounds.theme,async el=>{cfg.light=!cfg.light;el.textContent=t(cfg.light?'themel':'themed');api.applyTheme?.();await saveSoon(api);},{text:t(cfg.light?'themel':'themed')});}
  if(bounds.filt){done.add('filt');cfg.filterType??=1;button('filt',bounds.filt,async el=>{cfg.filterType=cfg.filterType===1?0:1;el.textContent=t('filter'+cfg.filterType);await saveSoon(api);},{text:t('filter'+cfg.filterType)});}
  if(bounds.dyna){done.add('dyna');button('dyna',bounds.dyna,async el=>{cfg.dynamicSearch=el.getAttribute('aria-pressed')==='true';await saveSoon(api);},{text:t('dynamic'),toggle:true,selected:cfg.dynamicSearch??false});}
  if(bounds.jsps){done.add('jsps');const codes=['en','zh','kr','jp','ru','de','fr','es','it'].filter(code=>api.locales[code]);list(bounds.jsps,codes,async lang=>{cfg.lang=lang;await saveSoon(api);await navigate('config',{},false);},{id:'language-list',selected:codes.indexOf(cfg.lang),render:code=>({en:'English',zh:'中文',kr:'한국어',jp:'日本語',ru:'Русский',de:'Deutsche',fr:'Français',es:'Español',it:'Italiano'}[code]??code)});}
  if(bounds.rlla){done.add('rlla');button('rllang',bounds.rlla,async()=>{const response=await fetch('data/locales.json',{cache:'reload'});if(!response.ok)throw new Error('Could not reload language files.');Object.assign(api.locales,await response.json());await navigate('config',{},false);},{text:t('rllang')});}
  if(bounds.nimbus){done.add('nimbus');button('nimbus',bounds.nimbus,null,{text:t('tdefault'),disabled:true,title:'The browser currently implements the default desktop theme.'});}
  const names=['opacity','color','accuracy','scale'],renderValues=[1,1,1,2];
  for(let i=0;i<4;i++){
    for(const id of ['name['+i+']','vals['+i+']','left['+i+']','right['+i+']'])done.add(id);
    if(bounds['name['+i+']'])label(t(names[i]),bounds['name['+i+']'],'name['+i+']');
    if(bounds['vals['+i+']'])label(t(['fast','default','quality'][renderValues[i]]),bounds['vals['+i+']'],'vals['+i+']');
    if(bounds['left['+i+']'])button('left['+i+']',bounds['left['+i+']'],null,{text:'<',disabled:true,title:'Desktop renderer quality modes have no browser adapter yet.'});
    if(bounds['right['+i+']'])button('right['+i+']',bounds['right['+i+']'],null,{text:'>',disabled:true,title:'Desktop renderer quality modes have no browser adapter yet.'});
  }
  for(const [id,rect] of Object.entries(bounds)){
    if(done.has(id))continue;const desc=descriptors.get(id);if(!desc)continue;
    if(['JL','JLabel'].includes(desc.type)){label(id==='comv'?'CORE Ver: '+(api.catalog.version??''):text(id),rect,id);continue;}
    if(['JCB','JCheckBox'].includes(desc.type)){const el=check(id,rect,false,()=>{},text(id));el.querySelector('input').disabled=true;el.title='This desktop setting has no browser adapter yet.';continue;}
    if(['JBTN','JTG','JButton'].includes(desc.type)){button(id,rect,null,{text:text(id)||id,disabled:true,title:'This desktop setting has no browser adapter yet.'});continue;}
    if(desc.type==='JSlider'){const el=input(id==='jsmin'?10:id==='jsmax'?100:0,rect,null,{type:'range',min:0,max:100,id});el.disabled=true;el.title='This desktop setting has no browser adapter yet.';}
  }
  api.addCleanup?.(()=>saveSoon(api));
}

// This is the same optimal-string-alignment distance and substring shortcut
// used by desktop UtilPC.damerauLevenshteinDistance.
function distance(source,compare){
  if(source.includes(compare))return 0;
  const table=Array.from({length:source.length+1},()=>new Uint16Array(compare.length+1));
  for(let i=0;i<=source.length;i++)table[i][0]=i;for(let j=0;j<=compare.length;j++)table[0][j]=j;
  for(let i=1;i<=source.length;i++)for(let j=1;j<=compare.length;j++){
    table[i][j]=Math.min(table[i-1][j]+1,table[i][j-1]+1,table[i-1][j-1]+(source[i-1]===compare[j-1]?0:1));
    if(i>1&&j>1&&source[i-1]===compare[j-2]&&source[i-2]===compare[j-1])table[i][j]=Math.min(table[i][j],table[i-2][j-2]+1);
  }return table[source.length][compare.length];
}

function filterNames(items,query,config){
  query=query.toLowerCase();if(!query)return items;
  if(config.dynamicSearch){const tolerances=[0,0,0,0,1,1,1,2,2,2,3],length=query.length,tolerance=tolerances[Math.min(tolerances.length-1,length)];return items.filter(item=>{const name=String(item.name??'').toLowerCase();if(!name)return false;if(length===1)return name.startsWith(query)||name.includes(' '+query);if(length<=3)return name.startsWith(query)||name.includes(' '+query)||name.includes(query+' ')||name.endsWith(query);return name.includes(query)||(name[0]===query[0]&&distance(name.slice(0,Math.min(name.length,length+tolerance)),query)<=2*tolerance);});}
  let minDiff=Number(config.searchTolerance??4);const results=[];
  for(const item of items){const diff=distance(String(item.name??'').toLowerCase(),query);minDiff=Math.min(minDiff,diff);if(diff===minDiff)results.push(item);}return results;
}

function multiList(api,bounds,items,selection,onChange,id){
  const el=api.element('div',undefined,'list');el.role='listbox';el.tabIndex=0;el.setAttribute('aria-multiselectable','true');let anchor=0,focus=0;
  function draw(){el.replaceChildren();for(let i=0;i<items.length;i++){const item=items[i],row=api.element('div',undefined,'bcu-filter-row');row.role='option';row.dataset.index=i;row.setAttribute('aria-selected',String(selection.has(item.key)));if(item.disabled){row.setAttribute('aria-disabled','true');row.title=item.title??'This filter needs data that has not been exported.';}const icon=iconElement(api,item.icon);if(icon)row.append(icon);row.append(document.createTextNode(item.name));el.append(row);}}
  function select(index,event={}){const item=items[index];if(!item||item.disabled)return;if(event.shiftKey){if(!event.ctrlKey&&!event.metaKey)selection.clear();for(let i=Math.min(anchor,index);i<=Math.max(anchor,index);i++)if(!items[i].disabled)selection.add(items[i].key);}else if(event.ctrlKey||event.metaKey){if(selection.has(item.key))selection.delete(item.key);else selection.add(item.key);anchor=index;}else{selection.clear();selection.add(item.key);anchor=index;}focus=index;draw();el.children[index]?.scrollIntoView({block:'nearest'});onChange();}
  el.addEventListener('click',event=>{const row=event.target.closest('.bcu-filter-row');if(row&&el.contains(row))select(Number(row.dataset.index),event);});
  el.addEventListener('keydown',event=>{if(event.key==='Escape'){selection.clear();draw();onChange();event.preventDefault();return;}let index=focus;if(event.key==='ArrowDown')index=Math.min(items.length-1,focus+1);else if(event.key==='ArrowUp')index=Math.max(0,focus-1);else if(event.key==='Home')index=0;else if(event.key==='End')index=items.length-1;else if(event.key===' '){select(index,{ctrlKey:true});event.preventDefault();return;}else return;event.preventDefault();select(index,event);});
  draw();api.place(el,bounds,id);return el;
}

function typeMatches(raw,type){const atks=raw.rawAttacks??[];switch(type){case 0:return !raw.area;case 1:return !!raw.area;case 2:return !!raw.longDistance;case 3:return atks.length>1;case 4:return !!raw.omni;case 5:return (raw.tba??0)+(atks[0]?.[1]??0)<(raw.attackInterval??0)/2;case 6:return !!raw.hasRevenge;case 7:return !!raw.hasResurrection;default:return false;}}
function enemyRarity(api,item,index){
  if(item.categories)return !!item.categories[index];
  if(index===0)return !!item.inDictionary;if(index===1)return item.star===1;if(index===3)return !item.inDictionary;if(index===5)return !!item.pack&&item.pack!=='000000';
  return false;
}

export function renderData(kind,params={},rawApi){
  const api=adapter(rawApi);installStyles();const {catalog,state,button,input,label,table,navigate,backButton,t}=api,isUnit=kind==='unit';backButton();
  const all=isUnit?catalog.units.flatMap(unit=>unit.forms.map(form=>({...form,unit,unitId:unit.id,rarity:unit.rarity}))):catalog.enemies;
  const initial=params.filter?all.filter(params.filter):all;let filterVisible=true,filterType=state.config.filterType??1;
  const selected={rarity:new Set(),trait:new Set(),abilities:new Set(),attack:new Set()},operators={rarity:false,trait:false,abilities:false,attack:false};
  let includeCustom=true;const filterWidgets=[],procKeys=isUnit?UNIT_PROCS:ENEMY_PROCS,abilityIds=isUnit?Array.from({length:22},(_,i)=>i):ENEMY_ABILITIES;
  const missingRevenge=!initial.some(item=>'hasRevenge' in (item.maxStats??item));
  const rarityItems=Array.from({length:isUnit?6:7},(_,i)=>({key:i,name:t((isUnit?'r':'er')+i,'','util'),disabled:!isUnit&&[2,4,6].includes(i)&&!initial.some(item=>item.categories),title:'This category requires the original stage-appearance index.'}));
  const traitItems=Array.from({length:isUnit?10:17},(_,i)=>({key:i,name:traitName(api,i),icon:metadataIcon(api,'trait',i)}));
  const abilityItems=abilityIds.map(index=>({key:'ability:'+index,name:abilityName(api,index),icon:metadataIcon(api,'ability',index)}));
  const procItems=procKeys.map(key=>({key:'proc:'+key,name:procName(api,key,true),icon:procMetadata(api,key).icon}));
  const attackItems=Array.from({length:8},(_,i)=>({key:i,name:t('aa'+i,'','util'),icon:metadataIcon(api,'attack',i),disabled:i>=6&&missingRevenge,title:'This attack type was not exported.'}));
  const cache=new Map();function stats(item){if(!cache.has(item)){const level=isUnit?preferredLevel(api,item.unit):0;cache.set(item,calculatedStats(api,item,item.unit,level));}return cache.get(item);}
  const columns=isUnit?[
    {label:'ID',value:item=>(item.pack??'000000')+'/'+item.unitId+'-'+item.fid},{label:'name',value:item=>item.name,render:item=>nameNode(item)},
    {label:t('pref','Level','info'),value:item=>preferredLevel(api,item.unit)},
    {label:'HP',value:item=>stats(item).hp},{label:t('hb','KB','info'),value:item=>stats(item).kb},{label:'atk',value:item=>stats(item).attack},
    {label:t('range','Range','info'),value:item=>stats(item).range},{label:t('speed','Speed','info'),value:item=>stats(item).speed},{label:'dps',value:item=>stats(item).dps},
    {label:t('preaa','Foreswing','info'),value:item=>stats(item).foreswing},{label:'CD',value:item=>stats(item).respawn},{label:t('price','Cost','info'),value:item=>stats(item).price},
    {label:t('atkf','Attack frequency','info'),value:item=>stats(item).attackInterval},{label:t('will','Will','info'),value:item=>stats(item).will??item.display?.will??'—'}
  ]:[
    {label:'ID',value:item=>(item.pack??'000000')+'/'+item.id},{label:'name',value:item=>item.name,render:item=>nameNode(item)},
    {label:t('HP','HP','info'),value:item=>item.hp},{label:t('hb','KB','info'),value:item=>item.kb},{label:t('atk','Attack','info'),value:item=>item.attack},
    {label:t('range','Range','info'),value:item=>item.range},{label:t('atkf','Attack frequency','info'),value:item=>item.attackInterval},{label:t('speed','Speed','info'),value:item=>item.speed},
    {label:t('drop','Money','info'),value:item=>enemyDrop(api,item)},{label:t('preaa','Foreswing','info'),value:item=>item.rawAttacks?.[0]?.[1]},
    {label:'dps',value:item=>Math.trunc(item.attack*30/(item.attackInterval||1))},{label:t('minpos','Min position','info'),value:item=>item.limit??'—'},{label:t('will','Will','info'),value:item=>item.will??'—'}
  ];
  function nameNode(item){const span=api.element('span');const img=iconElement(api,item.icon);if(img)span.append(img);span.append(document.createTextNode(item.name??''));return span;}
  const picker=isUnit&&params.lineupPicker?createLineupCanvas(api,[1650,950,600,300]):null;
  const gridBounds=visible=>!visible?(picker?[50,100,1550,1150]:[50,100,2200,1150]):filterType===1?(picker?[550,100,1700,800]:[550,100,1700,1150]):(picker?[50,500,1550,750]:[50,500,2200,750]);
  const grid=table(gridBounds(true),columns,initial,{id:'data-grid',sortable:true,onSelect:item=>{picker?.selectForm(item,item.unit);params.onChoose?.(item,item.unit);},onOpen:item=>navigate(isUnit?'unitInfo':'enemyInfo',{item,unit:item.unit,items:currentRows})});let currentRows=initial;
  const search=input(params.search??'',[550,0,1000,50],()=>{if(state.config.searchPerKey)apply();},{id:'seatf',placeholder:isUnit?'Search cat':'Search enemy'});search.addEventListener('keydown',event=>{if(event.key==='Enter')apply();});search.addEventListener('blur',()=>apply());
  if(!isUnit)label('Source of enemy icon: DB',[0,50,600,50]);
  button('showf',[250,0,200,50],el=>{filterVisible=el.getAttribute('aria-pressed')==='true';for(const widget of filterWidgets)widget.hidden=!filterVisible;setWidgetBounds(grid,gridBounds(filterVisible));},{toggle:true,selected:true});
  function groupMatches(values,group,predicate){if(!values.size)return true;return operators[group]?[...values].some(predicate):[...values].every(predicate);}
  function apply(){
    const values=initial.filter(item=>{const raw=item.maxStats??item;
      if(!includeCustom&&item.pack&&item.pack!=='000000')return false;
      if(isUnit){if(selected.rarity.size&&!selected.rarity.has(item.rarity))return false;}else if(!groupMatches(selected.rarity,'rarity',index=>enemyRarity(api,item,index)))return false;
      if(!groupMatches(selected.trait,'trait',index=>(raw.traits??[]).includes(index)))return false;
      if(!groupMatches(selected.abilities,'abilities',key=>{const [type,value]=key.split(':');return type==='ability'?((raw.ability??0)>>>Number(value)&1)===1:Object.hasOwn(raw.procs??{},value);}))return false;
      return groupMatches(selected.attack,'attack',index=>typeMatches(raw,index));
    });currentRows=filterNames(values,search.value,state.config);grid.setRows(currentRows);
  }
  function operator(group,rect){const widget=button('orop-'+group,rect,el=>{operators[group]=el.getAttribute('aria-pressed')==='true';apply();},{text:t('orop','OR'),toggle:true});filterWidgets.push(widget);}
  if(filterType===1){
    operator('trait',[50,450,200,50]);operator('abilities',[300,100,200,50]);operator('attack',[50,900,200,50]);
    if(isUnit){const custom=button('inccus',[50,100,200,50],el=>{includeCustom=el.getAttribute('aria-pressed')==='true';apply();},{toggle:true,selected:true});filterWidgets.push(custom);}else operator('rarity',[50,100,200,50]);
    for(const [name,rect,items] of [['rarity',[50,150,200,250],rarityItems],['trait',[50,500,200,350],traitItems],['abilities',[300,150,200,1100],[...abilityItems,...procItems]],['attack',[50,950,200,300],attackItems]])filterWidgets.push(multiList(api,rect,items,selected[name],apply,'filter-'+name));
  }else{
    let y=100;const groups=[['rarity',rarityItems,null],['trait',traitItems,'trait'],['abilities',abilityItems,'abilities'],['abilities',procItems,null],['attack',attackItems,'attack']];
    for(const [group,items,op] of groups){if(op)operator(op,[50,y,200,50]);let i=0;for(const item of items){if(item.name==='(null)')continue;const widget=button('filter-'+item.key,[300+(i%10)*175,y+Math.floor(i/10)*50,175,50],el=>{if(el.getAttribute('aria-pressed')==='true')selected[group].add(item.key);else selected[group].delete(item.key);apply();},{text:item.name,toggle:true,disabled:item.disabled,title:item.title});widget.classList.add('bcu-filter-button');const image=iconElement(api,item.icon);if(image){widget.replaceChildren(image,api.element('span',item.name));}filterWidgets.push(widget);i++;}y+=Math.max(1,Math.ceil(i/10))*50;}
  }
  apply();
}

function infoCell(api,parent,x,y,width,height,text,{center=false,title,description=false,inputValue,onChange,disabled=false,icon}={}){
  const el=api.element('div',undefined,'bcu-info-cell'+(center?' center':'')+(description?' description':'')+(icon?' proc':''));
  Object.assign(el.style,{left:(x/1600*100)+'%',top:`calc(var(--info-row)*${y/50})`,width:(width/1600*100)+'%',height:`calc(var(--info-row)*${height/50})`});
  if(title)el.title=title;
  if(inputValue!==undefined){const field=api.element('input');field.value=inputValue;field.disabled=disabled;field.addEventListener('change',()=>onChange?.(field.value));field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();field.blur();}});el.append(field);}else{const image=iconElement(api,icon);if(image)el.append(image);el.append(document.createTextNode(text??''));}
  parent.append(el);return el;
}

function procDisplays(api,item){
  const raw=item.maxStats??item,displays=[];
  if(raw.attackRanges?.length){const ranges=new Map();raw.attackRanges.forEach((range,index)=>{const short=range.shortPoint,long=range.longPoint;if(short===0&&long===0)return;const key=[short,long].join(',');if(!ranges.has(key))ranges.set(key,{range,indexes:[]});ranges.get(key).indexes.push(index+1);});for(const {range,indexes} of ranges.values()){const from=Math.min(range.shortPoint,range.longPoint),to=Math.max(range.shortPoint,range.longPoint),suffix=indexes.length===raw.attackRanges.length?'':' ['+indexes.join(', ')+']';displays.push({text:localized(api,'ld0','Touch range','util')+': '+raw.touchBase+', '+localized(api,'ld1','Range','util')+': '+from+'~'+to+', '+localized(api,'ld2','Width','util')+': '+(to-from)+suffix,icon:metadataIcon(api,'attack',range.omni?4:2)});}}
  for(let i=0;i<22;i++)if(((raw.ability??0)>>>i&1)===1){const name=abilityName(api,i,false);displays.push({text:name.startsWith('IMU')?localized(api,'imu','Immune to','util')+name.slice(3):name,icon:metadataIcon(api,'ability',i)});}
  const formatted=raw.procDisplay??item.procDisplay;if(Array.isArray(formatted))return [...displays,...formatted.map(value=>typeof value==='string'?{text:value}:{...value,text:api.state.config.seconds?(value.secondsText??value.text):value.text})];
  for(const [key,value] of Object.entries(raw.procs??{})){const meta=procMetadata(api,key),fields=Object.entries(value??{}).map(([name,number])=>name+'='+JSON.stringify(number)).join(', ');displays.push({text:procName(api,key)+': '+fields,icon:meta.icon,title:textDescription(meta.description??meta.tooltip??'')});}return displays;
}

function renderTreasure(api,isUnit,onChange){
  const values=treasureState(api),widgets=[],x=isUnit?1750:1700;let expanded=-1;
  const groupFormat=(value,index)=>index===0||index===5?'Lv.'+value:value+'%';
  const statField=index=>SUPPORTED_TREASURES.has(index)&&!!api.engine?.unitLevelMultiplier;
  function draw(){widgets.forEach(widget=>widget.remove());widgets.length=0;let row=0;
    const addValue=(index,indent=false)=>{const label=api.label(localized(api,'t'+TREASURE_ORDER[index],'Treasure '+index,'util'),[x,row*50+100,200,50],'treasure-label-'+index,'bcu-treasure-label');if(indent)label.style.color='blue';widgets.push(label);const formatted=index<8||index>=29?'Lv.'+(values[index]??0):(values[index]??0)+'%';const field=api.input(formatted,[x+200,row*50+100,200,50],async value=>{const digits=value.match(/\d+/)?.[0],parsed=digits===undefined?NaN:Number(digits);if(Number.isFinite(parsed)){values[index]=clamp(parsed,0,index<8?30:300);await saveSoon(api);onChange();}},{id:'treasure-'+index,type:'text'});field.disabled=!statField(index);if(field.disabled)field.title='Displayed from BCU; changing this treasure needs a browser battle adapter.';widgets.push(field);row++;};
    for(let index=0;index<51;){const group=TREASURE_GROUPS.findIndex(([start])=>start===index);if(group>=0){const [start,count]=TREASURE_GROUPS[group];const toggle=api.button('treasure-group-'+group,[x,row*50+100,200,50],()=>{expanded=expanded===group?-1:group;draw();},{text:api.t('tc'+group,'','util'),toggle:true,selected:expanded===group});widgets.push(toggle);const equal=values.slice(start,start+count).every(value=>value===values[start]);const field=api.input(equal?groupFormat(values[start]??0,group):'---',[x+200,row*50+100,200,50],null,{id:'treasure-group-value-'+group});field.disabled=true;field.title='Expand the category to inspect individual treasures.';widgets.push(field);row++;if(expanded===group)for(let i=start;i<start+count;i++)addValue(i,true);index+=count;}else{addValue(index);index++;}}
  }draw();return {redraw:draw};
}

export function renderInfo(kind,params={},rawApi){
  const api=adapter(rawApi);installStyles();const {catalog,state,button,label,element,place,navigate,backButton,t}=api,isUnit=kind==='unit';
  let item=params.item,unit=params.unit??item?.unit;if(isUnit&&!unit)unit=catalog.units.find(value=>String(value.id)===String(item?.unitId??item?.id));if(!item&&unit)item=unit.forms[0];
  backButton();if(!item){label('Select an entry from the data table.',[50,100,1600,100]);return;}
  const all=params.items??(isUnit?catalog.units:catalog.enemies),index=isUnit?all.findIndex(value=>String(value.unitId??value.unit?.id??value.id)===String(unit?.id)):all.findIndex(value=>String(value.id)===String(item.id));
  const neighbors=isUnit?[...new Map(all.map(value=>[value.unitId??value.unit?.id??value.id,value.unit??value])).values()]:all;const at=isUnit?neighbors.findIndex(value=>String(value.id)===String(unit.id)):index;
  let displaySpecial=!!params.extra,multi=params.multi??params.hpMultiplier??100,multiAtk=params.multiAtk??params.attackMultiplier??100;
  function visit(offset){const next=neighbors[at+offset];if(next)navigate(isUnit?'unitInfo':'enemyInfo',{unit:isUnit?next:undefined,item:isUnit?next.forms[Math.min(item.fid??0,next.forms.length-1)]:next,items:all,extra:displaySpecial},false);}
  button('prev',[300,0,200,50],()=>visit(-1),{disabled:at<=0});button('anim',[600,0,200,50],()=>navigate(isUnit?'unitAnimation':'enemyAnimation',{item,unit}));button('next',[900,0,200,50],()=>visit(1),{disabled:at<0||at>=neighbors.length-1});
  if(isUnit)button('combo',[1200,0,200,50],null,{disabled:true,title:'The original combo index has not been ported.'});
  else button('stage',[1200,0,200,50],()=>navigate('stages',{filter:stage=>(stage.lines??[]).some(line=>String(line.enemy??line.enemyId)===String(item.id))}));
  button('extra',[1500,0,200,50],el=>{displaySpecial=el.getAttribute('aria-pressed')==='true';draw();},{toggle:true,selected:displaySpecial});
  if(!isUnit)label('Source of enemy icon: DB',[0,50,600,50]);
  const scroll=place(element('div',undefined,'bcu-info-scroll'),[50,100,1650,1150],'info-scroll'),content=element('div',undefined,'bcu-info-content');scroll.append(content);
  const levels=new Map();if(isUnit)for(const form of unit.forms)levels.set(form.fid,{base:params.level??preferredLevel(api,unit),plus:params.plusLevel??preferredPlus(api,unit)});
  renderTreasure(api,isUnit,draw);
  const frame=value=>state.config.seconds?(Number(value??0)/30).toFixed(2)+'s':String(value??0)+'f';
  const infoText=(key,fallback)=>t(key,fallback??key,'info');
  function draw(){
    content.replaceChildren();const forms=isUnit?unit.forms:[item];let totalHeight=0;
    for(const form of forms){
      const raw=form.maxStats??form,lvs=levels.get(form.fid),level=isUnit?lvs.base+lvs.plus:0,stats=calculatedStats(api,form,unit,level,{info:true});
      const block=element('div',undefined,'bcu-info-form');content.append(block);const cell=(x,y,w,h,text,options={})=>infoCell(api,block,x,y,w,h,text,options);
      const traitText=(raw.traits??[]).map(index=>traitName(api,index)).join(', ')+(form.star?' ★'+form.star:'');
      cell(0,0,200,50,'ID',{center:true});cell(200,0,200,50,(form.pack??'000000')+'/'+(isUnit?unit.id+'-'+form.fid:form.id));const imageCell=cell(400,0,200,50,'');const icon=iconElement(api,form.editorIcon??form.icon,form.name);if(icon)imageCell.replaceChildren(icon);cell(600,0,200,50,infoText('trait','Trait'),{center:true});cell(800,0,800,50,traitText);
      if(isUnit){
        cell(0,50,100,50,t('r'+unit.rarity,'','util'),{center:true});
        cell(100,50,300,50,'',{inputValue:lvs.base+(lvs.plus?' + '+lvs.plus:''),disabled:!api.engine?.unitLevelMultiplier,title:'Level and plus level',onChange:value=>{const numbers=value.match(/\d+/g)?.map(Number);if(numbers?.length){lvs.base=clamp(numbers[0],1,unit.max??130);lvs.plus=clamp(numbers[1]??0,0,unit.maxPlus??0);draw();}}});
        cell(400,50,200,50,infoText('hphb','HP / KB'),{center:true});cell(600,50,200,50,stats.hp+' / '+raw.kb);
        cell(800,50,200,50,infoText('cdo','CD'),{center:true});cell(1000,50,200,50,frame(stats.respawn));cell(1200,50,200,50,infoText('price','Cost'),{center:true});cell(1400,50,200,50,stats.price);
        cell(0,100,200,50,infoText('range','Range'),{center:true});cell(200,100,200,50,raw.range);cell(400,100,200,50,'dps',{center:true});cell(600,100,200,50,stats.dps);cell(800,100,200,50,infoText('speed','Speed'),{center:true});cell(1000,100,200,50,raw.speed);cell(1200,100,200,50,infoText('atkf','Attack frequency'),{center:true});cell(1400,100,200,50,frame(raw.attackInterval));
        cell(0,150,200,50,infoText('isr','Area attack'),{center:true});cell(200,150,200,50,String(!!raw.area));cell(400,150,200,50,infoText('will','Will'),{center:true});cell(600,150,200,50,stats.will??'—');cell(800,150,200,50,infoText('TBA','TBA'),{center:true});cell(1000,150,200,50,frame(raw.tba));cell(1200,150,200,50,infoText('postaa','Backswing'),{center:true});cell(1400,150,200,50,frame(raw.post));
      }else{
        cell(0,50,200,50,infoText('mult','Magnification'),{center:true});cell(200,50,200,50,'',{inputValue:(multi===multiAtk?multi:multi+', '+multiAtk)+'%',onChange:value=>{const numbers=value.match(/-?\d+/g)?.map(Number);if(numbers?.length){multi=Math.max(0,numbers[0]);multiAtk=Math.max(0,numbers[1]??numbers[0]);draw();}}});
        cell(400,50,200,50,infoText('HP','HP'),{center:true});cell(600,50,200,50,Math.trunc(raw.hp*multi/100));cell(800,50,200,50,infoText('hb','KB'),{center:true});cell(1000,50,200,50,raw.kb);cell(1200,50,200,50,infoText('drop','Money'),{center:true});cell(1400,50,200,50,enemyDrop(api,form));
        cell(0,100,200,50,infoText('range','Range'),{center:true});cell(200,100,200,50,raw.range);cell(400,100,200,50,'dps',{center:true});cell(600,100,200,50,Math.trunc(raw.attack*multiAtk/100*30/(raw.attackInterval||1)));cell(800,100,200,50,infoText('speed','Speed'),{center:true});cell(1000,100,200,50,raw.speed);cell(1200,100,200,50,infoText('atkf','Attack frequency'),{center:true});cell(1400,100,200,50,frame(raw.attackInterval));
        cell(0,150,200,50,infoText('atktype','Attack Type'),{center:true});cell(200,150,200,50,raw.area?infoText('isr','Area attack'):infoText('single','Single attack'));cell(400,150,200,50,infoText('postaa','Backswing'),{center:true});cell(600,150,200,50,frame(raw.post));cell(800,150,200,50,infoText('TBA','TBA'),{center:true});cell(1000,150,200,50,frame(raw.tba));cell(1200,150,200,50,'');cell(1400,150,200,50,'');
      }
      let y=200;
      if(displaySpecial){const extra=[infoText('count','Attack count'),raw.attackLoop??'—',infoText('width','Width'),raw.width??'—',infoText('minpos','Min position'),raw.limit??'—',isUnit?infoText('t7','Attack range'):'',isUnit?(raw.back===raw.front?raw.back??'—':(raw.back??'—')+' ~ '+(raw.front??'—')):''];extra.forEach((text,i)=>cell(i*200,y,200,50,text,{center:i%2===0}));y+=50;}
      const atks=raw.rawAttacks??[];
      if(isUnit){const multiplier=stats.levelMultiplier,atkTreasure=Number(treasureState(api)[8]??300),attackValues=atks.map(attack=>multiplier===null?'—':Math.trunc(Math.round(attack[0]*multiplier)*Math.fround(1+Math.fround(atkTreasure*Math.fround(.005)))));cell(0,y,200,50,infoText('atk','Attack'),{center:true});cell(200,y,400,50,attackValues.join(' / '));cell(600,y,200,50,infoText('preaa','Foreswing'),{center:true});cell(800,y,400,50,atks.map(attack=>frame(attack[1])).join(' / '));cell(1200,y,200,50,infoText('dire','Direction'),{center:true});cell(1400,y,200,50,atks.map(attack=>attack[3]).join(' / '));y+=50;}
      else for(const attack of atks){cell(0,y,200,50,infoText('atk','Attack'),{center:true});cell(200,y,200,50,Math.round(attack[0]*multiAtk/100));cell(400,y,200,50,infoText('preaa','Foreswing'),{center:true});cell(600,y,200,50,frame(attack[1]));for(let i=4;i<8;i++)cell(i*200,y,200,50,'');y+=50;}
      const procs=procDisplays(api,form);procs.forEach((proc,i)=>{const width=i%2===0&&i===procs.length-1?1600:800;cell(i%2*800,y+Math.floor(i/2)*50,width,50,proc.text??proc.name??'',{title:proc.title,icon:proc.icon});});y+=Math.ceil(procs.length/2)*50;
      if(form.description){cell(0,y,1600,200,(form.name??'')+'\n'+textDescription(form.description),{description:true});y+=200;}
      block.style.height=`calc(var(--info-row)*${y/50})`;totalHeight+=y+50;
    }
    content.style.minHeight=`calc(var(--info-row)*${totalHeight/50})`;
  }
  draw();api.addCleanup?.(()=>saveSoon(api));
}

// Shared by the original ComparePage browser adapter; these still call the
// TeaVM growth/stat boundary and the same catalog used by the information UI.
export function displayStats(rawApi,item,unit,level,options={}){return calculatedStats(adapter(rawApi),item,unit,level,options);}
export function abilityDescriptions(rawApi,item){return procDisplays(adapter(rawApi),item);}
export function displayDrop(rawApi,item){return enemyDrop(adapter(rawApi),item);}
export function defaultUnitLevels(rawApi,unit){const api=adapter(rawApi);return{level:preferredLevel(api,unit),plusLevel:preferredPlus(api,unit)};}
