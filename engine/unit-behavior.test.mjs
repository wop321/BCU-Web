import assert from 'node:assert/strict';
import { readFile,readdir,writeFile } from 'node:fs/promises';

// Headless graphics boundary: simulation sees real PNG dimensions; bitmap drawing is verified in the browser.
globalThis.Image = class { constructor(width,height){this.width=this.naturalWidth=width;this.height=this.naturalHeight=height;this.complete=true;} };
function canvas(){
  const c={width:1,height:1};
  c.getContext=()=>({drawImage(){},fillRect(){},strokeRect(){},beginPath(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},save(){},restore(){},translate(){},scale(){},rotate(){},measureText(text){return{width:text.length*24};},strokeText(){},fillText(){},getTransform(){return{};},setTransform(){},createLinearGradient(){return{addColorStop(){}};},getImageData(){return{data:new Uint8ClampedArray(c.width*c.height*4)};},putImageData(){}});
  return c;
}
globalThis.document={createElement:canvas,getElementById:canvas};
const engine=await import('./dist/bcu-engine.js');
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

  for(const id of [0,1,2,25])assert.match(engine.unitBattleProbe(id),/spirit=false/);
  assert.match(engine.unitBattleProbe(728),/spirit=true/);
  engine.setBattleOptions(1,false,true);
  engine.startBattle('000003',0,0,0,'0:0:20:0',12345);
  engine.stepBattle(300);engine.deployUnit(0);let state=JSON.parse(engine.stepBattle(1));
  assert.equal(state.slots[0].conjure,false);
  let frames=new Set(),attacked=false;
  for(let i=0;i<1200;i++){state=JSON.parse(engine.stepBattle(1));for(const unit of state.entities.filter(e=>e.direction===-1)){frames.add(unit.animationFrame);attacked ||= unit.damageGiven>0;}}
  assert.ok(frames.size>2,'Ordinary unit animation must advance');
  assert.ok(attacked,'Ordinary Cat must deal damage');
  engine.startBattle('000003',0,0,0,'728:0:50:0',12345);
  engine.stepBattle(3000);engine.deployUnit(0);state=JSON.parse(engine.stepBattle(30));assert.equal(state.slots[0].conjure,true);
  engine.deployUnit(0);state=JSON.parse(engine.stepBattle(1));assert.ok(state.entities.some(e=>e.isSpirit),'True conjurer must spawn a spirit');
  console.log('PASS: ordinary units animate and attack without conjure; genuine conjurer spawns a spirit.');

} catch(error){console.error(error);throw error;}
