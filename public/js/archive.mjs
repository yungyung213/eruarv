import {validatePost, media} from './validation.mjs';
import {appearance} from './appearance.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), {status});

export function updateArchive(current,input){
 const next=structuredClone({posts:current.posts,settings:current.settings,trash:current.trash||[]});
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
  next.settings.appearance=appearance(input.appearance??next.settings.appearance);
 }else if(input.action==='set-post-status'){
  if(!['published','private'].includes(input.status))throw fail('공개 상태를 확인하세요.');
  const row=next.posts.find(row=>row.id===input.id);if(!row)throw fail('게시물을 찾을 수 없습니다.',404);
  row.status=input.status;row.updated_at=new Date().toISOString();
 }else if(input.action==='delete-post'){
  const row=next.posts.find(row=>row.id===input.id);if(!row)throw fail('게시물을 찾을 수 없습니다.',404);
  next.posts=next.posts.filter(row=>row.id!==input.id);
  next.trash.unshift({...row,deleted_at:new Date().toISOString()});
 }else if(['rename-taxonomy','delete-taxonomy'].includes(input.action)){
  const group=input.group,old=typeof input.value==='string'?input.value.trim():'';
  const replacement=typeof input.replacement==='string'?input.replacement.trim():'';
  if(!['genre','other'].includes(group)||!old||old.length>100)throw fail('구분값을 확인하세요.');
  if(input.action==='rename-taxonomy'&&(!replacement||replacement.length>100||replacement.includes(',')||replacement==='__new__'))throw fail('새 이름을 확인하세요.');
  const rename=input.action==='rename-taxonomy';
  const known=[...(next.settings.taxonomy?.[group]||[]),...next.posts.flatMap(row=>group==='genre'?[row.payload.genre]:(row.payload.other||[]))];
  if(!known.includes(old))throw fail('이미 변경된 구분값입니다. 새로고침 후 확인하세요.',409);
  const transform=values=>[...new Set(values.flatMap(value=>value===old?(rename?[replacement]:[]):[value]).filter(Boolean))];
  next.settings.taxonomy={...next.settings.taxonomy,[group]:transform(known)};
  for(const row of [...next.posts,...next.trash]){
   if(group==='genre'&&row.payload.genre===old)row.payload.genre=rename?replacement:'';
   if(group==='other')row.payload.other=transform(row.payload.other||[]);
  }
 }else if(input.action==='save-taxonomy'){
  const value=typeof input.value==='string'?input.value.trim():'';
  if(!['genre','other'].includes(input.group)||!value||value.length>100||value.includes(',')||value==='__new__')throw fail('구분값을 확인하세요.');
  next.settings.taxonomy={...next.settings.taxonomy,[input.group]:[...new Set([...(next.settings.taxonomy?.[input.group]||[]),value])]};
 }else throw fail('알 수 없는 요청');
 return next;
}
