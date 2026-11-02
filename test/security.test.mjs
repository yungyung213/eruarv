import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePost,media} from '../server/validation.mjs';
import {authorize} from '../server/core.mjs';
import config from '../netlify/functions/config.mjs';
import admin from '../netlify/functions/admin-data.mjs';
const post={id:'example',date:'2026-11-01',images:[{src:'images/photo.png'}],colors:['#ffffff']};
test('valid mixed media and invalid metadata',()=>{assert.equal(validatePost(post).images[0].type,'image');assert.equal(media({src:'https://cdn.example/v.mp4',type:'video'}).type,'video');for(const invalid of [{...post,id:'../x'},{...post,images:[]},{...post,colors:['red']},{...post,thxUrl:'javascript:alert(1)'}])assert.throws(()=>validatePost(invalid));assert.throws(()=>media({src:'javascript:alert(1)'}));});
test('config never contains R2 credentials',async()=>{process.env.R2_SECRET_ACCESS_KEY='private-test-value';const response=await config();assert.ok(!(await response.text()).includes('private-test-value'));delete process.env.R2_SECRET_ACCESS_KEY;});
test('unconfigured mutation is denied',async()=>{const response=await admin(new Request('http://local',{method:'POST',body:'{}'}));assert.equal(response.status,503);});
test('server checks current user and owner id',async()=>{
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_PUBLIC_KEY='test-key';process.env.ADMIN_USER_ID='owner';const original=globalThis.fetch;
 try{
 await assert.rejects(()=>authorize(new Request('http://local')),e=>e.status===401);
 globalThis.fetch=async()=>Response.json({id:'someone-else'});await assert.rejects(()=>authorize(new Request('http://local',{headers:{Authorization:'Bearer token'}})),e=>e.status===403);
 globalThis.fetch=async()=>Response.json({id:'owner'});assert.equal(await authorize(new Request('http://local',{headers:{Authorization:'Bearer valid'}})),'valid');
 globalThis.fetch=async()=>new Response(null,{status:401});await assert.rejects(()=>authorize(new Request('http://local',{headers:{Authorization:'Bearer expired'}})),e=>e.status===401);
 }finally{globalThis.fetch=original;for(const key of ['SUPABASE_URL','SUPABASE_PUBLIC_KEY','ADMIN_USER_ID'])delete process.env[key];}
});
test('R2 signing denies unsupported types and expires after 5 minutes',async()=>{
 const {default:upload}=await import('../netlify/functions/upload-url.mjs');const original=globalThis.fetch;
 const values={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLIC_KEY:'public-key',ADMIN_USER_ID:'owner',R2_ACCOUNT_ID:'testaccount',R2_ACCESS_KEY_ID:'testid',R2_SECRET_ACCESS_KEY:'testsecret',R2_BUCKET:'test-bucket',R2_PUBLIC_URL:'https://media.example'};Object.assign(process.env,values);globalThis.fetch=async()=>Response.json({id:'owner'});
 const request=data=>new Request('http://local',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify(data)});
 try{assert.equal((await upload(request({type:'text/html',size:100}))).status,400);assert.equal((await upload(request({type:'image/jpeg',size:300*1024*1024}))).status,400);
 const response=await upload(request({type:'image/webp',size:1000}));assert.equal(response.status,200);const data=await response.json();const url=new URL(data.url);assert.equal(url.searchParams.get('X-Amz-Expires'),'300');assert.ok(data.src.startsWith('https://media.example/uploads/'));assert.ok(!JSON.stringify(data).includes('testsecret'));
 }finally{globalThis.fetch=original;Object.keys(values).forEach(key=>delete process.env[key]);}
});
test('new taxonomy retains existing settings and deduplicates values',async()=>{
 const original=globalThis.fetch;let saved;
 Object.assign(process.env,{SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLIC_KEY:'key',ADMIN_USER_ID:'owner'});
 globalThis.fetch=async(url,options={})=>{if(String(url).includes('/auth/'))return Response.json({id:'owner'});if(options.method==='POST'){saved=JSON.parse(options.body);return Response.json([saved]);}return Response.json([{payload:{initialized:true,mainMedia:[{src:'images/main.jpg'}],taxonomy:{genre:['LDS'],other:['ERU']}}}]);};
 const req=value=>new Request('http://local',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify(value)});
 try{
  assert.equal((await admin(req({action:'save-taxonomy',group:'genre',value:' LDS '}))).status,200);assert.deepEqual(saved.payload.taxonomy.genre,['LDS']);assert.deepEqual(saved.payload.taxonomy.other,['ERU']);assert.equal(saved.payload.mainMedia[0].src,'images/main.jpg');assert.equal(saved.payload.initialized,true);
  assert.equal((await admin(req({action:'save-taxonomy',group:'invalid',value:'new'}))).status,400);
  assert.equal((await admin(req({action:'save-taxonomy',group:'genre',value:'bad,value'}))).status,400);
 }finally{globalThis.fetch=original;for(const key of ['SUPABASE_URL','SUPABASE_PUBLIC_KEY','ADMIN_USER_ID'])delete process.env[key];}
});
