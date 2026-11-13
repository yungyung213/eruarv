import {appearance} from './appearance.mjs';

export function publicContent(archive){
 if(!Array.isArray(archive.posts)||!archive.settings)throw new Error('Invalid ERU archive');
 if(!archive.settings.initialized)return {configured:false};
 return {configured:true,posts:archive.posts.filter(row=>row.status==='published').map(row=>({...row.payload,uploadedAt:row.created_at||row.updated_at||row.payload.date})),settings:{initialized:!!archive.settings.initialized,mainMedia:archive.settings.mainMedia||[],appearance:appearance(archive.settings.appearance),categories:archive.settings.taxonomy?.genre||[],characters:archive.settings.taxonomy?.other||[]}};
}
