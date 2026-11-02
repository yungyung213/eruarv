import {publicContent} from './server/publication.mjs';
import {cp,rm,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('dist',{recursive:true,force:true});await cp('public','dist',{recursive:true});
await build({entryPoints:['src/admin.js'],outfile:'dist/js/admin.js',bundle:true,format:'esm',target:['es2022'],minify:true});

let archive;
try{archive=JSON.parse(await readFile('content/archive.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(archive){
 await writeFile('dist/content.json',JSON.stringify(publicContent(archive)));
}else await writeFile('dist/content.json',JSON.stringify({configured:false}));
