import {githubMode,readArchive,saveArchive} from '../../server/github.mjs';
import {authorize,db,json,handler,body} from '../../server/core.mjs';
import {validatePost,media} from '../../server/validation.mjs';
export default handler(async request=>{
 const token=await authorize(request);
 if(githubMode()){if(request.method==='GET')return json(await readArchive());if(request.method!=='POST')return json({error:'Method not allowed'},405);return json(await saveArchive(await body(request)));}
 if(request.method==='GET'){const [posts,settings]=await Promise.all([db('eru_posts?select=*&order=updated_at.desc',{token}),db('eru_site?id=eq.1&select=payload',{token})]);return json({posts,settings:settings[0]?.payload||{}});}
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const input=await body(request);
 if(['save-post','save-main'].includes(input.action)){const state=await db('eru_site?id=eq.1&select=payload',{token});if(!state[0]?.payload.initialized)return json({error:'먼저 기존 데이터 가져오기를 실행하세요.'},409);}
 if(input.action==='save-taxonomy'){
  if(!['genre','other'].includes(input.group)||typeof input.value!=='string')throw new Error('구분값 오류');
  const value=input.value.trim();if(!value||value.length>100||value.includes(',')||value==='__new__')throw new Error('구분값은 100자 이내, 쉼표 없이 입력하세요.');
  const site=await db('eru_site?id=eq.1&select=payload',{token}),payload=site[0]?.payload||{};
  const taxonomy={...payload.taxonomy,[input.group]:[...new Set([...(payload.taxonomy?.[input.group]||[]),value])]};
  await db('eru_site?on_conflict=id',{token,method:'POST',body:{id:1,payload:{...payload,taxonomy}}});return json({taxonomy});
 }
 if(input.action==='save-post'){
  const post=validatePost(input.post);if(!['draft','published'].includes(input.status))throw new Error('게시 상태 오류');
  return json(await db('eru_posts?on_conflict=id',{token,method:'POST',body:{id:post.id,status:input.status,payload:post,updated_at:new Date().toISOString()}}));
 }
 if(input.action==='save-main'){
  if(!Array.isArray(input.media)||!input.media.length||input.media.length>20)throw new Error('메인 미디어는 1~20개 등록하세요.');
  const existing=await db('eru_site?id=eq.1&select=payload',{token});
  return json(await db('eru_site?on_conflict=id',{token,method:'POST',body:{id:1,payload:{...existing[0]?.payload,mainMedia:input.media.map(media)}}}));
 }
 if(input.action==='seed'){
  const existing=await db('eru_site?id=eq.1&select=payload',{token});if(existing[0]?.payload.initialized)return json({error:'이미 초기 데이터를 가져왔습니다.'},409);
  if(!Array.isArray(input.posts)||input.posts.length>100)throw new Error('초기 데이터 오류');
  for(const value of input.posts){const post=validatePost(value);const found=await db(`eru_posts?id=eq.${encodeURIComponent(post.id)}&select=id`,{token});if(!found.length)await db('eru_posts',{token,method:'POST',body:{id:post.id,status:'published',payload:post}});}
  await db('eru_site?on_conflict=id',{token,method:'POST',body:{id:1,payload:{...existing[0]?.payload,initialized:true,mainMedia:(input.media||[]).map(media)}}});return json({ok:true});
 }
 return json({error:'알 수 없는 요청'},400);
});
