import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import {relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicContent} from './public/js/publication.mjs';

const archive = JSON.parse(await readFile(new URL('./content/archive.json', import.meta.url), 'utf8'));
const payload = publicContent(archive);
const dist = new URL('./dist/', import.meta.url);
const publicDir = new URL('./public/', import.meta.url);
const excluded = new Set([
  'archive',
  'js/archive.mjs',
  'js/github-api.mjs',
  'js/publication.mjs',
  'js/validation.mjs'
]);

await rm(dist, {recursive: true, force: true});
await cp(publicDir, dist, {
  recursive: true,
  filter: source => !excluded.has(relative(fileURLToPath(publicDir), source).split(sep).join('/'))
});
await writeFile(new URL('content.json', dist), JSON.stringify(payload));
await writeFile(new URL('.nojekyll', dist), '');
console.log(`Built ERU Archive with ${payload.posts?.length ?? 0} published posts.`);
