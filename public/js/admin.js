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
try{setAdminTheme(localStorage.getItem('eru-admin-theme')==='light');}catch{setAdminTheme(false);}
themeButton.onclick=()=>{
 const light=themeButton.getAttribute('aria-pressed')!=='true';
 setAdminTheme(light);
 try{localStorage.setItem('eru-admin-theme',light?'light':'dark');}catch{}
};
for(const button of document.querySelectorAll('[data-content-view]')){
 button.onclick=()=>{
  $('#post-list').dataset.view=button.dataset.contentView;
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
let appearance=normalizeAppearance();
let statusFilter='';
let categoryFilter='';
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
const actionIcons={
 edit:'M4 20l4-.8L20 7l-3-3L5 16l-1 4ZM15 6l3 3',
 hide:'M3 3l18 18M10 10a3 3 0 0 0 4 4M6 6c-2 2-4 6-4 6s4 7 10 7c2 0 4-.8 5.5-2M9 5c1-.5 2-.5 3-.5 6 0 10 7.5 10 7.5s-1 2-2 3',
 show:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 delete:'M3 6h18M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6m4-6v6'
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
 $('#workspace-title').textContent=panel==='main'?'main':'contents';
 $('.tabs').hidden=panel==='main'||panel==='editor';
 for(const name of ['posts','categories','main','editor'])$('#'+name+'-panel').hidden=name!==panel;
 if(panel==='main')updateMainRail();
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
 $('#editor-save-state').textContent='';$('#workspace-title').textContent=row?'edit post':'new post';$('#post-state').textContent=row?.status==='published'?'공개':row?.status==='private'?'비공개':'임시 저장';
}
function list({refreshCategories=true}={}){
 if(refreshCategories){
  const filter=$('#post-category');
  const categories=knownValues('genre');
  if(!categories.includes(categoryFilter))categoryFilter='';
  const label=document.createElement('span');
  label.textContent='Category';
  filter.replaceChildren(label);
  for(const value of ['',...categories]){
   const control=button(value||'All',()=>{
    categoryFilter=value;
    for(const option of filter.querySelectorAll('button')){
     option.setAttribute('aria-pressed',String(option===control));
    }
    list({refreshCategories:false});
   });
   control.setAttribute('aria-pressed',String(value===categoryFilter));
   filter.append(control);
  }
 }
 const target=$('#post-list');target.replaceChildren();
 const search=$('#post-search').value.trim().toLocaleLowerCase();
 const visible=rows.filter(row=>
  (!categoryFilter||postCategories(row.payload).includes(categoryFilter))&&
  (!statusFilter||row.status===statusFilter)&&
  (!search||(row.payload.title||'').toLocaleLowerCase().includes(search))
 );
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
  state.textContent=[row.payload.title&&row.payload.date,postCategories(row.payload).join(" / "),label].filter(Boolean).join(' · ');
  info.append(title,state);
  open.append(info);
  card.append(open);
  const actions=document.createElement('div');actions.className='post-actions';
  actions.append(postAction('편집','edit',()=>launchEditor(row)));
  actions.append(postAction(row.status==='published'?'비공개':'공개',row.status==='published'?'hide':'show',()=>task(async()=>{syncResult(await api('admin-data',{action:'set-post-status',id:row.id,status:row.status==='published'?'private':'published'}));list();renderCategories();}),{server:true}));
  actions.append(postAction('삭제','delete',()=>{
   const confirm=document.createElement('div');confirm.className='inline-confirm';confirm.setAttribute('role','group');confirm.setAttribute('aria-label','게시물 삭제 확인');
   const text=document.createElement('span');text.textContent='이 게시물을 삭제할까요?';
   confirm.append(text,button('삭제',()=>task(async()=>{syncResult(await api('admin-data',{action:'delete-post',id:row.id}));list();renderCategories();}),{server:true}),button('취소',()=>confirm.remove()));
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
 if(kind==='main')moved?.scrollIntoView({block:'nearest',inline:'nearest'});
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
  if(kind==='main'){
   const bounds=track.getBoundingClientRect();
   if(event.clientX>bounds.right-36)track.scrollLeft+=16;
   else if(event.clientX<bounds.left+36)track.scrollLeft-=16;
  }
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

const updateMainRail=setupSlideRail($('#main-media').parentElement);
const updateLibraryRail=setupSlideRail($('#main-library-grid').parentElement);

function renderMedia(kind){
 const collection=kind==='post'?postMedia:mainMedia,target=$('#'+kind+'-media');target.replaceChildren();
 collection.forEach((media,index)=>{
  const item=document.createElement('article');item.className='media-item';item.dataset.index=index;
  const el=document.createElement(media.type==='video'?'video':'img');el.src=thumbnail(media);if(el.tagName==='VIDEO'){el.src=mediaPreview(media.src);el.controls=true;el.preload='metadata';el.playsInline=true;if(media.poster)el.poster=mediaPreview(media.poster);}else el.alt=media.alt||'';item.append(el);
  if(kind==='post'){
   const label=document.createElement('label');label.textContent=`${index+1} · 설명`;const alt=document.createElement('input');alt.value=media.alt||'';alt.placeholder='이미지 설명';alt.oninput=()=>{media.alt=alt.value;changed();};label.append(alt);item.append(label);
   if(media.type==='video'){const label=document.createElement('label');label.textContent='포스터 URL';const input=document.createElement('input');input.type='url';input.value=media.poster||'';input.onchange=()=>{media.poster=input.value;changed();};label.append(input);item.append(label);}
  }
  const actions=document.createElement('div');
  actions.className='media-actions';
  actions.append(button('삭제',()=>{
   if(busy)return;
   collection.splice(index,1);
   changed();
   renderMedia(kind);
  }));
  item.append(actions);
  target.append(item);
  makeSortable(el,item,kind,index);
 });
 if(kind==='main')updateMainRail();
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
  row.append(number,name,earlier,later,button('수정',()=>{const edit=document.createElement('div');edit.className='taxonomy-edit';const input=document.createElement('input');input.value=value;input.maxLength=100;input.setAttribute('aria-label',value+' 새 이름');
   edit.append(input,button('저장',()=>changeTaxonomy(group,'rename-taxonomy',value,input.value),{server:true}),button('취소',()=>edit.remove()));row.querySelector('.taxonomy-edit')?.remove();row.append(edit);input.focus();
  },{server:true}),button('삭제',()=>{const confirm=document.createElement('div');confirm.className='inline-confirm';const text=document.createElement('span');text.textContent=group==='genre'?'카테고리를 삭제하면 연결된 게시물은 분류 없음으로 표시됩니다.':'이 구분값을 삭제할까요?';confirm.append(text,button('삭제',()=>changeTaxonomy(group,'delete-taxonomy',value),{server:true}),button('취소',()=>confirm.remove()));row.querySelector('.inline-confirm')?.remove();row.append(confirm);},{server:true}));details.append(row);
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
$('#post-search').oninput=()=>list({refreshCategories:false});
for(const filter of document.querySelectorAll('[data-status-filter]')){
 filter.onclick=()=>{
  statusFilter=filter.dataset.statusFilter;
  for(const button of document.querySelectorAll('[data-status-filter]')){
   button.setAttribute('aria-pressed',String(button===filter));
  }
  list({refreshCategories:false});
 };
}

const library=$('#main-library');
const libraryStatus=$('#main-library-status');
$('#open-main-library').onclick=()=>{
 libraryStatus.hidden=true;
 renderLibrary();
 library.showModal();
 updateLibraryRail();
};
$('#close-main-library').onclick=()=>library.close();
$('#main-close').onclick=()=>{
 if(showPanel('posts'))$('[data-tab=main]').focus({preventScroll:true});
};

function renderLibrary(){
 const grid=$('#main-library-grid');
 grid.replaceChildren();
 const added=new Set(mainMedia.map(media=>media.src));
 const seen=new Set();
 for(const row of rows){
  if(row.status!=='published')continue;
  for(const [index,media] of row.payload.images.entries()){
   if(media.type==='video'||seen.has(media.src))continue;
   seen.add(media.src);
   const title=row.payload.title||row.payload.date;
   const selected=added.has(media.src);
   const card=button('',()=>{
    if(busy)return;
    if(mainMedia.length>=20){
     libraryStatus.textContent='메인 슬라이드는 20개까지 등록할 수 있습니다.';
     libraryStatus.hidden=false;
     return;
    }
    mainMedia.push(structuredClone(media));
    libraryStatus.textContent='메인 슬라이드에 추가했습니다.';
    libraryStatus.hidden=false;
    changed();
    renderMedia('main');
    card.disabled=true;
    card.setAttribute('aria-label',title+' 사진 '+(index+1)+' · 추가됨');
    caption.textContent=title+' · 추가됨';
    const next=[...grid.querySelectorAll('button:not(:disabled)')].find(option=>card.compareDocumentPosition(option)&Node.DOCUMENT_POSITION_FOLLOWING);
    if(next)next.scrollIntoView({block:'nearest',inline:'nearest'});
    (next||$('#close-main-library')).focus({preventScroll:true});
   });
   card.disabled=selected;
   card.setAttribute('aria-label',title+' 사진 '+(index+1)+(selected?' · 추가됨':' · 추가'));
   const img=document.createElement('img');
   img.src=thumbnail(media);
   img.alt='';
   img.loading='lazy';
   const caption=document.createElement('span');
   caption.textContent=title+' · '+(selected?'추가됨':index+1);
   card.append(img,caption);
   grid.append(card);
  }
 }
 if(!seen.size)grid.textContent='공개 게시물에 사진이 없습니다.';
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
  target.append(select);
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
  for(const value of selected)tags.append(button(value+' ×',()=>{
   fields[group].value=selected.filter(item=>item!==value).join(', ');
   changed();
   renderPickers();
   $('#'+group+'-picker select')?.focus({preventScroll:true});
  }));
  target.append(tags);
 }
 $('#known-credits')?.remove();const credits=document.createElement('datalist');credits.id='known-credits';for(const value of new Set(rows.map(row=>row.payload.thxTo).filter(Boolean))){const option=document.createElement('option');option.value=value;credits.append(option);}fields.thxTo.setAttribute('list','known-credits');$('#post-form').append(credits);renderPalette();
}
function renderPalette(){
 const field=$('#post-form').elements.colors,target=$('#palette-picker');target.replaceChildren();const selected=field.value.split(',').map(v=>v.trim()).filter(Boolean);
 for(const [colorIndex,color] of palette.entries()){const el=button('',()=>{field.value=(selected.includes(color.color)?selected.filter(v=>v!==color.color):[...selected,color.color]).join(', ');changed();renderPalette();});el.className='palette-option';const name=['Red','Orange','Yellow','Green','Blue','Navy','Violet','White','Gray','Black'][colorIndex];el.title=name;el.setAttribute('aria-label',name);el.setAttribute('aria-pressed',String(selected.includes(color.color)));const dot=document.createElement('span');dot.className='palette-dot';dot.style.background=color.color;dot.setAttribute('aria-hidden','true');el.append(dot);target.append(el);}
 const legacy=$('#legacy-palette');legacy.replaceChildren();for(const color of selected.filter(v=>!palette.some(item=>item.color===v))){const el=button('×',()=>{field.value=selected.filter(v=>v!==color).join(', ');changed();renderPalette();});el.setAttribute('aria-label',paletteLabel(color)+' 제거');legacy.append(el);}
}
function collect(){const f=$('#post-form').elements;return {id:f.id.value,date:f.date.value,title:f.title.value.trim(),body:f.body.value.trim(),genre:selectedValues('genre')[0]||'',categories:selectedValues('genre'),other:selectedValues('other'),colors:f.colors.value.split(',').map(v=>v.trim()).filter(Boolean),thxTo:f.thxTo.value.trim(),thxUrl:f.thxUrl.value.trim(),images:postMedia};}
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
   if(publish&&post.categories.some(value=>value.toUpperCase()==='TEXT')&&!post.body){
    throw new Error('TEXT 카테고리로 게시하려면 Text에 본문을 입력하세요.');
   }
   const state=publish?$('#post-form').elements.visibility.value:'draft';
   const data=await api('admin-data',{action:'save-post',post,status:state});
   syncResult(data);
   const savedPost=rows.find(row=>row.id===post.id)?.payload;
   if(!savedPost)throw new Error('저장된 게시물을 확인하지 못했습니다.');
   postMedia=structuredClone(savedPost.images);
   if((savedPost.title||'')!==post.title||(savedPost.body||'')!==post.body||JSON.stringify(postCategories(savedPost))!==JSON.stringify(post.categories)){
    renderMedia('post');
    throw new Error('제목·본문 또는 카테고리 저장을 확인해 주세요. Supabase 함수를 V28로 업데이트한 후 다시 저장하세요.');
   }
   renderMedia('post');
   dirty=false;
   $('#post-state').textContent=state==='published'?'공개':state==='private'?'비공개':'임시 저장';
   feedback.textContent=state==='published'?'게시 완료 · 갤러리는 Pages 배포 후 갱신됩니다.':state==='private'?'비공개 저장 완료':'임시 저장 완료';
   list();renderCategories();
   if(publish){
    showPanel('posts',true);
    tell(feedback.textContent);
   }
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
