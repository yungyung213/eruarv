import {palette,paletteLabel} from '../public/js/palette.js';
import {imageAssets} from '../public/js/image-assets.js';
import {createClient} from '@supabase/supabase-js';
import {photos as seedPosts} from '../public/js/photos.js';
import {mainMedia as seedMain} from '../public/js/site-config.js';
const $=selector=>document.querySelector(selector),status=$('#admin-status');
const editorMode=document.body.dataset.editor==='true',params=new URLSearchParams(location.search);
let dirty=false;
let client,session,demo=false,rows=[],settings={},postMedia=[],mainMedia=[],busy=false,storage='github',storageReady=false,revision='',maxUploadBytes=4*1024*1024;
let pendingUploads=[];const previewURLs=new Map();
const thumbnail=media=>previewURLs.get(media.thumb)||previewURLs.get(media.src)||media.thumb||(imageAssets[media.src]?media.src.replace(/\.png$/,'-thumb.jpg'):media.src);
function tell(text){status.textContent=text;}
function canSave(){return !demo&&!!session&&storageReady;}
function disable(){for(const selector of ['#publish','#save-draft','#save-main','#seed','#post-files','#main-files'])$(selector).disabled=!canSave()||busy;}
async function api(name,input){
 if(!session)throw new Error('로그인하세요.');
 const {data,error}=await client.auth.getSession();if(error||!data.session)throw new Error('로그인이 만료되었습니다. 다시 로그인하세요.');session=data.session;
 const response=await fetch(`/.netlify/functions/${name}`,{method:input?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:input?JSON.stringify(name==='admin-data'&&storage==='github'?{...input,revision,uploads:pendingUploads}:input):undefined});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'요청 실패');if(result.revision)revision=result.revision;if(result.savedPaths)pendingUploads=pendingUploads.filter(file=>!result.savedPaths.includes(file.path));return result;
}
async function task(fn){if(busy)return;busy=true;disable();try{await fn();}catch(error){tell(error.message);}finally{busy=false;disable();}}
function launchEditor(row){
 const url=new URL('admin-editor.html',location.href);if(row)url.searchParams.set('post',row.id);if(demo)url.searchParams.set('demo','1');
 const opened=window.open(url.href,'_blank','popup,width=1080,height=900,resizable=yes,scrollbars=yes');
 if(!opened){tell('새 창이 차단되었습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.');}
}
function openPost(row){
 const post=row?.payload||{id:crypto.randomUUID(),date:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),genre:'',other:[],colors:[],images:[]};
 const form=$('#post-form');for(const key of ['id','date','genre','thxTo','thxUrl'])form.elements[key].value=post[key]||'';
 form.elements.other.value=(post.other||[]).join(', ');form.elements.colors.value=(post.colors||[]).join(', ');postMedia=structuredClone(post.images);renderPickers();
 $('#editor-title').textContent=row?'게시물 편집':'새 게시물';if(editorMode){$('#workspace h1').textContent=row?'게시물 편집':'게시물 업로드';document.title=row?'ERU / 게시물 편집':'ERU / 게시물 업로드';}$('#post-state').textContent=row?.status==='published'?'게시 중':'임시 저장';
 $('#post-list').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.id===post.id)));renderMedia('post');
}
function list(){
 const target=$('#post-list');target.replaceChildren();$('#post-count').textContent=`게시물 ${rows.length}개`;
 for(const row of rows){const button=document.createElement('button');button.type='button';button.dataset.id=row.id;button.setAttribute('aria-pressed','false');const first=row.payload.images[0];if(first&&first.type!=='video'){const image=new Image();image.src=thumbnail(first);image.alt='';button.append(image);}
 const label=document.createElement('span');label.textContent=row.payload.date;const note=document.createElement('small');note.textContent=`${row.payload.genre||'분류 없음'} · ${row.status==='published'?'게시 중':'임시 저장'}`;label.append(note);button.append(label);button.onclick=()=>editorMode?openPost(row):launchEditor(row);target.append(button);}
}
function renderMedia(kind){
 const collection=kind==='post'?postMedia:mainMedia,target=$('#'+kind+'-media');target.replaceChildren();
 collection.forEach((media,index)=>{const item=document.createElement('div');item.className='media-item';const el=document.createElement(media.type==='video'?'video':'img');el.src=thumbnail(media);if(el.tagName==='VIDEO'){el.src=previewURLs.get(media.src)||media.src;el.controls=true;el.preload='metadata';el.playsInline=true;if(media.poster)el.poster=media.poster;}else el.alt=media.alt||'';item.append(el);
 const alt=document.createElement('input');alt.value=media.alt||'';alt.placeholder='이미지 설명';alt.setAttribute('aria-label',`${index+1}번 미디어 설명`);alt.oninput=()=>media.alt=alt.value;item.append(alt);
 if(media.type==='video'){const poster=document.createElement('input');poster.type='url';poster.value=media.poster||'';poster.placeholder='포스터 이미지 URL (선택)';poster.setAttribute('aria-label','동영상 포스터 URL');poster.onchange=()=>media.poster=poster.value;item.append(poster);}
 const actions=document.createElement('div');actions.className='media-actions';
 for(const [label,delta] of [['↑',-1],['↓',1],['제거',0]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',delta?`${index+1}번 미디어 ${delta<0?'앞으로':'뒤로'}`:`${index+1}번 미디어 제거`);button.disabled=!!delta&&(index+delta<0||index+delta>=collection.length);button.onclick=()=>{dirty=true;if(delta)[collection[index],collection[index+delta]]=[collection[index+delta],collection[index]];else collection.splice(index,1);renderMedia(kind);};actions.append(button);}item.append(actions);target.append(item);
 });
}
function knownValues(group){
 const used=rows.flatMap(row=>group==='genre'?[row.payload.genre]:(row.payload.other||[]));
 return [...new Set([...(settings.taxonomy?.[group]||[]),...used].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
}
function renderPickers(){
 const fields=$('#post-form').elements;
 for(const [group,label] of [['genre','카테고리'],['other','캐릭터']]){
  const target=$('#'+group+'-picker');target.replaceChildren();
  const selected=group==='genre'?[fields.genre.value]:fields.other.value.split(',').map(v=>v.trim()).filter(Boolean);
  const select=document.createElement('select');select.setAttribute('aria-label',label+' 선택');
  const values=[['__new__','+ 새로 만들기'],['',group==='genre'?'카테고리 선택':'캐릭터 추가 선택'],...knownValues(group).map(value=>[value,(selected.includes(value)&&group==='other'?'✓ ':'')+value])];
  if(group==='genre'&&fields.genre.value&&!values.some(([value])=>value===fields.genre.value))values.push([fields.genre.value,fields.genre.value]);
  for(const [value,text] of values){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
  select.value=group==='genre'?fields.genre.value:'';target.append(select);
  const create=document.createElement('div');create.className='new-value';create.hidden=true;
  const input=document.createElement('input');input.placeholder='새 '+label;input.maxLength=100;input.setAttribute('aria-label','새 '+label);
  const add=document.createElement('button');add.type='button';add.textContent='추가';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';
  create.append(input,add,cancel);target.append(create);
  select.onchange=()=>{if(select.value==='__new__'){create.hidden=false;input.focus();select.value=group==='genre'?fields.genre.value:'';return;}dirty=true;if(group==='genre')fields.genre.value=select.value;else if(select.value)fields.other.value=[...new Set([...selected,select.value])].join(', ');renderPickers();};
  cancel.onclick=()=>{create.hidden=true;};
  add.onclick=()=>{const value=input.value.trim();if(!value||value.includes(',')||value==='__new__'){tell('구분값은 쉼표 없이 입력하세요.');return;}
   async function register(){if(!demo){await api('admin-data',{action:'save-taxonomy',group,value});}
    settings.taxonomy||={};settings.taxonomy[group]=[...new Set([...(settings.taxonomy[group]||[]),value])];
    if(group==='genre')fields.genre.value=value;else fields.other.value=[...new Set([...selected,value])].join(', ');dirty=true;renderPickers();tell(demo?'미리보기에서 구분값을 추가했습니다. 실제 저장은 연결 후 가능합니다.':'새 구분값을 저장했습니다.');
   }
   task(register);
  };
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();add.click();}};
  if(group==='other'){
   const tags=document.createElement('div');tags.className='selected-values';
   for(const value of selected){const remove=document.createElement('button');remove.type='button';remove.textContent=value+' ×';remove.setAttribute('aria-label',value+' 선택 해제');remove.onclick=()=>{fields.other.value=selected.filter(item=>item!==value).join(', ');dirty=true;renderPickers();};tags.append(remove);}target.append(tags);
  }
 }
 const credits=document.createElement('datalist');credits.id='known-credits';document.querySelector('#known-credits')?.remove();for(const value of new Set(rows.map(row=>row.payload.thxTo).filter(Boolean))){const option=document.createElement('option');option.value=value;credits.append(option);}fields.thxTo.setAttribute('list','known-credits');$('#post-form').append(credits);
 renderPalette();
}
function renderPalette(){
 const field=$('#post-form').elements.colors,target=$('#palette-picker');target.replaceChildren();
 const selected=field.value.split(',').map(v=>v.trim()).filter(Boolean);
 for(const item of palette){const button=document.createElement('button');button.type='button';button.className='palette-option';button.setAttribute('aria-label',item.name);button.setAttribute('aria-pressed',String(selected.includes(item.color)));
  const dot=document.createElement('span');dot.className='palette-dot';dot.style.background=item.color;dot.setAttribute('aria-hidden','true');const text=document.createElement('span');text.textContent=item.name;button.append(dot,text);
  button.onclick=()=>{field.value=(selected.includes(item.color)?selected.filter(color=>color!==item.color):[...selected,item.color]).join(', ');dirty=true;renderPalette();};target.append(button);
 }
 const legacy=selected.filter(color=>!palette.some(item=>item.color===color));const container=$('#legacy-palette');container.replaceChildren();
 for(const color of legacy){const button=document.createElement('button');button.type='button';button.textContent=paletteLabel(color)+' ×';button.setAttribute('aria-label',paletteLabel(color)+' 제거');button.onclick=()=>{field.value=selected.filter(value=>value!==color).join(', ');dirty=true;renderPalette();};container.append(button);}
}
function collect(){const f=$('#post-form').elements;return {id:f.id.value,date:f.date.value,genre:f.genre.value.trim(),other:f.other.value.split(',').map(v=>v.trim()).filter(Boolean),colors:f.colors.value.split(',').map(v=>v.trim()).filter(Boolean),thxTo:f.thxTo.value.trim(),thxUrl:f.thxUrl.value.trim(),images:postMedia};}
async function save(publish){if(!canSave())return;await task(async()=>{await api('admin-data',{action:'save-post',post:collect(),status:publish?'published':'draft'});tell(publish?(storage==='github'?'GitHub에 게시 내용을 저장했습니다. Netlify 재배포가 끝나면 사이트에 표시됩니다.':'게시했습니다. 사이트를 새로고침하면 반영됩니다.'):'임시 저장했습니다. 갤러리에는 노출되지 않습니다.');const id=$('#post-form').elements.id.value;await load();openPost(rows.find(row=>row.id===id));dirty=false;window.opener?.postMessage({type:'eru-post-saved'},location.origin);});}
async function load(){const data=await api('admin-data');rows=data.posts;settings=data.settings;if(!settings.initialized)tell('먼저 기존 데이터 가져오기를 눌러 초기 게시물을 연결하세요.');mainMedia=structuredClone(settings.mainMedia||seedMain);list();renderMedia('main');renderPickers();$('#seed').hidden=!!settings.initialized;}
function workspace(){ if(editorMode){$('#post-form').hidden=false;$('#posts-panel').hidden=false;}$('#login-panel').hidden=true;$('#workspace').hidden=false;$('#demo-note').hidden=!demo;disable();}
$('#post-form').onsubmit=event=>{event.preventDefault();save(true);};$('#save-draft').onclick=()=>save(false);$('#new-post').onclick=()=>launchEditor();
$('#seed').onclick=()=>task(async()=>{await api('admin-data',{action:'seed',posts:seedPosts,media:seedMain});await load();tell('기존 게시물과 메인 설정을 가져왔습니다.');});
$('#save-main').onclick=()=>task(async()=>{await api('admin-data',{action:'save-main',media:mainMedia});dirty=false;tell(storage==='github'?'메인 설정을 GitHub에 저장했습니다. Netlify 재배포가 끝나면 반영됩니다.':'메인 슬라이드를 저장했습니다. 사이트를 새로고침하면 반영됩니다.');});
$('#login-form').onsubmit=event=>{event.preventDefault();task(async()=>{const f=event.target.elements;const {data,error}=await client.auth.signInWithPassword({email:f.email.value,password:f.password.value});f.password.value='';if(error)throw error;session=data.session;demo=false;await load();workspace();openPost(editorMode?rows.find(row=>row.id===params.get('post')):rows[0]);tell('로그인했습니다.');});};
$('#logout').onclick=async()=>{if(client)await client.auth.signOut();session=null;demo=false;$('#workspace').hidden=true;$('#login-panel').hidden=false;tell('로그아웃했습니다.');};
$('#demo-button').onclick=()=>{demo=true;rows=seedPosts.map(payload=>({id:payload.id,payload,status:'published'}));settings={};mainMedia=structuredClone(seedMain);workspace();list();openPost(editorMode?rows.find(row=>row.id===params.get('post')):rows[0]);renderMedia('main');};
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));$('#posts-panel').hidden=button.dataset.tab!=='posts';$('#main-panel').hidden=button.dataset.tab!=='main';});
async function send(blob){
 if(storage==='github'){
  if(blob.size>maxUploadBytes)throw new Error('이 파일은 4MB를 초과합니다. GIF·영상은 용량을 줄여 다시 추가하세요.');
  const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('파일 읽기 실패'));reader.readAsDataURL(blob);});
  const result=await api('upload-file',{type:blob.type,content});pendingUploads.push(result.receipt);
  previewURLs.set(result.src,URL.createObjectURL(blob));return result.src;
 }
 const signed=await api('upload-url',{type:blob.type,size:blob.size});const response=await fetch(signed.url,{method:'PUT',headers:{'Content-Type':blob.type},body:blob});if(!response.ok)throw new Error('파일 전송 실패. 저장소 CORS 설정을 확인하세요.');return signed.src;
}
async function variant(bitmap,width){const scale=Math.min(1,width/bitmap.width);const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));if(!blob)throw new Error('이미지 변환 실패');return {blob,width:canvas.width,height:canvas.height};}
async function upload(file){
 if(file.size>200*1024*1024)throw new Error(`${file.name}: 200MB를 초과합니다.`);
 if(!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(file.type))throw new Error(`${file.name}: 지원하지 않는 형식입니다.`);
 if(file.type==='image/gif'||file.type.startsWith('video/')){const original=await send(file);return {src:original,original,type:file.type.startsWith('video/')?'video':'image',alt:file.name};}
 const bitmap=await createImageBitmap(file);
 try{
  let detail=await variant(bitmap,2400);const thumb=await variant(bitmap,640);
  if(storage==='github'&&detail.blob.size>maxUploadBytes)detail=await variant(bitmap,1600);
  if(storage==='github'&&(detail.blob.size>maxUploadBytes||thumb.blob.size>maxUploadBytes))throw new Error('최적화 후에도 4MB를 초과합니다. 사진 크기를 줄여 다시 추가하세요.');
  const detailSrc=await send(detail.blob),thumbSrc=await send(thumb.blob);
  const original=storage==='github'&&file.size>maxUploadBytes?detailSrc:await send(file);
  return {src:detailSrc,detail:detailSrc,thumb:thumbSrc,medium:detailSrc,original,type:'image',alt:file.name,width:detail.width,height:detail.height,srcset:thumb.width===detail.width?`${detailSrc} ${detail.width}w`:`${thumbSrc} ${thumb.width}w, ${detailSrc} ${detail.width}w`};
 }finally{bitmap.close();}
}
for(const kind of ['post','main'])$('#'+kind+'-files').onchange=event=>{const input=event.target,files=[...input.files];task(async()=>{for(let i=0;i<files.length;i++){tell(`${i+1}/${files.length} 업로드·최적화 중…`);const result=await upload(files[i]);(kind==='post'?postMedia:mainMedia).push(result);renderMedia(kind);}dirty=true;tell(storage==='github'?'파일 준비 완료. 임시 저장 또는 게시를 누르면 GitHub에 기록됩니다.':'파일 업로드 완료. 저장 또는 게시 버튼을 눌러 반영하세요.');}).finally(()=>input.value='');};
try{const response=await fetch('/.netlify/functions/config');if(!response.ok)throw new Error('미연결');const config=await response.json();if(!config.configured)throw new Error('미연결');storage=config.storage||'r2';storageReady=!!config.storageConfigured;maxUploadBytes=config.maxUploadBytes||200*1024*1024;client=createClient(config.url,config.key);$('#connection-state').textContent=config.storageConfigured?'관리자 계정으로 로그인하세요.':'로그인은 연결됐습니다. GitHub 저장소 연결이 필요합니다.';const {data}=await client.auth.getSession();if(data.session){session=data.session;await load();workspace();openPost(editorMode?rows.find(row=>row.id===params.get('post')):rows[0]);}}catch{$('#connection-state').textContent='계정 연결 전입니다. 아래에서 어드민 화면을 미리 확인할 수 있습니다.';$('#login-button').disabled=true;}

if(editorMode){
 $('#editor-close').onclick=()=>{if(busy){tell('업로드가 끝난 뒤 닫아 주세요.');return;}window.close();};
 $('#post-form').addEventListener('input',()=>dirty=true);
 window.addEventListener('beforeunload',event=>{if(dirty&&!demo){event.preventDefault();event.returnValue='';}});
 if(params.get('demo')==='1')$('#demo-button').click();
}else{
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='eru-post-saved'&&canSave())task(()=>load());});
}
