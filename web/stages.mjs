const pad=value=>String(value).padStart(3,'0');
const range=(a,b)=>a===b?String(a):`${a}~${b}`;

export function spawnColumns(api){return Array.from({length:11},(_,index)=>({label:api.t('t'+index,index===10?'Score':'','info'),value:row=>row[index]}));}
export function spawnRows(api,stage,stars=100){
  return(stage.lines??[]).map(line=>{
    const enemy=api.catalog.enemies.find(enemy=>String(enemy.id)===String(line.enemy));
    const hp=Math.trunc(line.multiple*stars/100),atk=Math.trunc(line.mult_atk*stars/100);
    const multi=line.multiple===0&&line.mult_atk===0?stars:line.multiple===line.mult_atk?hp:`{${hp}, ${atk}}`;
    const row=[line.boss===1?'Boss':line.boss===2?'Boss (Shake)':'',enemy?.name??String(line.enemy),multi+'%',line.number===0?'Infinite':line.number,line.castle_0>=line.castle_1?line.castle_0+'%':range(line.castle_0,line.castle_1)+'%',Math.abs(line.spawn_0)>=Math.abs(line.spawn_1)?line.spawn_0:range(line.spawn_0,line.spawn_1),range(line.respawn_0,line.respawn_1),range(line.layer_0,line.layer_1),line.kill_count,line.group?pad(line.group)+' - invalid':'',stage.trail?line.score:'--'];
    row.enemy=enemy;row.hp=hp;row.atk=atk;return row;
  }).reverse();
}
export function headRows(api,stage,map,star){
  const t=(key,fallback)=>api.t(key,fallback,'info'),collection=String(stage.id).split('-')[0];let health=stage.health;
  if(collection==='003')health*=star+1;
  else{const last=stage.lines?.at(-1),enemy=api.catalog.enemies.find(enemy=>String(enemy.id)===String(last?.enemy));if(last?.castle_0===0&&enemy)health=Math.trunc(Math.trunc(enemy.hp*last.multiple/100)*(map?.stars?.[star]??100)/100);}
  const a=['ID:',`${String(Number(collection)).padStart(6,'0')}/${map?.sid??0}-${stage.sid??0}`,'','','','',t('chcos','Ch. cost'),(map?.price??1)+1];for(let i=0;i<Math.min(4,map?.stars?.length??0);i++)a[i+2]=`${i+1}${t('star','Star')}: ${map.stars[i]}%`;
  const b=[stage.timeLimit?t('time','Time'):t('ht00','Base health'),stage.timeLimit?stage.timeLimit+' min':health,`${t('ht01','Length')}: ${stage.len}`,`${t('ht02','Enemy Limit')}: ${stage.max}`,t('mus','Music')+':',stage.music>=0?'000000/'+stage.music:'',`<${stage.mush}%:`,stage.music1>=0?'000000/'+stage.music1:''];
  const c=[t('minspawn','Min respawn'),range(stage.minSpawn,stage.maxSpawn)+'f',t('ht03','Continuable'),String(!stage.non_con),t('bossguard','Boss Guard'),String(stage.bossGuard),'',''];
  const d=[t('ht04','Background'),stage.background>=0?'000000/'+stage.background:'',`<${stage.bgh}%`,stage.background1>=0?'000000/'+stage.background1:'',t('ht05','Castle'),stage.castle>=0?'000000/'+stage.castle:'','',''];
  return[a,b,c,d,Array(8).fill(''),Array(8).fill('')];
}

export function renderStages(params,api){
  const {button,input,list,table,navigate,t}=api;api.backButton();let collection=null,map=null,selected=null,star=0;
  const collections=api.catalog.collections,allMaps=collections.flatMap(collection=>collection.maps),allStages=allMaps.flatMap(map=>map.stages);
  const head=table([800,50,1400,300],Array(8).fill(''),[],{onSelect:(_,row,col)=>{
    if(!selected)return;
    if(row===0&&col>=2&&col<2+(map?.stars.length??0)){star=col-2;setStage(selected);}
    else if(row===1&&(col===5||col===7))navigate('music',{selectedId:col===5?selected.music:selected.music1});
    else if(row===3&&(col===1||col===3))navigate('backgrounds',{selectedId:col===1?selected.background:selected.background1});
    else if(row===3&&col===5)navigate('castles',{selectedId:selected.castle});
  }});head.querySelector('thead').hidden=true;
  const spawn=table([800,400,1400,800],spawnColumns(api),[],{onOpen:row=>row.enemy&&navigate('enemyInfo',{item:row.enemy,hpMultiplier:row.hp,attackMultiplier:row.atk})});
  const start=button('start',[400,0,200,50],()=>selected&&navigate('battleSetup',{stage:selected,map,star}),{disabled:true});
  const preset=button('preset',[1100,350,200,50],()=>selected&&api.message('preset lineup',JSON.stringify(selected.preset,null,2)),{disabled:true});
  const info=button('info',[1350,350,200,50],()=>selected&&api.message('stage info',stageInfo(api,selected)),{disabled:true});
  const material=button('matinfo',[1600,350,200,50],()=>selected&&api.message('map data',JSON.stringify(selected.info??{},null,2)),{disabled:true});
  const replay=button('replay',[1850,350,200,50],()=>navigate('replay',{stage:selected}),{disabled:true});
  const copyMap=button('cpsm',[0,1200,200,50],()=>{if(map)api.state.clipboardMap=structuredClone(map);},{disabled:true});
  const showCollection=button('showmc',[200,1200,200,50],()=>{if(collection)collectionList.select(collections.indexOf(collection));},{disabled:true});
  const copyStage=button('cpst',[400,1200,200,50],()=>{if(selected)api.state.clipboardStage=structuredClone(selected);},{disabled:true});
  const showMap=button('showsm',[600,1200,200,50],()=>{if(map){collectionList.select(collections.indexOf(collection));mapList.select(collection.maps.indexOf(map));}},{disabled:true});
  const stageList=list([400,600,400,600],[],stage=>setStage(stage));
  const mapList=list([0,100,400,1100],[],value=>{map=value;copyMap.disabled=showCollection.disabled=false;filterStages();});
  const collectionList=list([400,50,400,500],collections,value=>{collection=value;filterMaps();},{render:item=>item.name??item.id});
  const searchMaps=input('',[0,50,400,50],()=>filterMaps(),{placeholder:'Search stage map'});
  const searchStages=input('',[400,550,400,50],()=>filterStages(),{placeholder:'Search stage'});
  function filterMaps(){const values=(collection?.maps??[]).filter(value=>String(value.name).toLowerCase().includes(searchMaps.value.toLowerCase()));mapList.setItems(values);if(values.length)mapList.select(0);else{stageList.setItems([]);clearStage();}}
  function filterStages(){const values=(map?.stages??[]).filter(value=>(!params.filter||params.filter(value))&&String(value.name).toLowerCase().includes(searchStages.value.toLowerCase()));stageList.setItems(values);if(values.length)stageList.select(0);else clearStage();}
  function clearStage(){selected=null;head.setRows([]);spawn.setRows([]);start.disabled=info.disabled=material.disabled=preset.disabled=replay.disabled=copyStage.disabled=showMap.disabled=true;}
  function setStage(stage){selected=stage;map=allMaps.find(map=>map.stages.some(value=>value.id===stage.id));collection=collections.find(collection=>collection.maps.includes(map));star=Math.min(star,(map?.stars.length??1)-1);head.setRows(headRows(api,stage,map,star));spawn.setRows(spawnRows(api,stage,map?.stars?.[star]??100));start.disabled=info.disabled=replay.disabled=copyStage.disabled=showMap.disabled=false;preset.disabled=!stage.preset;material.disabled=stage.info?.maxMaterial===undefined||stage.info.maxMaterial===-1;}
  button('asrch',[200,0,200,50],async()=>{const query=await api.message('Search','Search stage',{input:'',cancel:true});if(query===null)return;const values=allStages.filter(stage=>String(stage.name).toLowerCase().includes(query.toLowerCase()));stageList.setItems(values);if(values.length){map=allMaps.find(map=>map.stages.some(stage=>stage.id===values[0].id));collection=collections.find(collection=>collection.maps.includes(map));stageList.select(0);}else clearStage();});
  button('dungeon',[600,0,200,50],()=>api.pending('Original Quest generation'));
  if(params.selectedId){const stage=allStages.find(stage=>stage.id===params.selectedId);if(stage){map=allMaps.find(map=>map.stages.includes(stage));collection=collections.find(collection=>collection.maps.includes(map));collectionList.select(collections.indexOf(collection));setStage(stage);}}
  else if(params.filter){const values=allStages.filter(params.filter);stageList.setItems(values);if(values.length){map=allMaps.find(map=>map.stages.includes(values[0]));collection=collections.find(collection=>collection.maps.includes(map));stageList.select(0);}}
}
function stageInfo(api,stage){const data=stage.info??{};return[stage.name,'Energy: '+(data.energy??''),'XP: '+(data.xp??''),'Difficulty: '+(data.diff??''),'Drops:',JSON.stringify(data.drop??[],null,2),'Timed rewards:',JSON.stringify(data.time??[],null,2)].join('\n');}
