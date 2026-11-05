import {zipFiles} from './editors.mjs';

export async function renderResources(api){
  const {element,place,label,button}=api;api.backButton();let selected=null,asTable=false,generation=0,cancelled=false;api.addCleanup(()=>{cancelled=true;generation++;});
  const response=await fetch('data/resources.json');if(!response.ok)throw new Error('Resource manifest is missing.');const manifest=await response.json();if(cancelled)return;
  const entries=Array.isArray(manifest)?manifest:manifest.files,root={name:'assets',children:new Map(),files:[]};
  for(const value of entries){const entry=typeof value==='string'?{path:value}:value;const segments=entry.path.replace(/^assets\//,'').split('/');let node=root;for(let i=0;i<segments.length-1;i++){const name=segments[i];if(!node.children.has(name))node.children.set(name,{name,path:'assets/'+segments.slice(0,i+1).join('/'),children:new Map(),files:[]});node=node.children.get(name);}node.files.push({...entry,name:segments.at(-1)});}
  label('assets',[50,100,400,50]);const title=label('content',[450,100,1400,50]);
  const tree=place(element('div',undefined,'list'),[50,150,400,800]);tree.role='tree';tree.style.fontSize='inherit';
  const preview=place(element('div',undefined,'file-preview'),[450,150,1400,800]);
  const tableToggle=button('table',[450,950,200,50],el=>{asTable=el.getAttribute('aria-pressed')==='true';renderSelected();},{toggle:true,disabled:true});
  const extract=button('extract',[50,950,400,50],async()=>{
    if(!selected)return;extract.disabled=true;try{
      if(selected.children){const prefix=selected.path?selected.path+'/':'assets/';const files=entries.filter(entry=>(typeof entry==='string'?entry:entry.path).startsWith(prefix));const payload=[];
        for(let start=0;start<files.length;start+=20){extract.textContent=api.t('extract')+' '+start+'/'+files.length;payload.push(...await Promise.all(files.slice(start,start+20).map(async entry=>{const path=typeof entry==='string'?entry:entry.path;const response=await fetch(api.assetPath(path));if(!response.ok)throw new Error('Cannot extract '+path);return[path.slice(prefix.length),new Uint8Array(await response.arrayBuffer())];})));}
        api.download(zipFiles(payload),(selected.name||'assets')+'.zip');
      }else{const response=await fetch(api.assetPath(selected.path));if(!response.ok)throw new Error('Cannot extract '+selected.path);api.download(await response.blob(),selected.name);}
    }finally{extract.disabled=false;extract.textContent=api.t('extract');}
  });
  function select(node,row){selected=node;for(const previous of tree.querySelectorAll('[aria-selected=true]'))previous.setAttribute('aria-selected','false');row.setAttribute('aria-selected','true');renderSelected().catch(error=>api.message('Error',error.message));}
  function appendNodes(parent,node){
    for(const directory of node.children.values()){
      const group=element('div'),row=element('div',undefined,'list-row tree-row');row.role='treeitem';row.tabIndex=0;row.setAttribute('aria-expanded','false');row.textContent='▸ '+directory.name;const contents=element('div');contents.hidden=true;contents.style.paddingLeft='14px';let populated=false;
      const toggle=()=>{if(!populated){appendNodes(contents,directory);populated=true;}contents.hidden=!contents.hidden;row.setAttribute('aria-expanded',String(!contents.hidden));row.textContent=(contents.hidden?'▸ ':'▾ ')+directory.name;select(directory,row);};row.onclick=toggle;row.onkeydown=event=>{if(['Enter','ArrowRight','ArrowLeft',' '].includes(event.key)){event.preventDefault();toggle();}};group.append(row,contents);parent.append(group);
    }
    for(const file of node.files){const row=element('div','  '+file.name,'list-row tree-row');row.role='treeitem';row.tabIndex=0;row.onclick=()=>select(file,row);row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(file,row);}};parent.append(row);}
  }
  async function renderSelected(){
    const request=++generation;preview.replaceChildren();if(!selected||selected.children){title.textContent='content';tableToggle.disabled=true;return;}
    const file=selected;title.textContent=file.path;const image=/\.(png|jpg|jpeg|webp)$/i.test(file.name);tableToggle.disabled=!file.name.endsWith('.csv');
    if(image){title.textContent='image';const img=element('img');img.src=api.assetPath(file.path);img.alt=file.name;preview.append(img);return;}
    if(/\.(ogg|wav|mp3)$/i.test(file.name)){const player=element('audio');player.controls=true;player.src=api.assetPath(file.path);preview.append(player);return;}
    const response=await fetch(api.assetPath(file.path));if(!response.ok)throw new Error('Cannot read '+file.path);const text=await response.text();if(request!==generation||cancelled)return;
    if(asTable&&file.name.endsWith('.csv')){const table=element('table');for(const [index,line]of text.trimEnd().split(/\r?\n/).entries()){const row=element('tr');for(const field of line.split(/, */))row.append(element(index===0?'th':'td',field));table.append(row);}preview.append(table);}else preview.textContent=text;
  }
  const rootRow=element('div','▾ assets','list-row tree-row');rootRow.role='treeitem';rootRow.setAttribute('aria-expanded','true');rootRow.onclick=()=>select(root,rootRow);tree.append(rootRow);const children=element('div');children.style.paddingLeft='14px';appendNodes(children,root);tree.append(children);
}
