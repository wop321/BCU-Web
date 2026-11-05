import {BattleAudio,unlockBattleAudio} from './audio.mjs';
import {ensureState as ensureLineupState} from './lineup.mjs';
let bootstrap,active=null;
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const enemyById=(api,id)=>api.catalog.enemies.find(enemy=>String(enemy.id)===String(id));
const stageIds=stage=>{const values=String(stage.id).split('-');return[stage.runtimeCollection??values[0],stage.mapIndex??Number(values[1]),stage.stageIndex??stage.sid??Number(values[2])];};
const runtimeStageKey=stage=>stageIds(stage).map((id,index)=>index===0?String(id).padStart(6,'0'):id);
const lineupCsv=(api,lineup=api.state.lineups[api.state.lineup])=>lineup.slots.map(slot=>{
  if(!slot)return '-';
  const values=[slot.unitId,slot.fid??0,slot.level??api.state.config.prefLevel,slot.plusLevel??slot.plus??0];
  if(slot.talents||slot.orbs)values.push(slot.talents?.join(';')??'');
  if(slot.orbs?.length)values.push(slot.orbs.map(orb=>orb.join(';')).join('/'));
  return values.join(':');
}).join(',');

export async function initializeBattleEngine(api,onProgress=()=>{}){
  if(bootstrap)return bootstrap;
  bootstrap=(async()=>{
    if(!api.engine?.registerAsset||!api.engine?.initializeEngine)throw new Error('The complete TeaVM battle engine has not been built. Run the build command and reload.');
    onProgress('Reading battle assets…');
    let response=await fetch('data/engine-assets.json');
    if(response.status===404){
      response=await fetch('data/engine-assets.json.gz');
      if(response.ok&&response.body){
        response=new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
      }
    }
    if(!response.ok)throw new Error('The engine asset manifest is missing. Run the asset exporter.');
    const manifest=await response.json();
    const rasterized=manifest.entries.filter(asset=>asset.width>0&&(asset.path.startsWith('./org/page/')||asset.path.endsWith('/poisbub/poisbub.png')));
    const cache=globalThis.__bcuImages??=new Map();
    onProgress('Reading battle interface images…');
    for(let start=0;start<rasterized.length;start+=20)await Promise.all(rasterized.slice(start,start+20).map(async asset=>{const image=new Image();image.src=api.assetPath(asset.url);await image.decode();cache.set(asset.url,image);}));
    await document.fonts.load('42px BcuStage');
    let index=0;
    for(const entry of manifest.entries){api.engine.registerAsset(entry.path,entry.url,entry.text??null,entry.width??0,entry.height??0,entry.size??0);if(++index%2500===0){onProgress('Reading battle assets… '+index+' / '+manifest.entries.length);await new Promise(resolve=>setTimeout(resolve,0));}}
    onProgress('Reading BC data…');await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    const counts=parse(api.engine.initializeEngine());
    return counts;
  })();
  try{return await bootstrap;}catch(error){bootstrap=null;throw error;}
}

function lineupBox(api,bounds){
  const box=api.place(api.element('div'),bounds);const {state,catalog}=api;box.style.display='grid';box.style.gridTemplateColumns='repeat(5,1fr)';box.style.gridTemplateRows='repeat(2,1fr)';
  function redraw(){box.replaceChildren();const lineup=state.lineups[state.lineup];for(let i=0;i<10;i++){const slot=lineup.slots[i],button=api.element('button');button.style.minWidth='0';button.style.padding='0';button.title='Edit lineup';if(slot){const unit=catalog.units.find(unit=>String(unit.id)===String(slot.unitId)),form=unit?.forms[slot.fid??0];if(form?.icon){const image=api.element('img');image.src=api.assetPath(form.icon);image.alt=form.name;image.style.maxWidth='100%';image.style.maxHeight='65%';button.append(image);}const plus=slot.plusLevel??slot.plus??0;const text=api.element('div','Lv.'+slot.level+(plus?'+'+plus:''));text.style.fontSize='.85em';button.append(text);}button.onclick=()=>api.navigate('lineup');box.append(button);}}
  redraw();return redraw;
}

export function renderSetup(params,api){
  const {stage}=params;if(!stage)throw new Error('Select a stage first.');
  const map=params.map??api.catalog.collections.flatMap(collection=>collection.maps).find(map=>map.stages.some(candidate=>candidate.id===stage.id));
  let star=params.star??0,rich=false,sniper=false,cancelled=false;api.addCleanup(()=>cancelled=true);api.backButton();
  const stageKey=runtimeStageKey(stage);
  api.list([50,100,200,200],map?.stars??[100],(_,index)=>{star=index;if(ready)refreshRestrictions();},{selected:star,render:(value,index)=>`${index+1}${api.t('star','star','info')}: ${value}%`});
  api.label(api.state.lineups[api.state.lineup]?.name??'Default',[50,350,200,50]);
  api.button('line',[50,400,200,50],()=>api.navigate('lineup'));
  const richButton=api.button('rich',[300,100,200,50],button=>rich=button.getAttribute('aria-pressed')==='true',{toggle:true,disabled:true});
  const sniperButton=api.button('sniper',[300,200,200,50],button=>sniper=button.getAttribute('aria-pressed')==='true',{toggle:true,disabled:true});
  let preset;
  const usePreset=api.button('usepreset',[300,400,200,50],async()=>{
    const confirmed=await api.message(api.t('usepreset'),
      'This will replace your current lineup and adjust treasure and cannon values for its set. Continue?',{cancel:true});
    if(!confirmed||cancelled)return;
    const set=ensureLineupState(api),lineup=set.lineups[set.selected];
    lineup.slots=structuredClone(preset.slots);
    for(const slot of lineup.slots){
      if(!slot)continue;
      const {unitId,fid,...level}=slot;
      lineup.levels[String(unitId)]=level;
    }
    lineup.nyc=preset.nyc.map((part,index)=>part===-1?lineup.nyc[index]:part);
    set.treasures=api.state.treasures=[...preset.treasures];
    set.treasurePreset=stageKey;
    redrawLineup();
    refreshRestrictions();
    await api.save();
  },{disabled:true});
  const maximize=api.button('tomax',[300,500,200,50],async()=>{
    const lineup=api.state.lineups[api.state.lineup];
    lineup.levels??={};
    restrictions.maximumLevels.forEach((level,index)=>{
      if(!level)return;
      const slot=lineup.slots[index],values={level:level[0],plusLevel:level[1]};
      Object.assign(slot,values);
      lineup.levels[String(slot.unitId)]={...lineup.levels[String(slot.unitId)],...values};
    });
    redrawLineup();
    refreshRestrictions();
    await api.save();
  },{disabled:true});
  const redrawLineup=lineupBox(api,[550,50,600,300]);
  const status=api.label('',[1500,100,700,400],undefined,'status');
  let ready=false,starting=false,restrictions;
  function refreshRestrictions(){
    restrictions=parse(api.engine.stageRestrictions(...stageKey,star,lineupCsv(api)));
    richButton.disabled=!restrictions.richAllowed;
    sniperButton.disabled=!restrictions.sniperAllowed;
    maximize.disabled=!restrictions.maximumLevels;
    const lineup=api.state.lineups[api.state.lineup],set=api.state.basisSets?.[api.state.basisSet];
    usePreset.disabled=!preset||(
      set?.treasurePreset?.join()===stageKey.join()&&
      set.treasures.join()===preset.treasures.join()&&
      preset.nyc.every((part,index)=>part===-1||part===lineup.nyc?.[index])&&
      lineupCsv(api,lineup)===lineupCsv(api,preset)
    );
    start.disabled=starting||!restrictions.valid;
    status.textContent=restrictions.valid?'':'The lineup exceeds this stage’s level limits.';
  }
  api.table([50,600,1400,650],[{label:'Enemy',value:line=>enemyById(api,line.enemy)?.name??line.enemy},{label:'Number',value:line=>line.number||'∞'},{label:'HP %',value:line=>line.multiple},{label:'ATK %',value:line=>line.mult_atk},{label:'First frame',value:line=>line.spawn_0},{label:'Respawn',value:line=>line.respawn_0},{label:'Base %',value:line=>line.castle_0},{label:'Boss',value:line=>line.boss}],stage.lines??[]);
  const start=api.button('start',[50,500,200,50],async()=>{
    starting=true;start.disabled=true;
    try{
      await unlockBattleAudio().catch(error=>console.error('BCU audio could not unlock:',error));
      if(cancelled||!restrictions.valid)return;
      const seed=crypto.getRandomValues(new Uint32Array(1))[0]|0;
      const useRich=rich&&restrictions.richAllowed,useSniper=sniper&&restrictions.sniperAllowed;
      api.engine.setBattleOptions?.((useRich?1:0)|(useSniper?2:0),true,api.state.config.twoRow);
      api.engine.setStageName?.(...stageKey,stage.name);
      const lineup=api.state.lineups[api.state.lineup],set=api.state.basisSets?.[api.state.basisSet];
      const treasures=set?.treasures??api.state.treasures??api.catalog.treasureValues;
      const info=parse(api.engine.startConfiguredBattle(...stageKey,star,lineupCsv(api,lineup),seed,
        treasures.join(),(lineup.nyc??[0,0,0]).join(),...(set?.treasurePreset??['',0,0])));
      active={stage,map,star,seed,lineup:structuredClone(api.state.lineups[api.state.lineup]),rich:useRich,sniper:useSniper,info};
      await api.navigate('battle');
    }catch(error){status.textContent=error.message;throw error;}finally{starting=false;start.disabled=!restrictions.valid;}
  },{disabled:true});
  initializeBattleEngine(api,text=>{if(!cancelled)status.textContent=text;}).then(()=>{
    if(cancelled)return;
    preset=parse(api.engine.stagePreset(...stageKey));
    refreshRestrictions();
    ready=true;
  }).catch(error=>{if(!cancelled)status.textContent=error.message;});
}

export function hasCurrentBattle(){return !!active;}

function downloadReplay(api,replay){
  const bytes=Uint8Array.from(atob(replay.data),char=>char.charCodeAt(0));
  api.download(new Blob([bytes],{type:'application/octet-stream'}),replay.name+'.replay');
}

export function renderReplays(params,api){
  api.backButton();
  const replays=api.state.replays??=[];
  const status=api.label('',[600,700,850,100],undefined,'status');
  let disposed=false,loading=false;
  api.addCleanup(()=>disposed=true);
  const stageFilter=params.stage?runtimeStageKey(params.stage).join('/'):null;
  const visible=()=>replays.filter(replay=>!stageFilter||replay.stageKey===stageFilter);
  const list=api.list([50,100,500,1100],visible(),updateButtons,{render:replay=>replay.name});
  const open=api.button('open',[600,100,300,50],()=>play(list.getSelected()),{text:'Play',disabled:true});
  const exportButton=api.button('export',[950,200,300,50],()=>downloadReplay(api,list.getSelected()),{disabled:true});
  const remove=api.button('rem',[stageFilter?950:600,400,300,50],async()=>{
    const selected=list.getSelected();
    if(!await api.message('Remove replay',`Remove "${selected.name}"?`,{cancel:true})||disposed)return;
    replays.splice(replays.indexOf(selected),1);
    list.setItems(visible());
    updateButtons();
    await api.save();
  },{disabled:true});
  const importButton=api.button('import',[600,200,300,50],async()=>{
    unlockBattleAudio().catch(error=>console.error('BCU audio could not unlock:',error));
    const file=await api.pickFile('.replay');
    if(!file||disposed)return;
    await play({id:crypto.randomUUID(),name:file.name.replace(/\.replay$/i,''),data:await encodeFile(file)},true);
  });

  function updateButtons(){
    open.disabled=exportButton.disabled=remove.disabled=loading||!list.getSelected();
    importButton.disabled=loading;
  }
  async function play(replay,save=false){
    if(disposed||loading)return;
    loading=true;updateButtons();
    try{
      await unlockBattleAudio().catch(error=>console.error('BCU audio could not unlock:',error));
      await initializeBattleEngine(api,text=>status.textContent=text);
      if(disposed)return;
      api.engine.setBattleRows(api.state.config.twoRow);
      api.engine.setBattleSpeed(0);
      const info=parse(api.engine.startReplay(replay.data));
      const stage=api.catalog.collections.flatMap(collection=>collection.maps)
        .flatMap(map=>map.stages).find(stage=>runtimeStageKey(stage).join('/')===info.replayStage);
      active={stage:stage??{},info,replay:true};
      if(save){
        replay.stageKey=info.replayStage;
        replays.push(replay);
        await api.save();
      }
      if(!disposed)await api.navigate('battle');
    }finally{
      loading=false;
      if(!disposed)updateButtons();
    }
  }
}

async function encodeFile(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
  return btoa(binary);
}

export async function renderBattle(params,api){
  if(!active)throw new Error('There is no current battle.');
  const current=active,{element,place,button,label,table}=api;const engine=api.engine;let large=api.state.config.battleLarge??true,paused=false,speed=0,frameCounter=0,dead=false;
  let info=parse(engine.battleState()),lastInfoRefresh=0,mouseButton=1,ended=false;
  const sound=new BattleAudio(api);
  sound.playMusic(info.enemyHealth/info.enemyMaxHealth*100<active.stage.mush&&active.stage.music1>=0?active.stage.music1:active.stage.music).catch(error=>sound.report(error));
  api.addCleanup(()=>sound.stop());
  api.backButton();const largeButton=button('larges',[2100,0,200,50],el=>{large=el.getAttribute('aria-pressed')==='true';api.state.config.battleLarge=large;position();},{toggle:true,selected:large});
  const pause=button('pause',[700,0,200,50],()=>{paused=!paused;pause.setAttribute('aria-pressed',String(paused));next.disabled=!paused;});
  const replay=button('rply',[900,0,200,50],async()=>{
    const wasPaused=paused;
    paused=true;
    let name;
    try{name=(await api.message('Save replay','Replay name',{input:current.stage.name??'Replay',cancel:true}))?.trim();}
    finally{paused=wasPaused;}
    if(!name||dead)return;
    const entry={id:crypto.randomUUID(),name,stageKey:runtimeStageKey(current.stage).join('/'),data:engine.exportReplay(name)};
    (api.state.replays??=[]).push(entry);
    await api.save();
  },{disabled:current.replay});
  const next=button('nextf',[1100,0,200,50],()=>{step(1);draw();},{disabled:true});
  const row=button('row',[1300,0,200,50],()=>{api.state.config.twoRow=!api.state.config.twoRow;engine.setBattleRows(api.state.config.twoRow);row.textContent=api.t(api.state.config.twoRow?'tworow':'onerow');},{text:api.t(api.state.config.twoRow?'tworow':'onerow')});
  const enemyBase=label('',[240,0,600,50]),catBase=label('',[1740,0,200,50]),timer=label('',[1500,0,200,50]);
  const preview=place(element('div',undefined,'preview'),[190,50,1920,1200]);const canvas=element('canvas');canvas.id='battle-canvas';preview.append(canvas);
  const enemyCount=label('',[50,50,450,50]),unitCount=label('',[1650,50,450,50]);
  const entityColumns=[{label:'Position',value:x=>Math.round(x.position)},{label:'HP',value:x=>x.health},{label:'Max HP',value:x=>x.maxHealth},{label:'Layer',value:x=>x.layer}];
  const enemies=table([50,100,600,700],entityColumns,[]),units=table([1650,100,600,700],entityColumns,[]);
  const coming=table([50,850,1450,400],[{label:'Enemy',value:line=>enemyById(api,line.enemy)?.name??line.enemy},{label:'Number',value:line=>line.number||'∞'},{label:'First frame',value:line=>line.spawn_0},{label:'Respawn',value:line=>line.respawn_0}],active.stage.lines??[]);
  const damage=table([1650,850,600,400],[{label:'Unit',value:x=>x.name},{label:'Damage',value:x=>x.damage}],[]);
  function position(){
    const b=(el,small,big)=>api.setBounds(el,large?big:small);
    b(preview,[700,300,800,500],[190,50,1920,1200]);b(pause,[700,200,200,50],[700,0,200,50]);b(replay,[900,200,200,50],[900,0,200,50]);b(next,[1100,200,200,50],[1100,0,200,50]);b(row,[1300,200,200,50],[1300,0,200,50]);b(enemyBase,[700,250,400,50],[240,0,600,50]);b(catBase,[1300,250,200,50],[1740,0,200,50]);b(timer,[1100,250,200,50],[1500,0,200,50]);
    for(const el of [enemies,units,coming,damage,enemyCount,unitCount])el.hidden=large;
  }
  function draw(){
    if(!ended&&info.result!=='running'){ended=true;sound.finish(info.result==='victory'?8:9).catch(error=>sound.report(error));}
    const width=preview.clientWidth,height=preview.clientHeight;if(width<1||height<1)return;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    canvas.getContext('2d').clearRect(0,0,width,height);engine.renderBattle(canvas.id,width,height,0,1);
    enemyBase.textContent=info.enemyHealth+' / '+info.enemyMaxHealth;catBase.textContent=info.catHealth+' / '+info.catMaxHealth;timer.textContent=api.state.config.seconds?(info.frame/30).toFixed(2)+'s':info.frame+'f';
    if(performance.now()-lastInfoRefresh>300){lastInfoRefresh=performance.now();const enemy=info.entities.filter(x=>x.direction===1),unit=info.entities.filter(x=>x.direction!==1);enemyCount.textContent='Enemies: '+enemy.length;unitCount.textContent='Units: '+unit.length;if(!large){enemies.setRows(enemy);units.setRows(unit);}}
  }
  function step(frames){
    if(current.replay)frames=Math.min(frames,info.replayLength-info.frame);
    if(frames>0)info=parse(engine.stepBattle(frames));
  }
  const keydown=event=>{
    if(document.getElementById('dialog').open||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
    const key=event.key.toLowerCase();const index='qwertasdfg'.indexOf(key);
    if(!current.replay&&index>=0){event.preventDefault();engine.deployUnit(index);}
    else if(!current.replay&&key==='1')engine.workerUpgrade();
    else if(!current.replay&&key==='2')engine.fireCannon();
    else if(key===','){speed=Math.max(-5,speed-1);engine.setBattleSpeed?.(speed);}
    else if(key==='.'){speed=Math.min(5,speed+1);engine.setBattleSpeed?.(speed);}
    else if(key===' '){event.preventDefault();pause.click();}
  };
  document.addEventListener('keydown',keydown);
  const coords=event=>{const rect=canvas.getBoundingClientRect();return[(event.clientX-rect.left)*canvas.width/rect.width,(event.clientY-rect.top)*canvas.height/rect.height];};
  let pointerStart=null,dragged=false;
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('pointerdown',event=>{mouseButton=event.button===2?3:1;const [x,y]=coords(event);pointerStart=[x,y];dragged=false;canvas.setPointerCapture(event.pointerId);engine.battlePress?.(x,y);});
  canvas.addEventListener('pointermove',event=>{if(pointerStart){dragged=true;const [x,y]=coords(event);engine.battleDrag?.(x,y,mouseButton);}});
  canvas.addEventListener('pointerup',event=>{const [x,y]=coords(event);if(pointerStart&&!dragged)engine.battleClick?.(x,y,mouseButton);engine.battleRelease?.();pointerStart=null;});
  canvas.addEventListener('pointercancel',()=>{engine.battleRelease?.();pointerStart=null;});
  canvas.addEventListener('wheel',event=>{event.preventDefault();const [x,y]=coords(event);engine.battleWheel?.(x,y,Math.sign(event.deltaY));},{passive:false});
  const interval=setInterval(()=>{if(dead)return;try{frameCounter++;if(!paused&&(speed>=0||frameCounter%(1-speed)===0))step(speed>0?1+2**speed:1);draw();}catch(error){dead=true;clearInterval(interval);api.message('Battle error',String(error.message??error));}},1000/30);
  api.addCleanup(()=>{dead=true;clearInterval(interval);document.removeEventListener('keydown',keydown);current.info=info;});
  position();draw();
}
