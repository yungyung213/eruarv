import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import {publicContent} from './public/js/publication.mjs';

const archive = JSON.parse(await readFile(new URL('./content/archive.json', import.meta.url), 'utf8'));
const payload = publicContent(archive);
const dist = new URL('./dist/', import.meta.url);
await rm(dist, {recursive: true, force: true});
await cp(new URL('./public/', import.meta.url), dist, {recursive: true});
await writeFile(new URL('content.json', dist), JSON.stringify(payload));
await writeFile(new URL('.nojekyll', dist), '');
console.log(`Built ERU Archive with ${payload.posts?.length ?? 0} published posts.`);
