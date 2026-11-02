export function publicContent(archive){
 if(!Array.isArray(archive.posts)||!archive.settings)throw new Error('Invalid ERU archive');
 if(!archive.settings.initialized)return {configured:false};
 return {configured:true,posts:archive.posts.filter(row=>row.status==='published').map(row=>row.payload),settings:{initialized:!!archive.settings.initialized,mainMedia:archive.settings.mainMedia||[]}};
}
