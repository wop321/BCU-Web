import {readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const file of ['web/app.mjs','web/storage.mjs','web/information.mjs','web/lineup.mjs','web/editors.mjs','web/stages.mjs','web/resources.mjs','web/battle.mjs','web/audio.mjs','web/viewers.mjs','web/packs.mjs','scripts/serve.mjs']){
  const result=spawnSync(process.execPath,['--check',root+file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
}
for(const file of ['web/index.html','web/styles.css','web/engine/bcu.js'])await access(root+file);
const catalog=JSON.parse(await readFile(root+'web/data/catalog.json','utf8'));
if(!catalog.units?.length||!catalog.enemies?.length||!catalog.collections?.length)throw new Error('Real game data is missing.');
const first=catalog.units[0].forms[0];
for(const file of [first.animation.sprite,first.animation.imgcut,first.animation.mamodel,...first.animation.maanim,first.icon])await access(root+'web/'+file);
const layouts=JSON.parse(await readFile(root+'web/data/layouts.json','utf8'));
if(layouts.pages.MainPage.defaultPlacements.vuni.join(',')!=='600,200,200,50')throw new Error('Desktop main menu geometry has changed.');
console.log(`Verified browser files, original assets, ${catalog.units.length} units, ${catalog.enemies.length} enemies, and desktop main-menu geometry.`);
