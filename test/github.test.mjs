import test from 'node:test';
import assert from 'node:assert/strict';
import {stageUpload,saveArchive,MAX_FILE_BYTES} from '../server/github.mjs';
import {publicContent} from '../server/publication.mjs';
import config from '../netlify/functions/config.mjs';
import upload from '../netlify/functions/upload-file.mjs';

const original=globalThis.fetch;
const environment={CONTENT_STORAGE:'github',GITHUB_OWNER:'owner',GITHUB_REPO:'archive',GITHUB_BRANCH:'main',GITHUB_TOKEN:'private-github-token',SUPABASE_URL:'https://auth.example',SUPABASE_PUBLIC_KEY:'public-key',ADMIN_USER_ID:'owner'};
async function fixture(run){Object.assign(process.env,environment);try{await run();}finally{globalThis.fetch=original;for(const key of Object.keys(environment))delete process.env[key];}}
const revision='a'.repeat(40),blobSha='b'.repeat(40);
const post={id:'post',date:'2026-11-01',images:[{src:'images/photo.png'}],colors:[]};
function fakeGit({refChanged=false}={}){
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):undefined;calls.push({path,method:options.method,body});
  if(path.endsWith('/git/blobs'))return Response.json({sha:blobSha});
  if(path.includes('/git/ref/heads/'))return Response.json({object:{sha:revision}});
  if(path.endsWith('/contents/content/archive.json'))return Response.json({encoding:'base64',content:Buffer.from(JSON.stringify({posts:[],settings:{initialized:true,mainMedia:[{src:'images/main.jpg'}],taxonomy:{genre:['LDS']}}})).toString('base64')});
  if(path.includes('/git/commits/'))return Response.json({tree:{sha:'tree-old'}});
  if(path.endsWith('/git/trees'))return Response.json({sha:'tree-new'});
  if(path.endsWith('/git/commits'))return Response.json({sha:'c'.repeat(40)});
  if(path.includes('/git/refs/heads/'))return refChanged?Response.json({message:'not fast forward'},{status:422}):Response.json({ref:'refs/heads/main'});
  throw new Error('Unexpected GitHub call '+path);
 };
 return calls;
}
test('GitHub config exposes no token and keeps upload limits explicit',()=>fixture(async()=>{
 const value=await (await config()).json();assert.equal(value.storage,'github');assert.equal(value.maxUploadBytes,MAX_FILE_BYTES);assert.equal(value.storageConfigured,true);assert.ok(!JSON.stringify(value).includes(environment.GITHUB_TOKEN));
}));
test('upload needs authorization before creating any GitHub blob',()=>fixture(async()=>{
 globalThis.fetch=async()=>{throw new Error('No fetch should occur');};
 assert.equal((await upload(new Request('http://local',{method:'POST',body:'{}'}))).status,401);
}));
test('upload validates bytes and size, stages a signed receipt without updating branch',()=>fixture(async()=>{
 const calls=fakeGit();
 await assert.rejects(()=>stageUpload({type:'image/png',content:Buffer.from('not png').toString('base64')}));
 await assert.rejects(()=>stageUpload({type:'image/png',content:'A'.repeat(Math.ceil(MAX_FILE_BYTES/3)*4+4)}));
 await assert.rejects(()=>stageUpload({type:'text/html',content:'YWJjZA=='}));
 const result=await stageUpload({type:'image/gif',content:Buffer.from('GIF89a-test').toString('base64')});
 assert.match(result.src,/^media\/uploads\//);assert.match(result.receipt.signature,/^[a-f0-9]{64}$/);assert.equal(calls.length,1);assert.ok(!JSON.stringify(result).includes(environment.GITHUB_TOKEN));
}));
test('save commits content and referenced media atomically; rejects forged paths',()=>fixture(async()=>{
 const calls=fakeGit();
 const file=await stageUpload({type:'image/gif',content:Buffer.from('GIF89a-test').toString('base64')});
 const input={action:'save-post',revision,status:'published',post:{...post,images:[{src:file.src}]},uploads:[file.receipt]};
 const saved=await saveArchive(input);assert.equal(saved.deploymentPending,true);assert.deepEqual(saved.savedPaths,[file.src]);
 const tree=calls.find(call=>call.path.endsWith('/git/trees')).body;
 assert.equal(tree.base_tree,'tree-old');assert.equal(tree.tree[0].path,'content/archive.json');assert.equal(tree.tree[1].path,'public/'+file.src);
 const ref=calls.find(call=>call.path.includes('/git/refs/heads/'));assert.equal(ref.body.force,false);
 const content=JSON.parse(tree.tree[0].content);assert.equal(content.settings.mainMedia[0].src,'images/main.jpg');assert.deepEqual(content.settings.taxonomy.genre,['LDS']);
 await assert.rejects(()=>saveArchive({...input,uploads:[{...file.receipt,path:'../escape'}]}));
}));
test('stale edit and branch race cannot overwrite newer content',()=>fixture(async()=>{
 let calls=fakeGit();
 await assert.rejects(()=>saveArchive({action:'save-post',revision:'old',status:'draft',post}),error=>error.status===409);
 assert.ok(!calls.some(call=>call.method==='PATCH'));
 calls=fakeGit({refChanged:true});
 await assert.rejects(()=>saveArchive({action:'save-post',revision,status:'draft',post}),error=>error.status===409);
 assert.equal(calls.filter(call=>call.method==='PATCH').length,1);
}));
test('public build excludes drafts, taxonomy and administrator-only archive details',()=>{
 const value=publicContent({posts:[{status:'draft',payload:{id:'secret-draft'}},{status:'published',payload:{id:'public'}}],settings:{initialized:true,taxonomy:{genre:['private-tag']},mainMedia:[{src:'images/main.jpg'}]}});
 assert.deepEqual(value.posts,[{id:'public'}]);assert.ok(!JSON.stringify(value).includes('secret-draft'));assert.ok(!JSON.stringify(value).includes('private-tag'));
});
