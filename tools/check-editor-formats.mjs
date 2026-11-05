import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseImgCut,serializeImgCut,parseMaModel,serializeMaModel,parseMaAnim,serializeMaAnim,validateDocuments,zipFiles} from '../web/editors.mjs';

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=path.join(workspace,'web');
const catalog=JSON.parse(await fs.readFile(path.join(web,'data/catalog.json'),'utf8'));
const sources=[catalog.units[0].forms[0],catalog.units[75].forms[2],catalog.units[400].forms[0],catalog.enemies[1],catalog.enemies[250],catalog.effects[0],catalog.effects[40],catalog.souls[0]];
let checked=0;
for(const source of sources){
  const meta=source.animation;
  const cut=parseImgCut(await fs.readFile(path.join(web,meta.imgcut),'utf8'));
  const model=parseMaModel(await fs.readFile(path.join(web,meta.mamodel),'utf8'));
  assert.deepEqual(parseImgCut(serializeImgCut(cut)),cut,'Image cuts must retain all numeric rows and names');
  assert.deepEqual(parseMaModel(serializeMaModel(model)),model,'Models must retain parts, units, configs and names');
  const animations=[];
  for(const name of meta.maanim){const data=parseMaAnim(await fs.readFile(path.join(web,name),'utf8'));assert.deepEqual(parseMaAnim(serializeMaAnim(data)),data,'Timelines must retain keyframes and names');animations.push({name,data});checked++;}
  const png=await fs.readFile(path.join(web,meta.sprite));
  const image={naturalWidth:png.readUInt32BE(16),naturalHeight:png.readUInt32BE(20)};
  validateDocuments({cut,model,animations,image});
  const invalid=structuredClone({cut,model,animations,image});invalid.model.parts[0].values[0]=0;
  assert.throws(()=>validateDocuments(invalid),/parent/,'Parent cycles must be rejected before saving');
}
const zip=zipFiles([['original.imgcut',new TextEncoder().encode('[imgcut]\n0\nsprite.png\n0\n')],['sprite.png',new Uint8Array([0,1,128,255])]]);
const output=path.join(workspace,'tools','editor-export-test.zip');
await fs.writeFile(output,new Uint8Array(await zip.arrayBuffer()));
console.log(`Verified ${sources.length} real sprites/models and ${checked} real animation timelines preserve their BCU data through editing serialization. ZIP sample: ${output}`);
