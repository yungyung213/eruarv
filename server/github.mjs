import {createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
import {env} from './core.mjs';
import {TYPES, validatePost, media} from './validation.mjs';

export const githubMode=()=>env('CONTENT_STORAGE')==='github';
export const githubReady=()=>['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','GITHUB_BRANCH'].every(name=>env(name));
export const MAX_FILE_BYTES=4*1024*1024;
const ARCHIVE='content/archive.json';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function repoPath(){
 if(!githubReady())throw fail('GitHub 저장소 연결 설정이 필요합니다.',503);
 if(!/^[\w.-]+$/.test(env('GITHUB_OWNER'))||!/^[\w.-]+$/.test(env('GITHUB_REPO')))throw fail('GitHub 저장소 이름을 확인하세요.',503);
 return `/repos/${env('GITHUB_OWNER')}/${env('GITHUB_REPO')}`;
}
async function git(path,method='GET',body,allowMissing=false){
 const response=await fetch(`https://api.github.com${repoPath()}${path}`,{
  method,headers:{Authorization:`Bearer ${env('GITHUB_TOKEN')}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'ERU-Archive','Content-Type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)
 });
 if(allowMissing&&response.status===404)return null;
 if(!response.ok)throw fail(response.status===409||response.status===422?'저장소가 변경됐거나 브랜치 쓰기가 차단됐습니다. 작성 내용은 유지됩니다. 다른 창의 저장 여부와 브랜치 설정을 확인하세요.':`GitHub 연결 실패 (${response.status}). 저장소·브랜치·토큰 권한을 확인하세요.`,response.status===409||response.status===422?409:502);
 return response.status===204?null:response.json();
}
function validateArchive(value){
 if(!value||!Array.isArray(value.posts)||!value.settings||typeof value.settings!=='object')throw fail('저장소 콘텐츠 형식이 올바르지 않습니다.');
 return value;
}
export async function readArchive(){
 const ref=await git(`/git/ref/heads/${encodeURIComponent(env('GITHUB_BRANCH'))}`);
 const revision=ref.object.sha;
 const file=await git(`/contents/${ARCHIVE}?ref=${revision}`, 'GET',undefined,true);
 if(!file)return {revision,posts:[],settings:{}};
 if(file.encoding!=='base64'||typeof file.content!=='string')throw fail('콘텐츠 파일이 너무 큽니다. 저장소 정리가 필요합니다.');
 return {...validateArchive(JSON.parse(Buffer.from(file.content,'base64').toString('utf8'))),revision};
}
function signature(receipt){return createHmac('sha256',env('GITHUB_TOKEN')).update(`${receipt.path}\n${receipt.sha}`).digest('hex');}
function validReceipt(value){
 if(!value||!/^media\/uploads\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(value.path)||!/^[a-f0-9]{40}$/.test(value.sha)||!/^[a-f0-9]{64}$/.test(value.signature||''))return false;
 return timingSafeEqual(Buffer.from(value.signature,'hex'),Buffer.from(signature(value),'hex'));
}
function validMagic(bytes,type){
 if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(type==='image/webp')return bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(type==='image/gif')return ['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6));
 if(type==='video/mp4')return bytes.toString('ascii',4,8)==='ftyp';
 if(type==='video/webm')return bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
 return false;
}
export async function stageUpload(input){
 const ext=TYPES[input?.type];
 if(!ext||typeof input.content!=='string'||input.content.length>Math.ceil(MAX_FILE_BYTES/3)*4||!input.content.length||input.content.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.content))throw fail('지원 형식과 파일당 4MB 제한을 확인하세요.');
 const bytes=Buffer.from(input.content,'base64');
 if(!bytes.length||bytes.length>MAX_FILE_BYTES||bytes.toString('base64')!==input.content||!validMagic(bytes,input.type))throw fail('파일 형식 또는 4MB 제한을 확인하세요.');
 const blob=await git('/git/blobs','POST',{content:input.content,encoding:'base64'});
 const receipt={path:`media/uploads/${new Date().toISOString().slice(0,10)}/${randomUUID()}.${ext}`,sha:blob.sha};
 return {src:receipt.path,receipt:{...receipt,signature:signature(receipt)}};
}
function updateArchive(current,input){
 const next=structuredClone({posts:current.posts,settings:current.settings});
 if(['save-post','save-main'].includes(input.action)&&!next.settings.initialized)throw fail('먼저 기존 데이터 가져오기를 실행하세요.',409);
 if(input.action==='seed'){
  if(next.settings.initialized)throw fail('이미 초기 데이터를 가져왔습니다.',409);
  if(!Array.isArray(input.posts)||input.posts.length>100||!Array.isArray(input.media)||input.media.length>20)throw fail('초기 데이터 오류');
  next.posts=input.posts.map(value=>({id:value.id,status:'published',payload:validatePost(value),updated_at:new Date().toISOString()}));
  next.settings={...next.settings,initialized:true,mainMedia:input.media.map(media)};
 }else if(input.action==='save-post'){
  const post=validatePost(input.post);if(!['draft','published'].includes(input.status))throw fail('게시 상태 오류');
  next.posts=next.posts.filter(row=>row.id!==post.id);
  next.posts.unshift({id:post.id,status:input.status,payload:post,updated_at:new Date().toISOString()});
 }else if(input.action==='save-main'){
  if(!Array.isArray(input.media)||!input.media.length||input.media.length>20)throw fail('메인 미디어는 1~20개 등록하세요.');
  next.settings.mainMedia=input.media.map(media);
 }else if(input.action==='save-taxonomy'){
  const value=typeof input.value==='string'?input.value.trim():'';
  if(!['genre','other'].includes(input.group)||!value||value.length>100||value.includes(',')||value==='__new__')throw fail('구분값을 확인하세요.');
  next.settings.taxonomy={...next.settings.taxonomy,[input.group]:[...new Set([...(next.settings.taxonomy?.[input.group]||[]),value])]};
 }else throw fail('알 수 없는 요청');
 return next;
}
export async function saveArchive(input){
 const current=await readArchive();
 if(input.revision!==current.revision)throw fail('다른 창에서 내용이 변경됐습니다. 현재 작성 내용을 보관하고 목록을 새로고침한 후 다시 편집하세요.',409);
 const next=updateArchive(current,input);
 if(!Array.isArray(input.uploads||[])||(input.uploads||[]).length>150)throw fail('업로드 목록 오류');
 const text=JSON.stringify(next,null,2);if(Buffer.byteLength(text)>700000)throw fail('게시물 정보가 너무 큽니다. 저장소 정리가 필요합니다.');
 const uploads=(input.uploads||[]).map(receipt=>{if(!validReceipt(receipt))throw fail('업로드 정보가 올바르지 않습니다. 파일을 다시 추가하세요.');return receipt;}).filter(receipt=>text.includes(receipt.path));
 const parent=await git(`/git/commits/${current.revision}`);
 const tree=await git('/git/trees','POST',{base_tree:parent.tree.sha,tree:[{path:ARCHIVE,mode:'100644',type:'blob',content:text},...uploads.map(file=>({path:`public/${file.path}`,mode:'100644',type:'blob',sha:file.sha}))]});
 const commit=await git('/git/commits','POST',{message:`ERU: ${input.action}`,tree:tree.sha,parents:[current.revision]});
 await git(`/git/refs/heads/${encodeURIComponent(env('GITHUB_BRANCH'))}`,'PATCH',{sha:commit.sha,force:false});
 return {ok:true,revision:commit.sha,savedPaths:uploads.map(file=>file.path),deploymentPending:true};
}
