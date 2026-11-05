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
const engine=await import('../.runtime/fix-engine/bcu-engine.js');
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
  for(const id of [0,1,2,25,797])console.log(engine.unitBattleProbe(id));
} catch(error){console.error(error);throw error;}
