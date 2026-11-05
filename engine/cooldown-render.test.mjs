import assert from 'node:assert/strict';
import { readFile,readdir,writeFile } from 'node:fs/promises';

// Headless graphics boundary: simulation sees real PNG dimensions; bitmap drawing is verified in the browser.
globalThis.Image = class { constructor(width,height){this.width=this.naturalWidth=width;this.height=this.naturalHeight=height;this.complete=true;} };
const rectangles=[];
function canvas(){
  const c={width:1,height:1};
  c.getContext=()=>({drawImage(){},fillRect(x,y,w,h){rectangles.push({color:this.fillStyle,x,y,w,h});},strokeRect(){},beginPath(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},save(){},restore(){},translate(){},scale(){},rotate(){},measureText(text){return{width:text.length*24};},strokeText(){},fillText(){},getTransform(){return{};},setTransform(){},createLinearGradient(){return{addColorStop(){}};},getImageData(){return{data:new Uint8ClampedArray(c.width*c.height*4)};},putImageData(){}});
  return c;
}
globalThis.document={createElement:canvas,getElementById:canvas};
const engine=await import(process.argv[2]??'./dist/bcu-engine.js');
const manifest=JSON.parse(await readFile(new URL('../web/data/engine-assets.json',import.meta.url),'utf8'));
console.time('register');
for(const asset of manifest.entries)engine.registerAsset(asset.path,asset.url,asset.text??null,asset.width??0,asset.height??0,asset.size??0);
console.timeEnd('register');
console.time('initialize');
try {
  const counts=JSON.parse(engine.initializeEngine());
  console.timeEnd('initialize');
  assert.equal(counts.units,866);
  assert.equal(counts.enemies,779);
  console.log({counts});

  assert.deepEqual(JSON.parse(engine.stageRestrictions('000003',0,0,0,'-,0:0:20:0')),{
    richAllowed:true,sniperAllowed:true,valid:true,maximumLevels:null
  });

  // Desktop BCU's BattlePreset.generateBasis and SBCtrl, seed 12345.
  // The third fixture includes the preset's 20,000 HP cat-base bonus.
  const presets=[
    {map:0,stage:1,slots:[[2,0,5,0],[4,0,5,0],[6,0,5,0]],catHP:48000,enemyHP:4500,cannon:2700},
    {map:1,stage:1,slots:[[0,1,10,0],[1,1,10,0],[7,1,10,0],[8,1,10,0]],catHP:81000,enemyHP:25000,cannon:2700},
    {map:2,stage:0,slots:[[0,1,15,0],[16,1,15,0],[46,1,15,0]],catHP:123000,enemyHP:60000,cannon:2550},
  ];
  assert.equal(JSON.parse(engine.stagePreset('000003',0,0)),null);
  for(const fixture of presets) {
    const key=['000037',fixture.map,fixture.stage];
    const preset=JSON.parse(engine.stagePreset(...key));
    assert.deepEqual(preset.slots.filter(Boolean).map(slot=>[+slot.unitId,slot.fid,slot.level,slot.plusLevel]),fixture.slots);
    assert.deepEqual(preset.nyc,[0,-1,-1]);
    const lineup=preset.slots.map(slot=>slot?[slot.unitId,slot.fid,slot.level,slot.plusLevel,slot.talents.join(';')].join(':'):'-');
    const battle=JSON.parse(engine.startConfiguredBattle(...key,0,lineup.join(),12345,preset.treasures.join(),'0,0,0',...key));
    assert.equal(battle.catMaxHealth,fixture.catHP);
    assert.equal(battle.enemyMaxHealth,fixture.enemyHP);
    assert.equal(battle.maxCannon,fixture.cannon);
    assert.deepEqual(battle.slots.map(slot=>slot.price>=0),preset.slots.map(Boolean));
  }

  for(const twoRows of [true,false]){
    engine.setBattleOptions(1,false,twoRows);
    engine.startBattle('000003',0,0,0,'0:0:20:0',12345);
    engine.stepBattle(300);engine.deployUnit(0);engine.stepBattle(10);
    rectangles.length=0;engine.renderBattle('test',1920,1200,0,1);
    const bars=rectangles.filter(rect=>rect.color==='rgba(0,255,255,1)'&&rect.w>0&&rect.h>0);
    assert.ok(bars.length>0,'Cooldown fill must be visible: twoRows='+twoRows);
    assert.ok(rectangles.some(rect=>rect.color==='rgba(0,0,0,1)'&&rect.w>0&&rect.h>0),'Cooldown background must be opaque');
    assert.ok(!rectangles.some(rect=>/,-/.test(String(rect.color))),'Canvas alpha must never be negative');
    const width=bars[0].w;engine.stepBattle(10);rectangles.length=0;engine.renderBattle('test',1920,1200,0,1);
    assert.ok(rectangles.some(rect=>rect.color==='rgba(0,255,255,1)'&&rect.w>width),'Cooldown fill must advance');
  }
  console.log('PASS: opaque cooldown background and advancing cyan fill in both lineup layouts.');

  engine.setBattleOptions(1,false,true);
  engine.startBattle('000003',0,0,0,'0:0:20:0',12345);
  engine.stepBattle(300);
  engine.deployUnit(0);
  const original=JSON.parse(engine.stepBattle(150));
  const replay=engine.exportReplay('Regression');
  const playback=JSON.parse(engine.startReplay(replay));
  assert.equal(playback.replayStage,'000003/0/0');
  assert.equal(playback.replayLength,original.frame);
  const end=JSON.parse(engine.stepBattle(original.frame));
  for(const key of ['frame','money','catHealth','enemyHealth','entities','slots'])assert.deepEqual(end[key],original[key],key);
  if(process.env.BCU_REPLAY_TEST_OUTPUT)await writeFile(process.env.BCU_REPLAY_TEST_OUTPUT,Buffer.from(replay,'base64'));
  if(process.env.BCU_REPLAY_TEST_INPUT){
    const desktop=(await readFile(process.env.BCU_REPLAY_TEST_INPUT)).toString('base64');
    assert.equal(JSON.parse(engine.startReplay(desktop)).replayLength,original.frame);
    assert.deepEqual(JSON.parse(engine.stepBattle(original.frame)),end);
  }
  console.log('PASS: exported replay reproduced the original battle state.');

} catch(error){console.error(error);throw error;}
