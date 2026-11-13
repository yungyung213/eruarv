import {setTitle} from './post-title.mjs';
import {postCategories} from './post-categories.mjs';
import './password-visibility.mjs';
import {palette,paletteLabel} from './palette.js';
import {appearance as normalizeAppearance} from './appearance.mjs';
import {imageAssets} from './image-assets.js';
import {adminConnection, signIn, maxUploadBytes, uploadPath} from './admin-auth.mjs';
import {photos as seedPosts} from './photos.js';
import {mainMedia as seedMain} from './site-config.js';
const $=selector=>document.querySelector(selector),status=$('#admin-status');
const params=new URLSearchParams(location.search);
const themeButton=$('#admin-theme');
function setAdminTheme(light){
 document.documentElement.dataset.adminTheme=light?'light':'dark';
 themeButton.setAttribute('aria-pressed',String(light));
 const label=light?'다크 모드':'라이트 모드';
 themeButton.setAttribute('aria-label',label);
 themeButton.title=label;
 themeButton.querySelector('[data-icon=sun]').hidden=light;
 themeButton.querySelector('[data-icon=moon]').hidden=!light;
}
try{setAdminTheme(localStorage.getItem('eru-admin-theme')!=='dark');}catch{setAdminTheme(true);}
themeButton.onclick=()=>{
 const light=themeButton.getAttribute('aria-pressed')!=='true';
 setAdminTheme(light);
 try{localStorage.setItem('eru-admin-theme',light?'light':'dark');}catch{}
};
for(const button of document.querySelectorAll('[data-content-view]')){
 button.onclick=()=>{
  $('#post-list').dataset.view=button.dataset.contentView;
  $('#post-list-header').hidden=button.dataset.contentView!=='list';
  for(const filter of columnFilters)filter.open=false;
  for(const control of document.querySelectorAll('[data-content-view]'))control.setAttribute('aria-pressed',String(button===control));
 };
}
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
let supportsWriting=false;
let supportsTitleOnly=false;
let appearance=normalizeAppearance();
const columnFilters=[...document.querySelectorAll('[data-column-filter]')];
const activeFilters={category:new Set(),character:new Set(),status:new Set()};
const statuses=[['published','Public'],['draft','Draft'],['private','Private']];

function applyFilters(){
 visiblePostLimit=postBatchSize;
 syncFilterControls();
 list({refreshCategories:false});
}

function syncFilterControls(){
 for(const [key,selector] of [['category','#post-category button'],['status','[data-status-filter]']]){
  const selected=activeFilters[key];
  for(const control of document.querySelectorAll(selector)){
   const value=control.dataset.filterValue??control.dataset.statusFilter;
   control.setAttribute('aria-pressed',String(value?selected.size===1&&selected.has(value):selected.size===0));
  }
 }
 for(const filter of columnFilters){
  const selected=activeFilters[filter.dataset.columnFilter];
  filter.classList.toggle('is-filtered',selected.size>0);
  for(const input of filter.querySelectorAll('input')){
   input.checked=selected.size===0||selected.has(input.value);
  }
 }
}

function renderColumnFilters(categories){
 const choices={
  category:[...categories.map(value=>[value,value]),['','미분류']],
  character:[...knownValues('other').map(value=>[value,value]),['','미지정']],
  status:statuses
 };
 for(const filter of columnFilters){
  const key=filter.dataset.columnFilter, values=choices[key], selected=activeFilters[key];
  const panel=filter.querySelector('.column-filter-values');
  for(const value of selected)if(value!==null&&!values.some(([option])=>option===value))selected.delete(value);
  const all=button('All',()=>{selected.clear();applyFilters();});
  panel.replaceChildren(all);
  for(const [value,label] of values){
   const option=document.createElement('label');
   const input=document.createElement('input');
   input.type='checkbox';
   input.value=value;
   input.onchange=()=>{
    const checked=[...panel.querySelectorAll('input:checked')].map(box=>box.value);
    selected.clear();
    for(const item of checked)selected.add(item);
    if(checked.length===values.length)selected.clear();
    // An explicit empty selection matches no rows until All or a value is selected.
    if(!checked.length)selected.add(null);
    applyFilters();
   };
   option.append(input,label);
   panel.append(option);
  }
 }
 syncFilterControls();
}

for(const filter of columnFilters){
 filter.querySelector('summary').onclick=()=>{
  for(const other of columnFilters)if(other!==filter)other.open=false;
 };
 filter.onkeydown=event=>{
  if(event.key!=='Escape'||!filter.open)return;
  filter.open=false;
  filter.querySelector('summary').focus();
 };
}
document.addEventListener('click',event=>{
 for(const filter of columnFilters)if(!filter.contains(event.target))filter.open=false;
});
const postBatchSize=50;
let visiblePostLimit=postBatchSize;
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
function tell(text='',{progress=false}={}){
 const loginError=$('#login-error');
 if(!$('#login-panel').hidden){
  loginError.textContent=text;
  status.hidden=true;
  return;
 }
 loginError.textContent='';
 status.textContent=text;
 status.dataset.progress=String(progress);
 status.hidden=!text;
}
function changed(){
 dirty=true;
 if(activePanel==='editor')$('#editor-save-state').textContent='';
}
function canSave(){return !!connection;}
function disable(){for(const el of document.querySelectorAll('#publish,#save-draft,#save-main,#seed,#post-files,#main-files,[data-server-action]'))el.disabled=!canSave()||busy||el.dataset.boundary==='true';$('#login-button').disabled=busy;$('#logout').disabled=busy;
 for(const name of ['posts','categories','main','editor'])$('#'+name+'-panel').inert=busy;}
async function api(name,input){
 if(!connection || name!=='admin-data')throw new Error('어드민에 로그인하세요.');
 const result = input
  ? await connection.saveArchive(input,revision,pendingUploads)
  : await connection.readArchive();
 revision=result.revision;
 if(!input){
  supportsWriting=result.supportsWriting===true;
  supportsTitleOnly=result.supportsTitleOnly===true;
 }
 for(const [local, remote] of result.savedReplacements || []){
  if(previewURLs.has(local))previewURLs.set(remote,previewURLs.get(local));
 }
 for(const path of result.savedPaths || [])pendingUploads.delete(path);
 return result;
}
async function task(fn){if(busy)return false;busy=true;tell();disable();try{await fn();return true;}catch(error){tell(error.message);return false;}finally{busy=false;disable();}}
function button(label,fn,{server=false}={}){const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=fn;if(server){el.dataset.serverAction='';el.disabled=!canSave()||busy;}return el;}
const actionIcons={
 edit:'M4 20l4-.8L20 7l-3-3L5 16l-1 4ZM15 6l3 3',
 hide:'M3 3l18 18M10 10a3 3 0 0 0 4 4M6 6c-2 2-4 6-4 6s4 7 10 7c2 0 4-.8 5.5-2M9 5c1-.5 2-.5 3-.5 6 0 10 7.5 10 7.5s-1 2-2 3',
 show:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 close:'M5 5l14 14M19 5 5 19'
};

function postAction(label,icon,handler,options){
 const control=button('',handler,options);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');
 svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS(svg.namespaceURI,'path');
 path.setAttribute('d',actionIcons[icon]);
 svg.append(path);
 const text=document.createElement('span');
 text.textContent=label;
 control.classList.add('post-action');
 control.setAttribute('aria-label',label);
 control.title=label;
 control.append(svg,text);
 return control;
}

function deleteButton(handler,options){
 const control=postAction('삭제','close',handler,options);
 control.classList.add('delete-action');
 return control;
}

function syncResult(data){if(data.posts)rows=data.posts;if(data.settings)settings=data.settings;}
function showPanel(panel,force=false){
 if(!force&&(busy||activePanel===panel))return false;
 if(!force&&dirty&&!window.confirm('저장하지 않은 변경사항을 버릴까요?'))return false;
 if(activePanel==='main'&&dirty){
  mainMedia=structuredClone(settings.mainMedia||seedMain);
  appearance=normalizeAppearance(settings.appearance);
  renderMedia('main');renderAppearance();
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
 const title=$('#workspace-title');
 title.textContent={posts:'contents',categories:'category',main:'main',editor:'edit post'}[panel];
 $('.admin-top + .tabs').hidden=panel==='editor';
 $('#editor-nav').hidden=panel!=='editor';
 for(const name of ['posts','categories','main','editor'])$('#'+name+'-panel').hidden=name!==panel;
 if(panel==='main'||panel==='editor')updateRail[panel==='main'?'main':'post']();
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
 const f=$('#post-form').elements;for(const key of ['id','date','thxTo','thxUrl','title','body'])f[key].value=post[key]||'';
 f.genre.value=postCategories(post).join(', ');
 f.visibility.value=row?.status==='private'?'private':'published';
 f.other.value=(post.other||[]).join(', ');f.colors.value=(post.colors||[]).join(', ');postMedia=structuredClone(post.images);renderPickers();renderMedia('post');
 $('#editor-save-state').textContent='';$('#workspace-title').textContent=row?'edit post':'new post';
}
function list({refreshCategories=true}={}){
 if(refreshCategories){
  const filter=$('#post-category');
  const categories=knownValues('genre');
  const label=document.createElement('span');
  label.textContent='Category';
  filter.replaceChildren(label);
  for(const value of ['',...categories]){
   const control=button(value||'All',()=>{
    activeFilters.category.clear();
    if(value)activeFilters.category.add(value);
    applyFilters();
   });
   control.dataset.filterValue=value;
   filter.append(control);
  }
  renderColumnFilters(categories);
 }
 const target=$('#post-list');target.replaceChildren();
 const search=$('#post-search').value.trim().toLocaleLowerCase();
 const matches=(key,values)=>!activeFilters[key].size||(values.length?values:['']).some(value=>activeFilters[key].has(value));
 const visible=rows.filter(row=>
  matches('category',postCategories(row.payload))&&
  matches('character',row.payload.other||[])&&
  matches('status',[row.status])&&
  (!search||(row.payload.title||'').toLocaleLowerCase().includes(search))
 );
 if(!visible.length)target.textContent='게시물이 없습니다.';
 $('#post-more').hidden=visible.length<=visiblePostLimit;
 for(const [index,row] of visible.sort((a,b)=>b.payload.date.localeCompare(a.payload.date)).slice(0,visiblePostLimit).entries()){
  const card=document.createElement('article');card.className='post-card';card.dataset.id=row.id;
  const open=button('',()=>launchEditor(row));open.className='post-open';open.setAttribute('aria-label',`${row.payload.title||row.payload.date} 게시물 편집`);
  const cover=document.createElement('span');cover.className='post-cover';
  const first=row.payload.images[0];if(first){const el=document.createElement(first.type==='video'?'video':'img');el.src=thumbnail(first);if(el.tagName==='VIDEO'){el.muted=true;el.preload='metadata';el.playsInline=true;if(first.poster)el.poster=mediaPreview(first.poster);}else{el.alt='';el.loading='lazy';}cover.append(el);}
  const number=document.createElement('span');
  number.className='post-number';
  number.textContent=String(index+1);
  open.append(number,cover);
  const info=document.createElement('span');
  info.className='post-info';
  const date=document.createElement('time');
  date.dateTime=row.payload.date;
  date.textContent=row.payload.date;
  date.className='post-date';
  const characters=document.createElement('small');
  characters.className='post-characters';
  characters.textContent=(row.payload.other||[]).join(' / ');
  const categories=document.createElement('small');
  categories.className='post-categories';
  categories.textContent=postCategories(row.payload).join(' / ');
  const state=document.createElement('small');
  state.className='post-state';
  const label=row.status==='published'?'공개':row.status==='private'?'비공개':'임시 저장';
  state.textContent=label;
  info.append(date,categories,characters,state);
  const title=document.createElement('span');
  title.className='post-title';
  title.textContent=row.payload.title||'';
  open.append(info,title);
  card.append(open);
  const actions=document.createElement('div');actions.className='post-actions';
  actions.append(postAction('편집','edit',()=>launchEditor(row)));
  actions.append(postAction(row.status==='published'?'비공개':'공개',row.status==='published'?'hide':'show',()=>task(async()=>{syncResult(await api('admin-data',{action:'set-post-status',id:row.id,status:row.status==='published'?'private':'published'}));list();renderCategories();}),{server:true}));
  actions.append(deleteButton(()=>{
   const confirm=document.createElement('div');confirm.className='inline-confirm';confirm.setAttribute('role','group');confirm.setAttribute('aria-label','게시물 삭제 확인');
   const text=document.createElement('span');text.textContent='이 게시물을 삭제할까요?';
   confirm.append(text,deleteButton(()=>task(async()=>{syncResult(await api('admin-data',{action:'delete-post',id:row.id}));list();renderCategories();}),{server:true}),button('취소',()=>confirm.remove()));
   card.querySelector('.inline-confirm')?.remove();card.append(confirm);
  },{server:true}));card.append(actions);target.append(card);
 }
}
function moveMedia(kind,from,to){
 const collection=kind==='post'?postMedia:mainMedia;
 if(busy||from===to||to<0||to>=collection.length)return;
 const [media]=collection.splice(from,1);
 collection.splice(to,0,media);
 changed();
 renderMedia(kind);
 const moved=$('#'+kind+'-media').children[to]?.querySelector('.sortable-media');
 moved?.scrollIntoView({block:'nearest',inline:'nearest'});
 moved?.focus({preventScroll:true});
}

function makeSortable(surface,item,kind,index){
 const track=item.parentElement;
 let pointerId=null;
 let target=null;
 surface.draggable=false;
 surface.tabIndex=0;
 surface.classList.add('sortable-media');
 surface.setAttribute('aria-label',index+1+'번 미디어. '+(surface.tagName==='VIDEO'?'Alt와 방향키':'방향키')+'로 순서 변경');
 surface.onpointerdown=event=>{
  if(event.button!==0||!event.isPrimary||busy)return;
  if(surface.tagName==='VIDEO'&&event.clientY>surface.getBoundingClientRect().bottom-46)return;
  event.preventDefault();
  pointerId=event.pointerId;
  surface.setPointerCapture(pointerId);
  item.classList.add('is-dragging');
 };
 surface.onpointermove=event=>{
  if(pointerId!==event.pointerId)return;
  target?.classList.remove('drop-target');
  const bounds=track.getBoundingClientRect();
  if(event.clientX>bounds.right-36)track.scrollLeft+=16;
  else if(event.clientX<bounds.left+36)track.scrollLeft-=16;
  const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('.media-item');
  target=hit?.parentElement===track&&hit!==item?hit:null;
  target?.classList.add('drop-target');
  if(event.clientY>innerHeight-65)window.scrollBy(0,16);
  else if(event.clientY<65)window.scrollBy(0,-16);
 };
 function finish(event){
  if(pointerId!==event.pointerId)return;
  const destination=target?Number(target.dataset.index):index;
  pointerId=null;
  target?.classList.remove('drop-target');
  target=null;
  item.classList.remove('is-dragging');
  if(event.type==='pointerup')moveMedia(kind,index,destination);
 }
 surface.onpointerup=finish;
 surface.onpointercancel=finish;
 surface.onlostpointercapture=finish;
 surface.onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  if(surface.tagName==='VIDEO'&&!event.altKey)return;
  event.preventDefault();
  const earlier=event.key==='ArrowLeft'||event.key==='ArrowUp';
  moveMedia(kind,index,index+(earlier?-1:1));
 };
}

function setupSlideRail(rail){
 const [previous,track,next]=rail.children;
 function update(){
  previous.disabled=track.scrollLeft<=1;
  next.disabled=track.scrollWidth-track.clientWidth-track.scrollLeft<=1;
 }
 track.addEventListener('scroll',update,{passive:true});
 new ResizeObserver(update).observe(track);
 for(const control of [previous,next]){
  control.onclick=()=>{
   const card=track.firstElementChild;
   if(!card)return;
   const gap=parseFloat(getComputedStyle(track).columnGap)||0;
   track.scrollBy({
    left:Number(control.dataset.slideScroll)*(card.getBoundingClientRect().width+gap),
    behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'
   });
  };
 }
 return update;
}

const updateRail=Object.fromEntries(['main','post'].map(kind=>[kind,setupSlideRail($('#'+kind+'-media').parentElement)]));

function renderMedia(kind){
 const collection=kind==='post'?postMedia:mainMedia,target=$('#'+kind+'-media');target.replaceChildren();
 collection.forEach((media,index)=>{
  const item=document.createElement('article');item.className='media-item';item.dataset.index=index;
  const el=document.createElement(media.type==='video'?'video':'img');el.src=thumbnail(media);if(el.tagName==='VIDEO'){el.src=mediaPreview(media.src);el.controls=true;el.preload='metadata';el.playsInline=true;if(media.poster)el.poster=mediaPreview(media.poster);}else el.alt=media.alt||'';
  const remove=deleteButton(()=>{
   if(busy)return;
   collection.splice(index,1);
   changed();
   renderMedia(kind);
  });
  const frame=document.createElement('div');
  frame.className='media-edit-frame';
  frame.append(el,remove);
  item.append(frame);
  target.append(item);
  makeSortable(el,item,kind,index);
 });
 updateRail[kind]();
}
function knownValues(group){const used=rows.flatMap(row=>group==='genre'?postCategories(row.payload):(row.payload.other||[]));return [...new Set([...(settings.taxonomy?.[group]||[]),...used].filter(Boolean))];}
function selectedValues(group){return $('#post-form').elements[group].value.split(',').map(value=>value.trim()).filter(Boolean);}
function manageTaxonomy(target,group,label){
 const details=document.createElement('section');
 details.className='taxonomy-manager admin-panel';
 const heading=document.createElement('h3');
 heading.className='admin-subtitle';
 heading.lang='en';
 heading.textContent=label;
 const form=document.createElement('form');
 const input=document.createElement('input');
 input.placeholder=group==='genre'?'새 카테고리 이름':'새 캐릭터 이름';
 input.setAttribute('aria-label',input.placeholder);
 input.maxLength=100;
 input.required=true;
 const add=document.createElement('button');
 add.type='submit';
 add.textContent='+ add';
 add.className='outlined-action';
 add.dataset.serverAction='';
 form.className='taxonomy-add';
 form.append(input,add);
 form.onsubmit=event=>{
  event.preventDefault();
  task(async()=>{
   const value=input.value.trim();
   if(knownValues(group).includes(value))throw new Error('이미 있는 이름입니다.');
   syncResult(await api('admin-data',{action:'save-taxonomy',group,value}));
   list();
   renderCategories();
  });
 };
 details.append(heading,form);
 const values=knownValues(group);
 for(const [index,value] of values.entries()){
  const number=document.createElement('span');
  number.className='taxonomy-position';
  number.textContent=String(index+1);
  const row=document.createElement('div');row.className='taxonomy-row';const name=document.createElement('span');name.textContent=group==='genre'?`${value} · ${rows.filter(post=>postCategories(post.payload).includes(value)).length}개`:value;
  const earlier=button('↑',()=>moveTaxonomy(group,values,index,index-1),{server:true});
  const later=button('↓',()=>moveTaxonomy(group,values,index,index+1),{server:true});
  earlier.setAttribute('aria-label',value+' 위로 이동');
  later.setAttribute('aria-label',value+' 아래로 이동');
  earlier.dataset.boundary=String(index===0);
  later.dataset.boundary=String(index===values.length-1);
  earlier.disabled=index===0;
  later.disabled=index===values.length-1;
  row.append(number,name,earlier,later,postAction('수정','edit',()=>{const edit=document.createElement('div');edit.className='taxonomy-edit';const input=document.createElement('input');input.value=value;input.maxLength=100;input.setAttribute('aria-label',value+' 새 이름');
   edit.append(input,button('저장',()=>changeTaxonomy(group,'rename-taxonomy',value,input.value),{server:true}),button('취소',()=>edit.remove()));row.querySelector('.taxonomy-edit')?.remove();row.append(edit);input.focus();
  },{server:true}),deleteButton(()=>{const confirm=document.createElement('div');confirm.className='inline-confirm';const text=document.createElement('span');text.textContent=group==='genre'?'카테고리를 삭제하면 연결된 게시물은 분류 없음으로 표시됩니다.':'이 구분값을 삭제할까요?';confirm.append(text,deleteButton(()=>changeTaxonomy(group,'delete-taxonomy',value),{server:true}),button('취소',()=>confirm.remove()));row.querySelector('.inline-confirm')?.remove();row.append(confirm);},{server:true}));details.append(row);
 }
 target.append(details);
}
async function changeTaxonomy(group,action,value,replacement){await task(async()=>{
 const next=(replacement||'').trim();syncResult(await api('admin-data',{action,group,value,replacement:next}));const fields=$('#post-form').elements;
 fields[group].value=[...new Set(selectedValues(group).flatMap(item=>item===value?(action==='rename-taxonomy'?[next]:[]):[item]))].join(', ');
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
  list();
  tell('표시 순서를 저장했습니다.');
 });
}

function renderCategories(){
 const target=$('#category-list');
 target.replaceChildren();
 manageTaxonomy(target,'genre','Category');
 manageTaxonomy(target,'other','Character');
}

const options=$('#post-options');
options.onclick=()=>{
 const expanded=options.getAttribute('aria-expanded')!=='true';
 options.setAttribute('aria-expanded',String(expanded));
 options.textContent=expanded?'options −':'options +';
 $('#post-filter-options').hidden=!expanded;
};
$('#post-search').oninput=()=>{
 visiblePostLimit=postBatchSize;
 list({refreshCategories:false});
};
$('#post-more').onclick=()=>{
 const previousLimit=visiblePostLimit;
 visiblePostLimit+=postBatchSize;
 list({refreshCategories:false});
 $('#post-list').children[previousLimit]?.querySelector('.post-open')?.focus({preventScroll:true});
};
for(const filter of document.querySelectorAll('[data-status-filter]')){
 filter.onclick=()=>{
  activeFilters.status.clear();
  if(filter.dataset.statusFilter)activeFilters.status.add(filter.dataset.statusFilter);
  applyFilters();
 };
}

function renderPickers(){
 const fields=$('#post-form').elements;
 for(const [group,label] of [['genre','카테고리'],['other','캐릭터']]){
  const target=$('#'+group+'-picker');
  target.replaceChildren();
  const selected=selectedValues(group);
  const select=document.createElement('select');
  select.setAttribute('aria-label',label+' 추가');
  select.append(new Option(label+' 추가',''),new Option('+ 새로 만들기','__new__'));
  for(const value of knownValues(group).filter(value=>!selected.includes(value)))select.append(new Option(value,value));
  const selectWrap=document.createElement('div');
  selectWrap.className='editor-select';
  selectWrap.append(select);
  target.append(selectWrap);
  const create=document.createElement('div');
  create.className='new-value';
  create.hidden=true;
  const input=document.createElement('input');
  input.placeholder='새 '+label;
  input.maxLength=100;
  input.setAttribute('aria-label',input.placeholder);
  const add=button('추가',()=>task(async()=>{
   const value=input.value.trim();
   if(!value||value.includes(',')||value==='__new__')throw new Error('구분값은 쉼표 없이 입력하세요.');
   syncResult(await api('admin-data',{action:'save-taxonomy',group,value}));
   selectValue(value);
   list();
   renderCategories();
  }),{server:true});
  create.append(input,add,button('취소',()=>create.hidden=true));
  target.append(create);
  function selectValue(value){
   if(selected.length>=20)throw new Error(label+'는 20개까지 추가할 수 있습니다.');
   fields[group].value=[...new Set([...selected,value])].join(', ');
   changed();
   renderPickers();
   $('#'+group+'-picker select')?.focus({preventScroll:true});
  }
  select.onchange=()=>{
   const value=select.value;
   select.value='';
   if(value==='__new__'){create.hidden=false;input.focus();return;}
   if(!value)return;
   try{selectValue(value);}catch(error){tell(error.message);}
  };
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();add.click();}};
  const tags=document.createElement('div');
  tags.className='selected-values';
  for(const value of selected){
   const tag=postAction(value+' 제거','close',()=>{
   fields[group].value=selected.filter(item=>item!==value).join(', ');
   changed();
   renderPickers();
   $('#'+group+'-picker select')?.focus({preventScroll:true});
   });
   tag.classList.add('selection-remove');
   const name=document.createElement('bdi');
   name.textContent=value;
   if(/[a-z]/i.test(value)&&!/[\p{Script=Hangul}]/u.test(value))name.lang='en';
   tag.prepend(name);
   tags.append(tag);
  }
  target.append(tags);
 }
 $('#known-credits')?.remove();const credits=document.createElement('datalist');credits.id='known-credits';for(const value of new Set(rows.map(row=>row.payload.thxTo).filter(Boolean))){const option=document.createElement('option');option.value=value;credits.append(option);}fields.thxTo.setAttribute('list','known-credits');$('#post-form').append(credits);renderPalette();
}
function renderPalette(){
 const field=$('#post-form').elements.colors,target=$('#palette-picker');target.replaceChildren();const selected=field.value.split(',').map(v=>v.trim()).filter(Boolean);
 for(const [colorIndex,color] of palette.entries()){const el=button('',()=>{field.value=(selected.includes(color.color)?selected.filter(v=>v!==color.color):[...selected,color.color]).join(', ');changed();renderPalette();});el.className='palette-option';const name=['Red','Orange','Yellow','Green','Blue','Navy','Violet','White','Gray','Black'][colorIndex];el.title=name;el.setAttribute('aria-label',name);el.setAttribute('aria-pressed',String(selected.includes(color.color)));const dot=document.createElement('span');dot.className='palette-dot';dot.style.background=color.color;dot.setAttribute('aria-hidden','true');el.append(dot);target.append(el);}
 const legacy=$('#legacy-palette');legacy.replaceChildren();for(const color of selected.filter(v=>!palette.some(item=>item.color===v))){const el=deleteButton(()=>{field.value=selected.filter(v=>v!==color).join(', ');changed();renderPalette();});el.setAttribute('aria-label',paletteLabel(color)+' 제거');legacy.append(el);}
}
function collect(){const f=$('#post-form').elements;return {id:f.id.value,date:f.date.value,title:f.title.value.trim(),body:f.body.value.trim(),genre:selectedValues('genre')[0]||'',categories:selectedValues('genre'),other:selectedValues('other'),colors:f.colors.value.split(',').map(v=>v.trim()).filter(Boolean),thxTo:f.thxTo.value.trim(),thxUrl:f.thxUrl.value.trim(),images:postMedia};}
const appearanceSwitches=document.querySelectorAll('[data-appearance]');
function renderAppearance(){
 for(const control of appearanceSwitches){
  const key=control.dataset.appearance;
  const enabled=key==='theme'?appearance.theme==='light':appearance[key];
  control.setAttribute('aria-checked',String(enabled));
  const value=control.nextElementSibling;
  value.textContent=enabled?value.dataset.on:value.dataset.off;
 }
}
async function load(){const data=await api('admin-data');syncResult(data);mainMedia=structuredClone(settings.mainMedia||seedMain);appearance=normalizeAppearance(settings.appearance);list();renderCategories();renderMedia('main');renderAppearance();renderPickers();$('#seed').hidden=!!settings.initialized;}
function workspace(){document.body.classList.add('is-authenticated');$('#login-panel').hidden=true;$('#workspace').hidden=false;showPanel('posts',true);disable();}
async function save(publish){
 if(!canSave()||busy)return;
 const feedback=$('#editor-save-state');
 feedback.dataset.error='true';
 const post=collect();
 const state=publish?$('#post-form').elements.visibility.value:'draft';
 if(publish&&!post.images.length&&!post.title){
  feedback.textContent='미디어 없이 게시하려면 제목을 입력하세요.';
  return;
 }
 if(publish&&!post.images.length&&!post.body&&!supportsTitleOnly){
  feedback.textContent='제목만 게시하려면 Supabase에서 eru-admin 코드를 V40으로 업데이트한 뒤 다시 로그인하세요.';
  return;
 }
 if(!supportsWriting&&(post.title||post.body||post.categories.length>1)){
  feedback.textContent='글 저장을 켜려면 Supabase에서 eru-admin의 코드를 업데이트한 뒤 다시 로그인하세요.';
  return;
 }
 const editorTitle=$('#workspace-title').textContent;
 if(publish){
  // Keep the editor and its pending files available if the request fails.
  dirty=false;
  showPanel('posts',true);
 }
 await task(async()=>{
  feedback.dataset.error='false';
  if(publish)tell('업로드 중…',{progress:true});
  else feedback.textContent='임시 저장 중…';
  try{
   const data=await api('admin-data',{action:'save-post',post,status:state});
   syncResult(data);
   list();
   renderCategories();
   const savedPost=rows.find(row=>row.id===post.id)?.payload;
   if(!savedPost)throw new Error('저장된 게시물을 확인하지 못했습니다.');
   postMedia=structuredClone(savedPost.images);
   if((savedPost.title||'')!==post.title||(savedPost.body||'')!==post.body||JSON.stringify(postCategories(savedPost))!==JSON.stringify(post.categories)){
    throw new Error('제목, 본문 또는 카테고리가 저장 결과와 달라요. 작성 내용은 이 화면에 남아 있어요.');
   }
   dirty=false;
   const message=state==='published'?'게시 완료':state==='private'?'비공개 저장 완료':'임시 저장 완료';
   if(publish)tell(message,{progress:true});
   else{
    renderMedia('post');
    feedback.textContent=message;
   }
  }catch(error){
   if(publish){
    showPanel('editor',true);
    $('#workspace-title').textContent=editorTitle;
   }
   dirty=true;
   renderMedia('post');
   feedback.dataset.error='true';
   feedback.textContent=error.message;
   $('#editor-save-state').scrollIntoView({block:'nearest'});
  }
 });
}
$('#post-form').onsubmit=event=>{event.preventDefault();save(true);};$('#save-draft').onclick=()=>save(false);$('#new-post').onclick=()=>launchEditor();
$('#seed').onclick=()=>task(async()=>{await api('admin-data',{action:'seed',posts:seedPosts,media:seedMain});await load();});
let mainToastTimer;
$('#save-main').onclick=()=>task(async()=>{
 syncResult(await api('admin-data',{action:'save-main',media:mainMedia,appearance}));
 mainMedia=structuredClone(settings.mainMedia);
 renderMedia('main');
 dirty=false;
 const toast=$('#main-save-toast');
 clearTimeout(mainToastTimer);
 toast.textContent='적용 완료';
 mainToastTimer=setTimeout(()=>{toast.textContent='';},2400);
});
for(const control of appearanceSwitches){
 control.onclick=()=>{
  const key=control.dataset.appearance;
  const enabled=control.getAttribute('aria-checked')!=='true';
  appearance[key]=key==='theme'?(enabled?'light':'dark'):enabled;
  renderAppearance();
  changed();
 };
}

const postPreview=$('#post-preview');
$('#close-post-preview').onclick=()=>postPreview.close();
postPreview.addEventListener('close',()=>postPreview.querySelectorAll('video').forEach(video=>video.pause()));
$('#preview-post').onclick=()=>{
 const post=collect();
 const content=$('#post-preview-content');
 content.replaceChildren();
 const title=$('#post-preview-title');
 title.lang=post.title?'en':'ko';
 setTitle(title,post.title||'미리보기');
 if(post.body){
  const body=document.createElement('p');
  body.textContent=post.body;
  content.append(body);
 }
 for(const media of post.images){
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
$('#logout').onclick=()=>{if(busy)return;if(!dirty){logout();return;}const area=$('.top-actions');area.querySelector('.inline-confirm')?.remove();const prompt=document.createElement('div');prompt.className='inline-confirm';const text=document.createElement('span');text.textContent='저장하지 않은 변경사항이 있습니다.';prompt.append(text,button('Log out',logout),button('취소',()=>prompt.remove()));area.append(prompt);};
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
 if(file.type==='image/gif'||file.type.startsWith('video/')){const original=await send(file);return {src:original,original,type:file.type.startsWith('video/')?'video':'image',alt:''};}
 const bitmap=await createImageBitmap(file);
 try{
  let detail=await variant(bitmap,2400);const thumb=await variant(bitmap,640);
  if(detail.blob.size>maxUploadBytes)detail=await variant(bitmap,1600);
  if((detail.blob.size>maxUploadBytes||thumb.blob.size>maxUploadBytes))throw new Error('최적화 후에도 4MB를 초과합니다. 사진 크기를 줄여 다시 추가하세요.');
  const detailSrc=await send(detail.blob),thumbSrc=await send(thumb.blob);
  const original=file.size>maxUploadBytes?detailSrc:await send(file);
  return {src:detailSrc,detail:detailSrc,thumb:thumbSrc,medium:detailSrc,original,type:'image',alt:'',width:detail.width,height:detail.height,srcset:thumb.width===detail.width?`${detailSrc} ${detail.width}w`:`${thumbSrc} ${thumb.width}w, ${detailSrc} ${detail.width}w`};
 }finally{bitmap.close();}
}
for(const kind of ['post','main'])$('#'+kind+'-files').onchange=event=>{const input=event.target,files=[...input.files];task(async()=>{const progress=$('#upload-progress');progress.hidden=false;try{for(let i=0;i<files.length;i++){progress.textContent=`${i+1} / ${files.length} 업로드 준비 중`;const media=await upload(files[i]);(kind==='post'?postMedia:mainMedia).push(media);changed();renderMedia(kind);}}finally{progress.hidden=true;}}).finally(()=>input.value='');};
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
