import test from 'node:test';
import assert from 'node:assert/strict';
import {BattleAudio} from '../web/audio.mjs';

function fixture(){
  const target=new EventTarget(),sources=[];let requests=0;
  const context={state:'running',destination:{},async decodeAudioData(){return{duration:10};},createGain(){return{gain:{value:0},connect(){},disconnect(){}};},createBufferSource(){const source={connect(gain){this.gain=gain;},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;this.onended?.();}};sources.push(source);return source;}};
  const config={music:true,volumeBG:40,volumeSE:30,volumeUI:20};
  const api={state:{config},assetPath:value=>value,catalog:{music:[{id:0,url:'music.ogg',loop:2000},{id:20,url:'hit.ogg'},{id:19,url:'deploy.ogg'}]}};
  const audio=new BattleAudio(api,{target,context,fetcher:async()=>{requests++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};}});
  const emit=(kind,id)=>target.dispatchEvent(new CustomEvent('bcu-audio',{detail:{kind,id}}));
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  return{audio,config,sources,emit,flush,requests:()=>requests};
}
test('engine events play BGM, attack and deployment audio with separate volume settings',async()=>{
  const f=fixture();f.emit('bgm',0);await f.flush();
  assert.equal(f.sources[0].started,true);assert.equal(f.sources[0].loop,true);assert.equal(f.sources[0].loopStart,2);assert.equal(f.sources[0].gain.gain.value,.4);
  f.emit('se',20);f.emit('se',19);await f.flush();
  assert.equal(f.sources[1].gain.gain.value,.3);assert.equal(f.sources[2].gain.gain.value,.2);
  f.emit('bgm',0);await f.flush();assert.equal(f.sources[0].stopped,true);assert.equal(f.requests(),3);
  f.audio.stop();assert.ok(f.sources.every(source=>source.stopped));
  f.emit('se',20);await f.flush();assert.equal(f.sources.length,4);
});
test('mute and leaving a battle prevent delayed audio from starting',async()=>{
  const f=fixture();f.config.music=false;f.emit('se',20);f.emit('bgm',0);await f.flush();assert.equal(f.requests(),0);
  f.config.music=true;const pending=f.audio.playMusic(0);f.audio.stop();await pending;assert.equal(f.sources.length,0);
});
