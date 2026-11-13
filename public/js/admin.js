import './password-visibility.mjs';
import {palette,paletteLabel} from './palette.js';
import {appearance as normalizeAppearance} from './appearance.mjs';
import {imageAssets} from './image-assets.js';
import {adminConnection, signIn, maxUploadBytes, uploadPath} from './admin-auth.mjs';
import {photos as seedPosts} from './photos.js';
import {mainMedia as seedMain} from './site-config.js';
const $=selector=>document.querySelector(selector),status=$('#admin-status');
const params=new URLSearchParams(location.search);
const sessionKey='eruarv:admin-session';
function readSession(){
 try{return sessionStorage.getItem(sessionKey);}
 catch{return null;}
}
function storeSession(token){
 try{
  if(token)sessionStorage.setItem(sessionKey,token);
  else sessionStorage.removeItem(sessionKey);
 }catch{}
}
let connection, rows=[],settings={},postMedia=[],mainMedia=[],busy=false,dirty=false,revision='';
let activePanel='posts';
let appearance=normalizeAppearance();
let statusFilter='';
const pendingUploads=new Map(), previewURLs=new Map();
function mediaPreview(path){
 if(previewURLs.has(path))return previewURLs.get(path);
 // Saved uploads are available in the commit before Pages publishes them.
 if(/^media\/uploads\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(path)
    && /^[a-f0-9]{40}$/.test(revision)){
  return `https://raw.githubusercontent.com/yungyung213/eruarv/${revision}/public/${path}`;
 }
 return path;
}
const thumbnail=media=>mediaPreview(media.thumb||(imageAssets[media.src]?media.src.replace(/\.png$/,'-thumb.jpg'):media.src));
function tell(text=''){
 const loginError=$('#login-error');
 if(!$('#login-panel').hidden){
  loginError.textContent=text;
  status.hidden=true;
  return;
 }
 loginError.textContent='';
 status.textContent=text;
 status.hidden=!text;
}
function changed(){dirty=true;$(activePanel==='main'?'#main-save-state':'#editor-save-state').textContent='변경됨';}
function canSave(){return !!connection;}
function disable(){for(const el of document.querySelectorAll('#publish,#save-draft,#save-main,#seed,#post-files,#main-files,[data-server-action]'))el.disabled=!canSave()||busy||el.dataset.boundary==='true';$('#login-button').disabled=busy;$('#logout').disabled=busy;
 for(const name of ['posts','categories','main','editor'])$('#'+name+'-panel').inert=busy;}
async function api(name,input){
 if(!connection || name!=='admin-data')throw new Error('어드민에 로그인하세요.');
 const result = input
  ? await connection.saveArchive(input,revision,pendingUploads)
  : await connection.readArchive();
 revision=result.revision;
 for(const [local, remote] of result.savedReplacements || []){
  if(previewURLs.has(local))previewURLs.set(remote,previewURLs.get(local));
 }
 for(const path of result.savedPaths || [])pendingUploads.delete(path);
 return result;
}
async function task(fn){if(busy)return false;busy=true;tell();disable();try{await fn();return true;}catch(error){tell(error.message);return false;}finally{busy=false;disable();}}
function button(label,fn,{server=false}={}){const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=fn;if(server){el.dataset.serverAction='';el.disabled=!canSave()||busy;}return el;}
function syncResult(data){if(data.posts)rows=data.posts;if(data.settings)settings=data.settings;}
function showPanel(panel,force=false){
 if(!force&&(busy||activePanel===panel))return false;
 if(!force&&dirty&&!window.confirm('저장하지 않은 변경사항을 버릴까요?'))return false;
 if(activePanel==='main'&&dirty){
  mainMedia=structuredClone(settings.mainMedia||seedMain);
  appearance=normalizeAppearance(settings.appearance);
  renderMedia('main');renderAppearance();$('#main-save-state').textContent='';
 }
 if(activePanel==='editor'&&dirty)postMedia=[];
 dirty=false;
 // Discard only uploads that are no longer referenced by either panel.
 const retained=new Set([...postMedia,...mainMedia].flatMap(media=>[media.src,media.thumb,media.original]));
 for(const path of pendingUploads.keys()){
  if(retained.has(path))continue;
  pendingUploads.delete(path);
  URL.revokeObjectURL(previewURLs.get(path));
  previewURLs.delete(path);
 }
 activePanel=panel;
 for(const name of ['posts','categories','main','editor'])$('#'+name+'-panel').hidden=name!==panel;
 for(const tab of document.querySelectorAll('[data-tab]'))tab.setAttribute('aria-pressed',String(tab.dataset.tab===(panel==='editor'?'posts':panel)));
 tell();
 window.scrollTo(0,0);
 return true;
}
function launchEditor(row,force=false){
 if(!showPanel('editor',force))return;
 openPost(row);
 $('#post-form').elements.title.focus({preventScroll:true});
}
function openPost(row){
 const post=row?.payload||{id:crypto.randomUUID(),date:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),genre:'',other:[],colors:[],images:[]};
 const f=$('#post-form').elements;for(const key of ['id','date','genre','thxTo','thxUrl','title','body'])f[key].value=post[key]||'';
 f.visibility.value=row?.status==='private'?'private':'published';
 f.other.value=(post.other||[]).join(', ');f.colors.value=(post.colors||[]).join(', ');postMedia=structuredClone(post.images);renderPickers();renderMedia('post');
 $('#editor-save-state').textContent='';$('#editor-title').textContent=row?'edit post':'new post';$('#post-state').textContent=row?.status==='published'?'공개':row?.status==='private'?'비공개':'임시 저장';
}
function list(){
  const filter=$('#post-category'),selected=filter.value;
 filter.replaceChildren(new Option('전체',''),...knownValues('genre').map(value=>new Option(value,value)));
 filter.value=[...filter.options].some(option=>option.value===selected)?selected:'';
 const target=$('#post-list');target.replaceChildren();
 const search=$('#post-search').value.trim().toLocaleLowerCase();
 const visible=rows.filter(row=>
  (!filter.value||row.payload.genre===filter.value)&&
  (!statusFilter||row.status===statusFilter)&&
  (!search||(row.payload.title||'').toLocaleLowerCase().includes(search))
 );
 renderLibrary();
 $('#post-count').textContent=`${visible.length} / ${rows.length} posts`;
 if(!visible.length)target.textContent='게시물이 없습니다.';
 for(const row of visible.sort((a,b)=>b.payload.date.localeCompare(a.payload.date))){
  const card=document.createElement('article');card.className='post-card';card.dataset.id=row.id;
  const open=button('',()=>launchEditor(row));open.className='post-open';open.setAttribute('aria-label',`${row.payload.title||row.payload.date} 게시물 편집`);
  const first=row.payload.images[0];if(first){const el=document.createElement(first.type==='video'?'video':'img');el.src=thumbnail(first);if(el.tagName==='VIDEO'){el.muted=true;el.preload='metadata';el.playsInline=true;if(first.poster)el.poster=mediaPreview(first.poster);}else{el.alt='';el.loading='lazy';}open.append(el);}
  const info=document.createElement('span');
  info.className='post-info';
  const title=document.createElement('strong');
  title.textContent=row.payload.title||row.payload.date;
  const state=document.createElement('small');
  const label=row.status==='published'?'공개':row.status==='private'?'비공개':'임시 저장';
  state.textContent=[row.payload.title&&row.payload.date,row.payload.genre,label].filter(Boolean).join(' · ');
  info.append(title,state);
  open.append(info);
  card.append(open);
  const actions=document.createElement('div');actions.className='post-actions';
  actions.append(button('편집',()=>launchEditor(row)));
  actions.append(button(row.status==='published'?'비공개':'공개',()=>task(async()=>{syncResult(await api('admin-data',{action:'set-post-status',id:row.id,status:row.status==='published'?'private':'published'}));list();renderCategories();}),{server:true}));
  actions.append(button('삭제',()=>{
   const confirm=document.createElement('div');confirm.className='inline-confirm';confirm.setAttribute('role','group');confirm.setAttribute('aria-label','게시물 삭제 확인');
   const text=document.createElement('span');text.textContent='이 게시물을 삭제할까요?';
   confirm.append(text,button('삭제',()=>task(async()=>{syncResult(await api('admin-data',{action:'delete-post',id:row.id}));list();renderCategories();}),{server:true}),button('취소',()=>confirm.remove()));
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
  const el=document.createElement(media.type==='video'?'video':'img');el.src=thumbnail(media);if(el.tagName==='VIDEO'){el.src=mediaPreview(media.src);el.controls=true;el.preload='metadata';el.playsInline=true;if(media.poster)el.poster=mediaPreview(media.poster);}else el.alt=media.alt||'';item.append(el);
  const label=document.createElement('label');label.textContent=`${index+1} · 설명`;const alt=document.createElement('input');alt.value=media.alt||'';alt.placeholder='이미지 설명';alt.oninput=()=>{media.alt=alt.value;changed();};label.append(alt);item.append(label);
  if(media.type==='video'){const label=document.createElement('label');label.textContent='포스터 URL';const input=document.createElement('input');input.type='url';input.value=media.poster||'';input.onchange=()=>{media.poster=input.value;changed();};label.append(input);item.append(label);}
  const actions=document.createElement('div');actions.className='media-actions';const handle=button('이동',()=>{});handle.className='drag-handle';handle.setAttribute('aria-label',`${index+1}번 미디어 순서 이동. 끌거나 좌우 방향키를 사용하세요.`);attachDrag(handle,item,kind,index);
  const back=button('앞으로',()=>moveMedia(kind,index,index-1));back.disabled=index===0;
  const next=button('뒤로',()=>moveMedia(kind,index,index+1));next.disabled=index===collection.length-1;
  actions.append(handle,back,next,button('제거',()=>{if(busy)return;collection.splice(index,1);changed();renderMedia(kind);}));item.append(actions);target.append(item);
 });
 if(kind==='main'){const summary=$('#main-file-summary');summary.replaceChildren();collection.forEach((media,index)=>{const li=document.createElement('li');li.textContent=media.alt||media.src.split('/').pop();summary.append(li);});}
}
function knownValues(group){const used=rows.flatMap(row=>group==='genre'?[row.payload.genre]:(row.payload.other||[]));return [...new Set([...(settings.taxonomy?.[group]||[]),...used].filter(Boolean))];}
function selectedCharacters(){return $('#post-form').elements.other.value.split(',').map(v=>v.trim()).filter(Boolean);}
function manageTaxonomy(target,group,label){
 const details=document.createElement('details');details.className='taxonomy-manager';details.open=true;const summary=document.createElement('summary');summary.textContent=label+' 관리';details.append(summary);
 const note=document.createElement('p');note.textContent='이름 변경·삭제는 기존 게시물에도 함께 반영됩니다.';details.append(note);
 const values=knownValues(group);
 for(const [index,value] of values.entries()){
  const number=document.createElement('span');
  number.className='taxonomy-position';
  number.textContent=String(index+1);
  const row=document.createElement('div');row.className='taxonomy-row';const name=document.createElement('span');name.textContent=group==='genre'?`${value} · ${rows.filter(post=>post.payload.genre===value).length}개`:value;
  const earlier=button('↑',()=>moveTaxonomy(group,values,index,index-1),{server:true});
  const later=button('↓',()=>moveTaxonomy(group,values,index,index+1),{server:true});
  earlier.setAttribute('aria-label',value+' 위로 이동');
  later.setAttribute('aria-label',value+' 아래로 이동');
  earlier.dataset.boundary=String(index===0);
  later.dataset.boundary=String(index===values.length-1);
  earlier.disabled=index===0;
  later.disabled=index===values.length-1;
  row.append(number,name,earlier,later,button('수정',()=>{const edit=document.createElement('div');edit.className='taxonomy-edit';const input=document.createElement('input');input.value=value;input.maxLength=100;input.setAttribute('aria-label',value+' 새 이름');
   edit.append(input,button('저장',()=>changeTaxonomy(group,'rename-taxonomy',value,input.value),{server:true}),button('취소',()=>edit.remove()));row.querySelector('.taxonomy-edit')?.remove();row.append(edit);input.focus();
  },{server:true}),button('삭제',()=>{const confirm=document.createElement('div');confirm.className='inline-confirm';const text=document.createElement('span');text.textContent=group==='genre'?'카테고리를 삭제하면 연결된 게시물은 분류 없음으로 표시됩니다.':'이 구분값을 삭제할까요?';confirm.append(text,button('삭제',()=>changeTaxonomy(group,'delete-taxonomy',value),{server:true}),button('취소',()=>confirm.remove()));row.querySelector('.inline-confirm')?.remove();row.append(confirm);},{server:true}));details.append(row);
 }
 target.append(details);
}
async function changeTaxonomy(group,action,value,replacement){await task(async()=>{
 const next=(replacement||'').trim();syncResult(await api('admin-data',{action,group,value,replacement:next}));const fields=$('#post-form').elements;
 if(group==='genre'&&fields.genre.value===value)fields.genre.value=action==='rename-taxonomy'?next:'';
 if(group==='other')fields.other.value=[...new Set(selectedCharacters().flatMap(v=>v===value?(action==='rename-taxonomy'?[next]:[]):[v]))].join(', ');
 renderPickers();list();renderCategories();
 tell(action==='rename-taxonomy'?'이름을 변경했습니다.':'삭제했습니다.');
 });}
function moveTaxonomy(group,values,from,to){
 if(to<0||to>=values.length)return;
 const order=[...values];
 [order[from],order[to]]=[order[to],order[from]];
 return task(async()=>{
  syncResult(await api('admin-data',{action:'reorder-taxonomy',group,values:order}));
  renderCategories();
  renderPickers();
  tell('표시 순서를 저장했습니다.');
 });
}

function renderCategories(){
 const target=$('#category-list');
 target.replaceChildren();
 manageTaxonomy(target,'genre','카테고리');
 manageTaxonomy(target,'other','캐릭터');
}

$('#post-category').onchange=list;
$('#post-search').oninput=list;
for(const filter of document.querySelectorAll('[data-status-filter]')){
 filter.onclick=()=>{
  statusFilter=filter.dataset.statusFilter;
  for(const button of document.querySelectorAll('[data-status-filter]')){
   button.setAttribute('aria-pressed',String(button===filter));
  }
  list();
 };
}

for(const [selector,group] of [['#new-category','genre'],['#new-character','other']]){
 $(selector).onsubmit=event=>{
  event.preventDefault();
  const input=event.target.elements.value;
  task(async()=>{
   const value=input.value.trim();
   if(knownValues(group).includes(value))throw new Error('이미 있는 이름입니다.');
   syncResult(await api('admin-data',{action:'save-taxonomy',group,value}));
   input.value='';
   list();
   renderCategories();
  });
 };
}

const libraryPost=$('#main-library-post');
const libraryImage=$('#main-library-image');
const libraryAdd=$('#add-library-image');
function availableLibraryImages(){
 return rows.find(row=>row.id===libraryPost.value)?.payload.images.filter(media=>media.type!=='video')||[];
}
function renderLibraryImages(){
 const photos=availableLibraryImages();
 libraryImage.replaceChildren(...photos.map((media,index)=>new Option(media.alt||`사진 ${index+1}`,String(index))));
 libraryImage.disabled=!photos.length;
 libraryAdd.disabled=!photos.length;
}
function renderLibrary(){
 const selected=libraryPost.value;
 const eligible=rows.filter(row=>row.status==='published'&&row.payload.images.some(media=>media.type!=='video'));
 libraryPost.replaceChildren(new Option('게시물 선택',''),...eligible.map(row=>new Option(row.payload.title||row.payload.date,row.id)));
 if(eligible.some(row=>row.id===selected))libraryPost.value=selected;
 renderLibraryImages();
}
libraryPost.onchange=renderLibraryImages;
libraryAdd.onclick=()=>{
 const media=availableLibraryImages()[Number(libraryImage.value)];
 if(!media||busy)return;
 if(mainMedia.some(slide=>slide.src===media.src)){
  tell('이미 메인 슬라이드에 있는 사진입니다.');
  return;
 }
 if(mainMedia.length>=20){
  tell('메인 슬라이드는 20개까지 등록할 수 있습니다.');
  return;
 }
 tell();
 mainMedia.push(structuredClone(media));
 changed();
 renderMedia('main');
 $('#main-media').lastElementChild?.scrollIntoView({block:'nearest',inline:'nearest'});
};

function renderPickers(){
 const fields=$('#post-form').elements;
 for(const [group,label] of [['genre','카테고리'],['other','캐릭터']]){
  const target=$('#'+group+'-picker');target.replaceChildren();const selected=group==='genre'?[fields.genre.value]:selectedCharacters();
  const select=document.createElement('select');select.setAttribute('aria-label',label+' 선택');const values=[['__new__','+ 새로 만들기'],['',group==='genre'?'카테고리 선택':'캐릭터 추가 선택'],...knownValues(group).map(value=>[value,(selected.includes(value)&&group==='other'?'✓ ':'')+value])];
  if(group==='genre'&&fields.genre.value&&!values.some(([v])=>v===fields.genre.value))values.push([fields.genre.value,fields.genre.value]);
  for(const [value,text] of values){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=group==='genre'?fields.genre.value:'';target.append(select);
  const create=document.createElement('div');create.className='new-value';create.hidden=true;const input=document.createElement('input');input.placeholder='새 '+label;input.maxLength=100;input.setAttribute('aria-label','새 '+label);
  const add=button('추가',()=>task(async()=>{const value=input.value.trim();if(!value||value.includes(',')||value==='__new__')throw new Error('구분값은 쉼표 없이 입력하세요.');syncResult(await api('admin-data',{action:'save-taxonomy',group,value}));if(group==='genre')fields.genre.value=value;else fields.other.value=[...new Set([...selected,value])].join(', ');changed();renderPickers();list();renderCategories();}),{server:true});
  create.append(input,add,button('취소',()=>create.hidden=true));target.append(create);
  select.onchange=()=>{if(select.value==='__new__'){create.hidden=false;input.focus();select.value=group==='genre'?fields.genre.value:'';return;}changed();if(group==='genre')fields.genre.value=select.value;else if(select.value)fields.other.value=[...new Set([...selected,select.value])].join(', ');renderPickers();};
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();add.click();}};
  if(group==='other'){const tags=document.createElement('div');tags.className='selected-values';for(const value of selected)tags.append(button(value+' ×',()=>{fields.other.value=selected.filter(v=>v!==value).join(', ');changed();renderPickers();}));target.append(tags);}
 }
 $('#known-credits')?.remove();const credits=document.createElement('datalist');credits.id='known-credits';for(const value of new Set(rows.map(row=>row.payload.thxTo).filter(Boolean))){const option=document.createElement('option');option.value=value;credits.append(option);}fields.thxTo.setAttribute('list','known-credits');$('#post-form').append(credits);renderPalette();
}
function renderPalette(){
 const field=$('#post-form').elements.colors,target=$('#palette-picker');target.replaceChildren();const selected=field.value.split(',').map(v=>v.trim()).filter(Boolean);
 for(const [colorIndex,color] of palette.entries()){const el=button('',()=>{field.value=(selected.includes(color.color)?selected.filter(v=>v!==color.color):[...selected,color.color]).join(', ');changed();renderPalette();});el.className='palette-option';const name=['Red','Orange','Yellow','Green','Blue','Navy','Violet','White','Gray','Black'][colorIndex];el.title=name;el.setAttribute('aria-label',name);el.setAttribute('aria-pressed',String(selected.includes(color.color)));const dot=document.createElement('span');dot.className='palette-dot';dot.style.background=color.color;dot.setAttribute('aria-hidden','true');el.append(dot);target.append(el);}
 const legacy=$('#legacy-palette');legacy.replaceChildren();for(const color of selected.filter(v=>!palette.some(item=>item.color===v))){const el=button('×',()=>{field.value=selected.filter(v=>v!==color).join(', ');changed();renderPalette();});el.setAttribute('aria-label',paletteLabel(color)+' 제거');legacy.append(el);}
}
function collect(){const f=$('#post-form').elements;return {id:f.id.value,date:f.date.value,title:f.title.value.trim(),body:f.body.value.trim(),genre:f.genre.value.trim(),other:selectedCharacters(),colors:f.colors.value.split(',').map(v=>v.trim()).filter(Boolean),thxTo:f.thxTo.value.trim(),thxUrl:f.thxUrl.value.trim(),images:postMedia};}
function renderAppearance(){
 for(const el of document.querySelectorAll('[data-rollover]'))el.setAttribute('aria-pressed',String((el.dataset.rollover==='true')===appearance.rollover));for(const el of document.querySelectorAll('[data-theme]'))el.setAttribute('aria-pressed',String(el.dataset.theme===appearance.theme));for(const el of document.querySelectorAll('[data-particles]'))el.setAttribute('aria-pressed',String((el.dataset.particles==='true')===appearance.particles));}
async function load(){const data=await api('admin-data');syncResult(data);mainMedia=structuredClone(settings.mainMedia||seedMain);appearance=normalizeAppearance(settings.appearance);list();renderCategories();renderMedia('main');renderAppearance();renderPickers();$('#seed').hidden=!!settings.initialized;}
function workspace(){document.body.classList.add('is-authenticated');$('#login-panel').hidden=true;$('#workspace').hidden=false;showPanel('posts',true);disable();}
async function save(publish){
 if(!canSave()||busy)return;
 const feedback=$('#editor-save-state');
 await task(async()=>{
  const post=collect();
  try{
   if(publish&&!post.images.length&&(!post.title||!post.body)){
    throw new Error('미디어 없이 게시하려면 제목과 본문을 입력하세요.');
   }
   feedback.textContent=publish?'게시 중…':'임시 저장 중…';
   const state=publish?$('#post-form').elements.visibility.value:'draft';
   const data=await api('admin-data',{action:'save-post',post,status:state});
   syncResult(data);
   postMedia=structuredClone(rows.find(row=>row.id===post.id).payload.images);
   renderMedia('post');
   dirty=false;
   $('#post-state').textContent=state==='published'?'공개':state==='private'?'비공개':'임시 저장';
   feedback.textContent=state==='published'?'게시 완료 · 갤러리는 Pages 배포 후 갱신됩니다.':state==='private'?'비공개 저장 완료':'임시 저장 완료';
   list();renderCategories();
  }catch(error){
   feedback.textContent=error.message;
  }
 });
}
$('#post-form').onsubmit=event=>{event.preventDefault();save(true);};$('#save-draft').onclick=()=>save(false);$('#new-post').onclick=()=>launchEditor();
$('#seed').onclick=()=>task(async()=>{await api('admin-data',{action:'seed',posts:seedPosts,media:seedMain});await load();});
$('#save-main').onclick=()=>task(async()=>{syncResult(await api('admin-data',{action:'save-main',media:mainMedia,appearance}));mainMedia=structuredClone(settings.mainMedia);renderMedia('main');dirty=false;$('#main-save-state').textContent='Pages 배포 후 반영됩니다.';});
for(const el of document.querySelectorAll('[data-theme]'))el.onclick=()=>{appearance.theme=el.dataset.theme;renderAppearance();changed();};for(const el of document.querySelectorAll('[data-particles]'))el.onclick=()=>{appearance.particles=el.dataset.particles==='true';renderAppearance();changed();};
for(const el of document.querySelectorAll('[data-rollover]'))el.onclick=()=>{
 appearance.rollover=el.dataset.rollover==='true';
 renderAppearance();
 changed();
};

const postPreview=$('#post-preview');
$('#close-post-preview').onclick=()=>postPreview.close();
postPreview.addEventListener('close',()=>postPreview.querySelectorAll('video').forEach(video=>video.pause()));
$('#preview-post').onclick=()=>{
 const post=collect();
 const content=$('#post-preview-content');
 content.replaceChildren();
 $('#post-preview-title').textContent=post.title||'미리보기';
 if(post.body){
  const body=document.createElement('p');
  body.textContent=post.body;
  content.append(body);
 }
 for(const media of post.body?post.images.slice(1):post.images){
  const element=document.createElement(media.type==='video'?'video':'img');
  element.src=mediaPreview(media.detail||media.src);
  if(element.tagName==='VIDEO'){
   element.controls=true;
   element.playsInline=true;
  }else element.alt=media.alt||'';
  content.append(element);
 }
 postPreview.showModal();
};

async function connect(token){
 const candidate=adminConnection(token);
 connection=candidate;
 try{await load();}catch(error){connection=null;throw error;}
 storeSession(token);
 workspace();
 if(params.get('editor')==='1'){
  const postId=params.get('post');
  const row=rows.find(row=>row.id===postId);
  if(postId&&!row)tell('게시물이 삭제되었거나 이동했습니다.');
  else launchEditor(row,true);
  history.replaceState(null,'',location.pathname);
  params.delete('editor');
 }
}
$('#login-form').onsubmit=event=>{
 event.preventDefault();
 const fields=event.target.elements;
 const username=fields.username.value.trim();
 const password=fields.password.value;
 task(async()=>{
  let accessToken;
  try { accessToken=await signIn(username,password); }
  catch(error){
   if(error.status===401)throw new Error('Check your username and password, then try again.');
   if(error.status===429)throw new Error('Too many attempts. Wait a moment, then try again.');
   if(error.status===403)throw new Error('This account does not have admin access.');
   throw new Error('Sign-in is temporarily unavailable. Try again in a moment.');
  }
  fields.password.value='';
  try { await connect(accessToken); }
  catch { throw new Error('You signed in, but the archive could not load. Try again in a moment.'); }
 });
};
function logout(){
 storeSession(null);
 connection=null;
 dirty=false;
 pendingUploads.clear();
 for(const url of previewURLs.values())URL.revokeObjectURL(url);
 previewURLs.clear();
 document.body.classList.remove('is-authenticated');
 $('#workspace').hidden=true;
 $('#login-panel').hidden=false;
 tell();
}
$('#logout').onclick=()=>{if(busy)return;if(!dirty){logout();return;}const area=$('.top-actions');area.querySelector('.inline-confirm')?.remove();const prompt=document.createElement('div');prompt.className='inline-confirm';const text=document.createElement('span');text.textContent='저장하지 않은 변경사항이 있습니다.';prompt.append(text,button('로그아웃',logout),button('취소',()=>prompt.remove()));area.append(prompt);};
for(const tab of document.querySelectorAll('[data-tab]'))tab.onclick=()=>showPanel(tab.dataset.tab);
$('#editor-close').onclick=()=>{if(showPanel('posts'))$('#new-post').focus({preventScroll:true});};

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
}
for(const kind of ['post','main'])$('#'+kind+'-files').onchange=event=>{const input=event.target,files=[...input.files];task(async()=>{const progress=$('#upload-progress');progress.hidden=false;try{for(let i=0;i<files.length;i++){progress.textContent=`${i+1} / ${files.length} 파일 준비 중`;const media=await upload(files[i]);(kind==='post'?postMedia:mainMedia).push(media);changed();renderMedia(kind);}}finally{progress.hidden=true;}}).finally(()=>input.value='');};
for(const key of ['title','body','date','thxTo','thxUrl','visibility'])$('#post-form').elements[key].addEventListener('input',changed);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
disable();

const savedSession=readSession();
if(savedSession){
 task(async()=>{
  try{await connect(savedSession);}
  catch(error){
   if(error.status===401||error.status===403){
    storeSession(null);
    throw new Error('Your session expired. Please sign in again.');
   }
   throw new Error('Could not restore your session. Reload to retry or sign in again.');
  }
 });
}
