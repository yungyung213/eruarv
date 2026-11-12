import {palette,paletteLabel} from './palette.js';
import {imageAssets} from './image-assets.js';
import {githubConnection, maxUploadBytes, uploadPath} from './github-api.mjs';
import {photos as seedPosts} from './photos.js';
import {mainMedia as seedMain} from './site-config.js';
const $=selector=>document.querySelector(selector),status=$('#admin-status');
const editorMode=document.body.dataset.editor==='true',params=new URLSearchParams(location.search);
let connection, sessionToken, rows=[],settings={},postMedia=[],mainMedia=[],busy=false,dirty=false,revision='';
const editors = new Set();
let appearance={theme:'dark',particles:true};
const pendingUploads=new Map(), previewURLs=new Map();
const thumbnail=media=>previewURLs.get(media.thumb)||previewURLs.get(media.src)||media.thumb||(imageAssets[media.src]?media.src.replace(/\.png$/,'-thumb.jpg'):media.src);
function tell(text=''){status.textContent=text;status.hidden=!text;}
function changed(){dirty=true;$('#editor-save-state').textContent='';$('#main-save-state').textContent='변경됨';}
function canSave(){return !!connection;}
function disable(){for(const el of document.querySelectorAll('#publish,#save-draft,#save-main,#seed,#post-files,#main-files,[data-server-action]'))el.disabled=!canSave()||busy;$('#login-button').disabled=busy;}
async function api(name,input){
 if(!connection || name!=='admin-data')throw new Error('GitHub에 연결하세요.');
 const result = input
  ? await connection.saveArchive(input,revision,pendingUploads)
  : await connection.readArchive();
 revision=result.revision;
 for(const path of result.savedPaths || [])pendingUploads.delete(path);
 return result;
}
async function task(fn){if(busy)return false;busy=true;tell();disable();try{await fn();return true;}catch(error){tell(error.message);return false;}finally{busy=false;disable();}}
function button(label,fn,{server=false}={}){const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=fn;if(server){el.dataset.serverAction='';el.disabled=!canSave()||busy;}return el;}
function syncResult(data){if(data.posts)rows=data.posts;if(data.settings)settings=data.settings;}
function launchEditor(row){
 const url=new URL('admin-editor.html',location.href);
 if(row)url.searchParams.set('post',row.id);
 const editor=window.open(url.href,'_blank','popup,width=1080,height=900,resizable=yes,scrollbars=yes');
 if(!editor){tell('새 창이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');return;}
 for(const child of editors)if(child.closed)editors.delete(child);
 editors.add(editor);
}
function openPost(row){
 const post=row?.payload||{id:crypto.randomUUID(),date:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),genre:'',other:[],colors:[],images:[]};
 const f=$('#post-form').elements;for(const key of ['id','date','genre','thxTo','thxUrl'])f[key].value=post[key]||'';
 f.other.value=(post.other||[]).join(', ');f.colors.value=(post.colors||[]).join(', ');postMedia=structuredClone(post.images);renderPickers();renderMedia('post');
 $('#editor-title').textContent=row?'edit post':'new post';$('#post-state').textContent=row?.status==='published'?'공개':row?.status==='private'?'비공개':'임시 저장';
}
function list(){
 const target=$('#post-list');target.replaceChildren();$('#post-count').textContent=`${rows.length} posts`;
 for(const row of [...rows].sort((a,b)=>b.payload.date.localeCompare(a.payload.date))){
  const card=document.createElement('article');card.className='post-card';card.dataset.id=row.id;
  const open=button('',()=>launchEditor(row));open.className='post-open';open.setAttribute('aria-label',`${row.payload.date} 게시물 편집`);
  const first=row.payload.images[0];if(first){const el=document.createElement(first.type==='video'?'video':'img');el.src=thumbnail(first);if(el.tagName==='VIDEO'){el.muted=true;el.preload='metadata';el.playsInline=true;}else{el.alt='';el.loading='lazy';}open.append(el);}
  const date=document.createElement('span');date.textContent=row.payload.date;const state=document.createElement('small');state.textContent=`${row.payload.genre||'분류 없음'} · ${row.status==='published'?'공개':row.status==='private'?'비공개':'임시 저장'}`;open.append(date,state);card.append(open);
  const actions=document.createElement('div');actions.className='post-actions';
  actions.append(button(row.status==='published'?'비공개':'공개',()=>task(async()=>{syncResult(await api('admin-data',{action:'set-post-status',id:row.id,status:row.status==='published'?'private':'published'}));list();}),{server:true}));
  actions.append(button('삭제',()=>{
   const confirm=document.createElement('div');confirm.className='inline-confirm';confirm.setAttribute('role','group');confirm.setAttribute('aria-label','게시물 삭제 확인');
   const text=document.createElement('span');text.textContent='이 게시물을 삭제할까요?';
   confirm.append(text,button('삭제',()=>task(async()=>{syncResult(await api('admin-data',{action:'delete-post',id:row.id}));list();}),{server:true}),button('취소',()=>confirm.remove()));
   card.querySelector('.inline-confirm')?.remove();card.append(confirm);
  },{server:true}));card.append(actions);target.append(card);
 }
}
function moveMedia(kind,from,to){if(busy||from===to)return;const collection=kind==='post'?postMedia:mainMedia;const [item]=collection.splice(from,1);collection.splice(to,0,item);changed();renderMedia(kind);}
function attachDrag(handle,item,kind,index){
 let pointerId=null,destination=index;
 handle.onpointerdown=event=>{if(event.button!==0||busy)return;event.preventDefault();pointerId=event.pointerId;destination=index;handle.setPointerCapture(pointerId);item.classList.add('is-dragging');};
 handle.onpointermove=event=>{if(pointerId!==event.pointerId)return;const track=$('#'+kind+'-media'),rect=track.getBoundingClientRect();
  const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('.media-item');if(hit?.parentElement===track)destination=Number(hit.dataset.index);
  track.querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));track.children[destination]?.classList.add('drop-target');
  if(kind==='main'){if(event.clientX>rect.right-40)track.scrollBy({left:16});else if(event.clientX<rect.left+40)track.scrollBy({left:-16});}
 };
 handle.onpointerup=event=>{if(pointerId!==event.pointerId)return;pointerId=null;item.classList.remove('is-dragging');$('#'+kind+'-media').querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));moveMedia(kind,index,destination);};
 handle.onpointercancel=()=>{pointerId=null;item.classList.remove('is-dragging');$('#'+kind+'-media').querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));};
 handle.onkeydown=event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const n=(kind==='post'?postMedia:mainMedia).length;moveMedia(kind,index,Math.max(0,Math.min(n-1,index+(event.key==='ArrowRight'?1:-1))));}};
}
function renderMedia(kind){
 const collection=kind==='post'?postMedia:mainMedia,target=$('#'+kind+'-media');target.replaceChildren();
 collection.forEach((media,index)=>{
  const item=document.createElement('article');item.className='media-item';item.dataset.index=index;
  const el=document.createElement(media.type==='video'?'video':'img');el.src=thumbnail(media);if(el.tagName==='VIDEO'){el.src=previewURLs.get(media.src)||media.src;el.controls=true;el.preload='metadata';el.playsInline=true;if(media.poster)el.poster=media.poster;}else el.alt=media.alt||'';item.append(el);
  const label=document.createElement('label');label.textContent=`${index+1} · 설명`;const alt=document.createElement('input');alt.value=media.alt||'';alt.placeholder='이미지 설명';alt.oninput=()=>{media.alt=alt.value;changed();};label.append(alt);item.append(label);
  if(media.type==='video'){const label=document.createElement('label');label.textContent='포스터 URL';const input=document.createElement('input');input.type='url';input.value=media.poster||'';input.onchange=()=>{media.poster=input.value;changed();};label.append(input);item.append(label);}
  const actions=document.createElement('div');actions.className='media-actions';const handle=button('이동',()=>{});handle.className='drag-handle';handle.setAttribute('aria-label',`${index+1}번 미디어 순서 이동. 끌거나 좌우 방향키를 사용하세요.`);attachDrag(handle,item,kind,index);
  const back=button('앞으로',()=>moveMedia(kind,index,index-1));back.disabled=index===0;
  const next=button('뒤로',()=>moveMedia(kind,index,index+1));next.disabled=index===collection.length-1;
  actions.append(handle,back,next,button('제거',()=>{if(busy)return;collection.splice(index,1);changed();renderMedia(kind);}));item.append(actions);target.append(item);
 });
 if(kind==='main'){const summary=$('#main-file-summary');summary.replaceChildren();collection.forEach((media,index)=>{const li=document.createElement('li');li.textContent=media.alt||media.src.split('/').pop();summary.append(li);});}
}
function knownValues(group){const used=rows.flatMap(row=>group==='genre'?[row.payload.genre]:(row.payload.other||[]));return [...new Set([...(settings.taxonomy?.[group]||[]),...used].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));}
function selectedCharacters(){return $('#post-form').elements.other.value.split(',').map(v=>v.trim()).filter(Boolean);}
function manageTaxonomy(target,group,label){
 const details=document.createElement('details');details.className='taxonomy-manager';const summary=document.createElement('summary');summary.textContent=label+' 관리';details.append(summary);
 const note=document.createElement('p');note.textContent='이름 변경·삭제는 기존 게시물에도 함께 반영됩니다.';details.append(note);
 for(const value of knownValues(group)){
  const row=document.createElement('div');row.className='taxonomy-row';const name=document.createElement('span');name.textContent=value;
  row.append(name,button('수정',()=>{const edit=document.createElement('div');edit.className='taxonomy-edit';const input=document.createElement('input');input.value=value;input.maxLength=100;input.setAttribute('aria-label',value+' 새 이름');
   edit.append(input,button('저장',()=>changeTaxonomy(group,'rename-taxonomy',value,input.value),{server:true}),button('취소',()=>edit.remove()));row.querySelector('.taxonomy-edit')?.remove();row.append(edit);input.focus();
  },{server:true}),button('삭제',()=>{const confirm=document.createElement('div');confirm.className='inline-confirm';const text=document.createElement('span');text.textContent='이 구분값을 삭제할까요?';confirm.append(text,button('삭제',()=>changeTaxonomy(group,'delete-taxonomy',value),{server:true}),button('취소',()=>confirm.remove()));row.querySelector('.inline-confirm')?.remove();row.append(confirm);},{server:true}));details.append(row);
 }
 target.append(details);
}
async function changeTaxonomy(group,action,value,replacement){await task(async()=>{
 const next=(replacement||'').trim();syncResult(await api('admin-data',{action,group,value,replacement:next}));const fields=$('#post-form').elements;
 if(group==='genre'&&fields.genre.value===value)fields.genre.value=action==='rename-taxonomy'?next:'';
 if(group==='other')fields.other.value=[...new Set(selectedCharacters().flatMap(v=>v===value?(action==='rename-taxonomy'?[next]:[]):[v]))].join(', ');
 renderPickers();list();changed();window.opener?.postMessage({type:'eru-post-saved'},location.origin);
 });}
function renderPickers(){
 const fields=$('#post-form').elements;
 for(const [group,label] of [['genre','카테고리'],['other','캐릭터']]){
  const target=$('#'+group+'-picker');target.replaceChildren();const selected=group==='genre'?[fields.genre.value]:selectedCharacters();
  const select=document.createElement('select');select.setAttribute('aria-label',label+' 선택');const values=[['__new__','+ 새로 만들기'],['',group==='genre'?'카테고리 선택':'캐릭터 추가 선택'],...knownValues(group).map(value=>[value,(selected.includes(value)&&group==='other'?'✓ ':'')+value])];
  if(group==='genre'&&fields.genre.value&&!values.some(([v])=>v===fields.genre.value))values.push([fields.genre.value,fields.genre.value]);
  for(const [value,text] of values){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=group==='genre'?fields.genre.value:'';target.append(select);
  const create=document.createElement('div');create.className='new-value';create.hidden=true;const input=document.createElement('input');input.placeholder='새 '+label;input.maxLength=100;input.setAttribute('aria-label','새 '+label);
  const add=button('추가',()=>task(async()=>{const value=input.value.trim();if(!value||value.includes(',')||value==='__new__')throw new Error('구분값은 쉼표 없이 입력하세요.');syncResult(await api('admin-data',{action:'save-taxonomy',group,value}));if(group==='genre')fields.genre.value=value;else fields.other.value=[...new Set([...selected,value])].join(', ');changed();renderPickers();}),{server:true});
  create.append(input,add,button('취소',()=>create.hidden=true));target.append(create);
  select.onchange=()=>{if(select.value==='__new__'){create.hidden=false;input.focus();select.value=group==='genre'?fields.genre.value:'';return;}changed();if(group==='genre')fields.genre.value=select.value;else if(select.value)fields.other.value=[...new Set([...selected,select.value])].join(', ');renderPickers();};
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();add.click();}};
  if(group==='other'){const tags=document.createElement('div');tags.className='selected-values';for(const value of selected)tags.append(button(value+' ×',()=>{fields.other.value=selected.filter(v=>v!==value).join(', ');changed();renderPickers();}));target.append(tags);}
  manageTaxonomy(target,group,label);
 }
 $('#known-credits')?.remove();const credits=document.createElement('datalist');credits.id='known-credits';for(const value of new Set(rows.map(row=>row.payload.thxTo).filter(Boolean))){const option=document.createElement('option');option.value=value;credits.append(option);}fields.thxTo.setAttribute('list','known-credits');$('#post-form').append(credits);renderPalette();
}
function renderPalette(){
 const field=$('#post-form').elements.colors,target=$('#palette-picker');target.replaceChildren();const selected=field.value.split(',').map(v=>v.trim()).filter(Boolean);
 for(const [colorIndex,color] of palette.entries()){const el=button('',()=>{field.value=(selected.includes(color.color)?selected.filter(v=>v!==color.color):[...selected,color.color]).join(', ');changed();renderPalette();});el.className='palette-option';const name=['Red','Orange','Yellow','Green','Blue','Navy','Violet','White','Gray','Black'][colorIndex];el.title=name;el.setAttribute('aria-label',name);el.setAttribute('aria-pressed',String(selected.includes(color.color)));const dot=document.createElement('span');dot.className='palette-dot';dot.style.background=color.color;dot.setAttribute('aria-hidden','true');el.append(dot);target.append(el);}
 const legacy=$('#legacy-palette');legacy.replaceChildren();for(const color of selected.filter(v=>!palette.some(item=>item.color===v))){const el=button('×',()=>{field.value=selected.filter(v=>v!==color).join(', ');changed();renderPalette();});el.setAttribute('aria-label',paletteLabel(color)+' 제거');legacy.append(el);}
}
function collect(){const f=$('#post-form').elements;return {id:f.id.value,date:f.date.value,genre:f.genre.value.trim(),other:selectedCharacters(),colors:f.colors.value.split(',').map(v=>v.trim()).filter(Boolean),thxTo:f.thxTo.value.trim(),thxUrl:f.thxUrl.value.trim(),images:postMedia};}
function renderAppearance(){for(const el of document.querySelectorAll('[data-theme]'))el.setAttribute('aria-pressed',String(el.dataset.theme===appearance.theme));for(const el of document.querySelectorAll('[data-particles]'))el.setAttribute('aria-pressed',String((el.dataset.particles==='true')===appearance.particles));}
async function load(){const data=await api('admin-data');syncResult(data);mainMedia=structuredClone(settings.mainMedia||seedMain);appearance={theme:settings.appearance?.theme||'dark',particles:settings.appearance?.particles??true};list();renderMedia('main');renderAppearance();renderPickers();$('#seed').hidden=!!settings.initialized;}
function workspace(){document.body.classList.add('is-authenticated');$('#login-panel').hidden=true;$('#workspace').hidden=false;if(editorMode)$('#post-form').hidden=false;disable();}
async function save(publish){if(!canSave())return;await task(async()=>{syncResult(await api('admin-data',{action:'save-post',post:collect(),status:publish?'published':'draft'}));dirty=false;tell(publish?'GitHub에 저장했습니다. Pages 배포가 끝나면 홈페이지에 반영됩니다.':'GitHub에 임시 저장했습니다.');$('#post-state').textContent=publish?'공개':'임시 저장';$('#editor-save-state').textContent='';window.opener?.postMessage({type:'eru-post-saved'},location.origin);});}
$('#post-form').onsubmit=event=>{event.preventDefault();save(true);};$('#save-draft').onclick=()=>save(false);$('#new-post').onclick=()=>launchEditor();
$('#seed').onclick=()=>task(async()=>{await api('admin-data',{action:'seed',posts:seedPosts,media:seedMain});await load();});
$('#save-main').onclick=()=>task(async()=>{syncResult(await api('admin-data',{action:'save-main',media:mainMedia,appearance}));dirty=false;$('#main-save-state').textContent='Pages 배포 후 반영됩니다.';});
for(const el of document.querySelectorAll('[data-theme]'))el.onclick=()=>{appearance.theme=el.dataset.theme;renderAppearance();changed();};for(const el of document.querySelectorAll('[data-particles]'))el.onclick=()=>{appearance.particles=el.dataset.particles==='true';renderAppearance();changed();};
async function connect(token){
 const candidate=githubConnection(token);
 await candidate.verify();
 connection=candidate;
 try{
  await load();
  if(editorMode){
   const postId=params.get('post');
   const row=rows.find(row=>row.id===postId);
   if(postId&&!row)throw new Error('게시물이 삭제되었거나 이동했습니다.');
   openPost(row);
  }
 }catch(error){connection=null;throw error;}
 sessionToken=token;
 workspace();
}
$('#login-form').onsubmit=event=>{
 event.preventDefault();
 const field=event.target.elements.token;
 const token=field.value.trim();
 field.value='';
 task(()=>connect(token));
};
function logout(){
 for(const child of editors)child.postMessage({type:'eru-logout'},location.origin);
 connection=null;
 sessionToken=null;
 dirty=false;
 pendingUploads.clear();
 for(const url of previewURLs.values())URL.revokeObjectURL(url);
 previewURLs.clear();
 document.body.classList.remove('is-authenticated');
 $('#workspace').hidden=true;
 $('#login-panel').hidden=false;
 tell();
}
$('#logout').onclick=()=>{if(!dirty){logout();return;}const area=$('.top-actions');area.querySelector('.inline-confirm')?.remove();const prompt=document.createElement('div');prompt.className='inline-confirm';const text=document.createElement('span');text.textContent='저장하지 않은 변경사항이 있습니다.';prompt.append(text,button('로그아웃',logout),button('취소',()=>prompt.remove()));area.append(prompt);};
for(const el of document.querySelectorAll('[data-tab]'))el.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(other=>other.setAttribute('aria-pressed',String(other===el)));$('#posts-panel').hidden=el.dataset.tab!=='posts';$('#main-panel').hidden=el.dataset.tab!=='main';};

async function send(blob){
 const path=uploadPath(blob);
 pendingUploads.set(path,blob);
 previewURLs.set(path,URL.createObjectURL(blob));
 return path;
}
async function variant(bitmap,width){const scale=Math.min(1,width/bitmap.width);const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));if(!blob)throw new Error('이미지 변환 실패');return {blob,width:canvas.width,height:canvas.height};}
async function upload(file){
 if(file.size>200*1024*1024)throw new Error(`${file.name}: 200MB를 초과합니다.`);
 if(!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(file.type))throw new Error(`${file.name}: 지원하지 않는 형식입니다.`);
 if(file.type==='image/gif'||file.type.startsWith('video/')){const original=await send(file);return {src:original,original,type:file.type.startsWith('video/')?'video':'image',alt:file.name};}
 const bitmap=await createImageBitmap(file);
 try{
  let detail=await variant(bitmap,2400);const thumb=await variant(bitmap,640);
  if(detail.blob.size>maxUploadBytes)detail=await variant(bitmap,1600);
  if((detail.blob.size>maxUploadBytes||thumb.blob.size>maxUploadBytes))throw new Error('최적화 후에도 4MB를 초과합니다. 사진 크기를 줄여 다시 추가하세요.');
  const detailSrc=await send(detail.blob),thumbSrc=await send(thumb.blob);
  const original=file.size>maxUploadBytes?detailSrc:await send(file);
  return {src:detailSrc,detail:detailSrc,thumb:thumbSrc,medium:detailSrc,original,type:'image',alt:file.name,width:detail.width,height:detail.height,srcset:thumb.width===detail.width?`${detailSrc} ${detail.width}w`:`${thumbSrc} ${thumb.width}w, ${detailSrc} ${detail.width}w`};
 }finally{bitmap.close();}
}for(const kind of ['post','main'])$('#'+kind+'-files').onchange=event=>{const input=event.target,files=[...input.files];task(async()=>{const progress=$('#upload-progress');progress.hidden=false;try{for(let i=0;i<files.length;i++){progress.textContent=`${i+1} / ${files.length} 파일 준비 중`;const media=await upload(files[i]);(kind==='post'?postMedia:mainMedia).push(media);changed();renderMedia(kind);}}finally{progress.hidden=true;}}).finally(()=>input.value='');};
$('#post-form').addEventListener('input',changed);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
if(editorMode)$('#editor-close').onclick=()=>{if(busy){tell('파일 준비가 끝난 뒤 닫아 주세요.');return;}window.close();};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin)return;
 if(editorMode){
  if(!window.opener||event.source!==window.opener)return;
  if(event.data?.type==='eru-editor-session'&&!connection&&typeof event.data.token==='string'){
   task(()=>connect(event.data.token));
  }
  if(event.data?.type==='eru-logout')logout();
  return;
 }
 if(!editors.has(event.source)||!canSave())return;
 if(event.data?.type==='eru-editor-ready'){
  event.source.postMessage({type:'eru-editor-session',token:sessionToken},location.origin);
 }
 if(event.data?.type==='eru-post-saved'){
  if(dirty)tell('다른 창에서 게시물이 변경됐습니다. 현재 수정 중인 내용은 유지됩니다.');
  else task(()=>load());
 }
});
if(editorMode)window.opener?.postMessage({type:'eru-editor-ready'},location.origin);
disable();
