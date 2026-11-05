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
  const golden=JSON.parse(await readFile(new URL('./validation/battle-jvm.json',import.meta.url),'utf8'));
  let state=JSON.parse(engine.startBattle('000003',0,0,0,'0:0:20:0,1:0:20:0,2:0:20:0',12345));
  function compare(expected,actual,path='state'){
    if(typeof expected==='number'){assert.ok(Math.abs(expected-actual)<0.0001,`${path}: JVM ${expected}, TeaVM ${actual}`);return;}
    if(Array.isArray(expected)){assert.equal(actual.length,expected.length,path+' length');expected.forEach((value,index)=>compare(value,actual[index],path+'['+index+']'));return;}
    if(expected&&typeof expected==='object'){for(const key of Object.keys(expected))compare(expected[key],actual[key],path+'.'+key);return;}
    assert.equal(actual,expected,path);
  }
  compare(golden[0],state);
  for(let frame=1;frame<=1200;frame++){
    if(frame>=301&&frame%60===1)engine.deployUnit(0);
    if(frame>=361&&frame%120===1)engine.deployUnit(1);
    if(frame===401)engine.workerUpgrade();
    if(frame===801)engine.fireCannon();
    state=JSON.parse(engine.stepBattle(1));
    if(frame%300===0){compare(golden[frame/300],state);console.log({matchedFrame:frame,money:state.money,entities:state.entities.length,catHealth:state.catHealth});}
  }
  engine.renderBattle('test',1000,560,0,1);
  console.log('Original JVM vs TeaVM: 1,200 frames, five matching snapshots; original painter smoke passed');
  if(engine.loadPackJson){
    const fixture=new URL('../tools/fixtures/native-pack/',import.meta.url);
    const pack=JSON.parse(await readFile(new URL('pack.json',fixture),'utf8'));
    async function registerDirectory(relative=''){
      for(const item of await readdir(new URL(relative,fixture),{withFileTypes:true})){
        const name=relative+item.name;
        if(item.isDirectory()){await registerDirectory(name+'/');continue;}
        const buffer=await readFile(new URL(name,fixture));const png=name.endsWith('.png');
        engine.registerPackAsset(pack.desc.id,'./'+name,'fixture/'+name,png?null:buffer.toString('utf8'),png?buffer.readUInt32BE(16):0,png?buffer.readUInt32BE(20):0,buffer.length);
      }
    }
    await registerDirectory();
    const loaded=JSON.parse(engine.loadPackJson(JSON.stringify(pack)));
    assert.equal(loaded.units,1);assert.equal(loaded.enemies,1);assert.equal(loaded.maps,1);
    const roundTrip=JSON.parse(engine.getPackJson(pack.desc.id));
    assert.equal(roundTrip.units.data[0].val.forms[0].du.hp,1000);
    assert.equal(roundTrip.enemies.data[0].val.de.hp,10000);
    console.log('Original native pack fixture decoded and encoded through BCU JsonDecoder/JsonEncoder');
  }
  if(engine.createGif){
    const gifCanvas={width:2,height:2,getContext(){return{getImageData(){return{data:new Uint8ClampedArray([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255])};}};}};
    const gif=engine.createGif(2,2,10);engine.addGifFrame(gif,gifCanvas);engine.addGifFrame(gif,gifCanvas);
    const bytes=Buffer.from(engine.finishGif(gif),'base64');assert.equal(bytes.subarray(0,6).toString(),'GIF89a');
    await writeFile(new URL('./validation/smoke.gif',import.meta.url),bytes);
    console.log('Original GIF encoder produced 2-frame GIF');
  }
} catch(error){
  console.error('DIAGNOSTICS',engine.engineDiagnostics());
  console.error(error, error.javaException?.toString?.());
  throw error;
}
