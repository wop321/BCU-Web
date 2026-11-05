// Playback boundary for the original engine's bcu-audio events.
let sharedContext;
function audioContext(){
  const Constructor=globalThis.AudioContext??globalThis.webkitAudioContext;
  if(!Constructor)throw new Error('Web Audio is unavailable in this browser.');
  return sharedContext??=new Constructor();
}
export async function unlockBattleAudio(){const context=audioContext();if(context.state==='suspended')await context.resume();return context;}

export class BattleAudio {
  constructor(api,{context=audioContext(),target=globalThis,fetcher=globalThis.fetch.bind(globalThis)}={}){
    this.api=api;this.context=context;this.target=target;this.fetcher=fetcher;
    this.buffers=new Map();this.voices=new Set();this.alive=true;this.generation=0;this.music=null;
    this.onEvent=event=>{const {kind,id}=event.detail??{};if(kind==='bgm')this.playMusic(id).catch(error=>this.report(error));else if(kind==='se')this.playSound(id).catch(error=>this.report(error));};
    this.onGesture=()=>{if(context.state==='suspended')context.resume().catch(error=>this.report(error));};
    target.addEventListener('bcu-audio',this.onEvent);
    target.addEventListener('pointerdown',this.onGesture);target.addEventListener('keydown',this.onGesture);
  }
  report(error){console.error('BCU audio:',error);}
  volume(group){return Math.max(0,Math.min(1,Number(this.api.state.config[group]??50)/100));}
  enabled(){return this.alive&&this.api.state.config.music!==false;}
  async buffer(id){
    const track=this.api.catalog.music.find(track=>String(track.id)===String(id));
    if(!track)return null;
    const url=this.api.assetPath(track.url??track.path);
    if(!this.buffers.has(url)){
      const promise=(async()=>{const response=await this.fetcher(url);if(!response.ok)throw new Error('Could not load audio '+url);return this.context.decodeAudioData(await response.arrayBuffer());})();
      this.buffers.set(url,promise);promise.catch(()=>this.buffers.delete(url));
    }
    return {track,buffer:await this.buffers.get(url)};
  }
  voice(buffer,volume){
    const source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=buffer;gain.gain.value=volume;source.connect(gain);gain.connect(this.context.destination);
    this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};
    return source;
  }
  async playMusic(id){
    const generation=++this.generation;
    if(this.music){this.music.stop();this.music=null;}
    if(!this.enabled()||Number(id)<0)return;
    const data=await this.buffer(id);if(!data||!this.enabled()||generation!==this.generation)return;
    const source=this.voice(data.buffer,this.volume('volumeBG'));
    const loop=Math.max(0,Number(data.track.loop??0)/1000);
    source.loop=loop<data.buffer.duration;
    if(loop>0&&source.loop)source.loopStart=loop;
    this.music=source;source.start();
  }
  async playSound(id){
    if(!this.enabled())return;
    const data=await this.buffer(id);if(!data||!this.enabled())return;
    if(this.voices.size>=32)return;
    const ui=[8,9,10,15,19,27,28,57].includes(Number(id));
    this.voice(data.buffer,this.volume(ui?'volumeUI':'volumeSE')).start();
  }
  finish(id){this.generation++;if(this.music){this.music.stop();this.music=null;}return this.playSound(id);}
  stop(){
    this.alive=false;this.generation++;
    this.target.removeEventListener('bcu-audio',this.onEvent);
    this.target.removeEventListener('pointerdown',this.onGesture);this.target.removeEventListener('keydown',this.onGesture);
    for(const source of this.voices)source.stop();this.voices.clear();this.buffers.clear();this.music=null;
  }
}
