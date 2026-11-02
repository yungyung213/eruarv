import {palette,paletteLabel} from './palette.js';
import {isVideo,createMedia,stopVideos} from './media.js';
import {paginate} from './pagination.js';
import {photos} from './content-data.js';
import {imageAssets} from './image-assets.js';
const optimized=(image,size)=>imageAssets[image.src]?image.src.replace(/\.png$/,`-${size}.jpg`):(image[size]||image.src);
let requestId=0;
const cache=new Map();
function loadImage(src){if(!cache.has(src)){const img=new Image();img.decoding='async';const ready=new Promise((resolve,reject)=>{img.onload=()=>img.decode().catch(()=>{}).then(()=>resolve(img));img.onerror=()=>{cache.delete(src);reject(new Error('Image load failed'));};});img.src=src;cache.set(src,ready);}return cache.get(src);}

const posts=[...photos].sort((a,b)=>b.date.localeCompare(a.date));
const frames=posts.flatMap(post=>post.images.map((image,imageIndex)=>({post,image,imageIndex})));
const detail=document.querySelector('#detail'),grid=document.querySelector('#photo-grid');
const previous=document.querySelector('#previous-photo'),next=document.querySelector('#next-photo');
let selectedColor='';
let page=1;
const colorLabels=Object.fromEntries(palette.map(item=>[item.color,item.name]));colorLabels['#000000']='검정';
function appendChips(target,colors){
 if(target.id==='detail-palette'||target.classList.contains('palette-chips')){
  if(!colors.length)return;const chip=document.createElement('span');chip.className='palette-gradient';chip.style.background=colors.length===1?colors[0]:`linear-gradient(90deg,${colors.join(',')})`;chip.setAttribute('role','img');chip.setAttribute('aria-label',colors.map(color=>colorLabels[color]||color).join(' / '));target.append(chip);return;
 }
 colors.forEach(color=>{const chip=document.createElement('span');chip.className='swatch';chip.style.background=color;chip.setAttribute('role','img');chip.setAttribute('aria-label',colorLabels[color]||color);target.append(chip);});
}
let current=0;
const category={genre:'',other:''};
const shortDate=date=>date.slice(2);
function filteredPosts(){return posts.filter(post=>(!selectedColor||post.colors.includes(selectedColor))&&(!category.genre||post.genre===category.genre)&&(!category.other||post.other?.includes(category.other)));}
function availableFrames(){return frames.filter(frame=>filteredPosts().includes(frame.post));}
function stepPost(delta){const available=filteredPosts(),post=frames[current].post;const index=available.indexOf(post);if(!available.length)return;const target=available[(index+delta+available.length)%available.length];showPhoto(frames.findIndex(frame=>frame.post===target));}

async function showPhoto(index){
 if(!frames.length)return;
 current=(index+frames.length)%frames.length;
 const {post,image,imageIndex}=frames[current];
 const img=document.querySelector('#detail-image'),status=document.querySelector('#image-status');
 previous.disabled=next.disabled=post.images.length<2;document.querySelector('#previous-post').disabled=document.querySelector('#next-post').disabled=filteredPosts().length<2;
 const token=++requestId;status.textContent='loading…';img.setAttribute('aria-busy','true');
 const video=document.querySelector('#detail-video');stopVideos(detail);video.removeAttribute('src');video.load();
 if(isVideo(image)){
  img.hidden=true;video.hidden=false;video.src=image.src;video.setAttribute('aria-label',image.alt||'동영상');
  if(image.poster)video.poster=image.poster;else video.removeAttribute('poster');
  video.onloadeddata=()=>{if(token===requestId)status.textContent='';};
  video.onerror=()=>{if(token===requestId)status.textContent='동영상을 불러오지 못했습니다. 파일 형식을 확인해 주세요.';};
  img.setAttribute('aria-busy','false');
 }else{
  video.hidden=true;img.hidden=false;
  try{let loaded;try{loaded=await loadImage(optimized(image,'detail'));}catch{loaded=await loadImage(image.src);}if(token!==requestId)return;img.src=loaded.src;img.alt=image.alt||'';img.animate([{opacity:.65},{opacity:1}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:150});status.textContent='';}
  catch{if(token===requestId){status.textContent='이미지를 불러오지 못했습니다. 다시 시도해 주세요.';img.removeAttribute('src');img.alt='이미지 로딩 실패';}}
  if(token!==requestId)return;img.setAttribute('aria-busy','false');
 }
 const active=availableFrames(),position=active.indexOf(frames[current]);
 for(const offset of [-1,1]){const neighbor=active[(position+offset+active.length)%active.length]?.image;if(neighbor&&neighbor!==image&&!isVideo(neighbor))loadImage(optimized(neighbor,'detail')).catch(()=>{});}
 const date=detail.querySelector('time');date.dateTime=post.date;date.textContent=shortDate(post.date);
 const palette=document.querySelector('#detail-palette');palette.replaceChildren();appendChips(palette,post.colors);
 document.querySelector('#detail-genre').textContent=post.genre||'—';
 document.querySelector('#detail-other').textContent=(post.other||[]).join(' / ')||'—';
 const credit=document.querySelector('#detail-credit');credit.replaceChildren();if(post.thxTo&&post.thxUrl){const link=document.createElement('a');link.href=post.thxUrl;link.textContent=post.thxTo;link.target='_blank';link.rel='noopener noreferrer';credit.append(link);}else{credit.textContent=post.thxTo||'—';}
 document.querySelector('#slide-position').textContent=`photo ${imageIndex+1} / ${post.images.length}`;
 previous.disabled=next.disabled=post.images.length<2;document.querySelector('#previous-post').disabled=document.querySelector('#next-post').disabled=filteredPosts().length<2;
}
function open(index){if(!frames.length)return;showPhoto(index);if(!detail.open)detail.showModal();}
function step(delta){const {post,imageIndex}=frames[current];if(post.images.length<2)return;const target=(imageIndex+delta+post.images.length)%post.images.length;showPhoto(frames.findIndex(frame=>frame.post===post&&frame.imageIndex===target));}
function render(){grid.replaceChildren();const shown=filteredPosts();document.querySelector('#empty-state').hidden=shown.length>0;
 const result=paginate(shown,page);page=result.currentPage;renderPagination(result.totalPages,shown.length);
 result.items.forEach(post=>{const button=document.createElement('button');button.className='photo-card';button.setAttribute('aria-label',`Open photo from ${shortDate(post.date)}`);const image=createMedia({...post.images[0],src:optimized(post.images[0],'thumb')},{thumbnail:true});const dimensions=imageAssets[post.images[0].src];if(dimensions&&!isVideo(post.images[0])){image.width=dimensions.width;image.height=dimensions.height;image.srcset=dimensions.srcset;}if(post.images[0].srcset&&!isVideo(post.images[0])){image.srcset=post.images[0].srcset;}image.className='thumbnail';const meta=document.createElement('div');meta.className='meta';const date=document.createElement('time');date.dateTime=post.date;date.textContent=shortDate(post.date);const palette=document.createElement('span');palette.className='palette-chips';appendChips(palette,post.colors);meta.append(date,palette);button.append(image,meta);button.addEventListener('click',()=>open(frames.findIndex(frame=>frame.post===post)));grid.append(button);});updateSizes();}
function renderPagination(totalPages,count){
 const nav=document.querySelector('#pagination');nav.replaceChildren();nav.hidden=count===0;
 function add(label,target,disabled=false,current=false){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=disabled;if(current)button.setAttribute('aria-current','page');button.setAttribute('aria-label',label==='‹'?'이전 페이지':label==='›'?'다음 페이지':`${label} 페이지`);button.addEventListener('click',()=>{page=target;render();document.querySelector('.tools').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});document.querySelector('#pagination [aria-current]').focus({preventScroll:true});});nav.append(button);}
 add('‹',page-1,page===1);
 for(let i=1;i<=totalPages;i++)add(String(i),i,false,i===page);
 add('›',page+1,page===totalPages);
}

const colors=palette.map(item=>item.color);const colorOptions=document.querySelector('#color-options');
colors.forEach(color=>{const button=document.createElement('button');button.setAttribute('aria-label',colorLabels[color]||color);button.setAttribute('aria-pressed','false');appendChips(button,[color]);button.addEventListener('click',()=>{page=1;selectedColor=selectedColor===color?'':color;for(const item of colorOptions.children)item.setAttribute('aria-pressed',String(item===button&&selectedColor===color));render();});colorOptions.append(button);});
const desktop=matchMedia('(min-width:701px)');
let view;
let clickedView=null;
const viewKey=()=>desktop.matches?'eru-gallery-desktop-v2':'eru-gallery-mobile-v2';
const defaultView=()=>desktop.matches?'default':'one';
function updateSizes(){grid.querySelectorAll('img').forEach(img=>{img.sizes=view==='list'?'180px':view==='one'?'92vw':view==='default'?'(min-width:701px) 320px, 46vw':'46vw';});}
function setView(value){
 const allowed=desktop.matches?['default']:['one','two'];
 view=allowed.includes(value)?value:defaultView();
 grid.dataset.view=view;
 document.querySelectorAll('.view-modes [data-view]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.view===view));button.dataset.active=String(button.dataset.view===view&&clickedView===view);});
 updateSizes();try{localStorage.setItem(viewKey(),view);}catch{}
}
function restoreView(){clickedView=null;setView(defaultView());}
document.querySelectorAll('.view-modes [data-view]').forEach(button=>button.addEventListener('click',()=>{clickedView=button.dataset.view;setView(button.dataset.view);}));
desktop.addEventListener('change',restoreView);
restoreView();
render();document.querySelector('.gallery-heading sup').textContent=` (${String(posts.length).padStart(2,'0')})`;document.querySelectorAll('[data-gallery-count]').forEach(count=>{count.textContent=String(posts.length).padStart(2,'0');});
document.querySelector('#close-photo').addEventListener('click',()=>detail.close());
previous.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));
document.querySelector('#previous-post').addEventListener('click',()=>stepPost(-1));document.querySelector('#next-post').addEventListener('click',()=>stepPost(1));
detail.addEventListener('keydown',e=>{if(e.target.closest('video'))return;if(e.key==='ArrowRight'){e.preventDefault();step(1);}if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}});
detail.addEventListener('close',()=>{requestId++;stopVideos(detail);const video=document.querySelector('#detail-video');video.removeAttribute('src');video.load();document.querySelector('#detail-image').removeAttribute('src');if(location.search)history.replaceState(null,'',location.pathname);});
// Filters follow the categories and characters managed in the admin.
for(const [group,label,values] of [['genre','Category',posts.map(post=>post.genre)],['other','Character',posts.flatMap(post=>post.other||[])]]){
 const target=document.querySelector(`[role=group][aria-label="${label}"]`);target.querySelectorAll('button').forEach(button=>button.remove());
 for(const value of ['',...new Set(values.filter(Boolean))]){const button=document.createElement('button');button.dataset.group=group;button.dataset.value=value;button.textContent=value||'all';button.setAttribute('aria-pressed',String(!value));target.append(button);}
}
document.querySelectorAll('[data-group]').forEach(button=>button.addEventListener('click',()=>{page=1;category[button.dataset.group]=button.dataset.value;document.querySelectorAll(`[data-group="${button.dataset.group}"]`).forEach(item=>item.setAttribute('aria-pressed',String(item===button)));render();}));
const optionsToggle=document.querySelector('.options-toggle'),options=document.querySelector('#gallery-options');optionsToggle.addEventListener('click',()=>{const expanded=optionsToggle.getAttribute('aria-expanded')!=='true';optionsToggle.setAttribute('aria-expanded',String(expanded));optionsToggle.textContent=expanded?'options −':'options +';options.hidden=!expanded;});
const selected=new URLSearchParams(location.search).get('photo'),initial=frames.findIndex(frame=>frame.post.id===selected);if(initial>=0)open(initial);

let touchStart;const media=document.querySelector('#detail-image');media.addEventListener('touchstart',event=>{if(event.target.closest('video'))return;touchStart={x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY};},{passive:true});media.addEventListener('touchcancel',()=>{touchStart=null;},{passive:true});media.addEventListener('touchend',event=>{if(!touchStart)return;const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1);touchStart=null;},{passive:true});
