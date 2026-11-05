import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseImgCut,serializeImgCut,parseMaModel,serializeMaModel,parseMaAnim,serializeMaAnim,validateDocuments,zipFiles} from '../web/editors.mjs';
import {spawnRows,headRows} from '../web/stages.mjs';
import {safePath} from '../web/storage.mjs';
const root=new URL('../web/',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
const catalog=JSON.parse(await read('data/catalog.json'));

test('the supplied Cat sprite, model and timeline retain their native data',async()=>{
  const source=catalog.units[0].forms[0].animation;
  const cut=parseImgCut(await read(source.imgcut)),model=parseMaModel(await read(source.mamodel)),animation=parseMaAnim(await read(source.maanim[0]));
  assert.deepEqual(parseImgCut(serializeImgCut(cut)),cut);assert.deepEqual(parseMaModel(serializeMaModel(model)),model);assert.deepEqual(parseMaAnim(serializeMaAnim(animation)),animation);
  validateDocuments({cut,model,animations:[{data:animation}]});
  const modified=structuredClone(model);modified.parts[0].values[0]=0;
  assert.throws(()=>validateDocuments({cut,model:modified,animations:[{data:animation}]}),/parent/i);
});

test('workspace imports reject traversal and absolute paths',()=>{
  for(const path of ['../file','a/../file','/absolute','a\\file','a\0file','.'])assert.equal(safePath(path),false,path);
  assert.equal(safePath('animations/123/model.mamodel'),true);
});

test('stage table preserves original reverse ordering and spawn ranges',()=>{
  const api={catalog:{enemies:[{id:1,name:'Doge'},{id:2,name:'Snache'}]},t:(_,fallback)=>fallback};
  const stage={trail:false,lines:[{enemy:1,boss:0,multiple:100,mult_atk:200,number:0,castle_0:100,castle_1:0,spawn_0:0,spawn_1:30,respawn_0:60,respawn_1:90,layer_0:0,layer_1:9,kill_count:0,group:0},{enemy:2,boss:2,multiple:200,mult_atk:200,number:1,castle_0:50,castle_1:70,spawn_0:100,spawn_1:0,respawn_0:300,respawn_1:300,layer_0:4,layer_1:4,kill_count:2,group:0}]};
  const rows=spawnRows(api,stage,150);
  assert.deepEqual([...rows[0]],['Boss (Shake)','Snache','300%',1,'50~70%','100','300','4',2,'','--'].map((x,i)=>i===5?100:x));
  assert.deepEqual([...rows[1]],['','Doge','{150, 300}%','Infinite','100%','0~30','60~90','0~9',0,'','--']);
});

test('EoC header applies the original selected chapter health multiplier',()=>{
  const api={catalog:{enemies:[]},t:(_,fallback)=>fallback};
  const stage={id:'003-000-000',sid:0,health:1000,len:2000,max:5,mush:0,minSpawn:1,maxSpawn:1,music:0,music1:-1,background:0,background1:-1,castle:0,bgh:0};
  const rows=headRows(api,stage,{sid:0,price:1,stars:[100,100,100]},2);
  assert.equal(rows.length,6);assert.equal(rows[1][1],3000);assert.equal(rows[0][1],'000003/0-0');
});

test('native file export creates a ZIP with the correct payload and directory records',async()=>{
  const data=Uint8Array.from([0,1,2,255,0]),blob=zipFiles([['sprite.bin',data]]),bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);const length=view.getUint16(26,true);assert.deepEqual(bytes.slice(30+length,30+length+data.length),data);assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);assert.equal(view.getUint16(bytes.length-12,true),1);
});
