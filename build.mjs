import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import {posix, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicContent} from './public/js/publication.mjs';
import {photos as seedPosts} from './public/js/photos.js';
import {mainMedia as seedMain} from './public/js/site-config.js';
import {imageAssets} from './public/js/image-assets.js';

const archive = JSON.parse(await readFile(new URL('./content/archive.json', import.meta.url), 'utf8'));
const payload = publicContent(archive);
const dist = new URL('./dist/', import.meta.url);
const publicDir = new URL('./public/', import.meta.url);
const excluded = new Set([
  'archive',
  '_headers',
  'js/archive.mjs',
  'js/github-api.mjs',
  'js/publication.mjs',
  'js/validation.mjs'
]);

const usedMedia = new Set();
function includeMediaPath(value) {
  if (typeof value !== 'string' || !value) return;
  const path = posix.normalize(value.split(/[?#]/, 1)[0].replace(/^\/+/, ''));
  if (/^(images|media)\//.test(path)) usedMedia.add(path);
}
function includeSrcset(srcset) {
  for (const item of (srcset || '').split(',')) includeMediaPath(item.trim().split(/\s+/, 1)[0]);
}
for (const media of [
  ...[...archive.posts.map(row => row.payload), ...seedPosts].flatMap(post => post.images || []),
  ...(archive.settings.mainMedia || []),
  ...seedMain
]) {
  for (const key of ['src', 'thumb', 'detail', 'medium', 'original', 'poster']) includeMediaPath(media[key]);
  includeSrcset(media.srcset);
  includeSrcset(imageAssets[media.src]?.srcset);
}
const mediaDirectories = new Set(['images', 'media']);
for (const path of usedMedia) {
  for (let dir = posix.dirname(path); dir !== '.'; dir = posix.dirname(dir)) mediaDirectories.add(dir);
}

await rm(dist, {recursive: true, force: true});
await cp(publicDir, dist, {
  recursive: true,
  filter(source) {
    const path = relative(fileURLToPath(publicDir), source).split(sep).join('/');
    if (excluded.has(path) || /(?:^|\/)\.|\.(?:md|txt|map)$/i.test(path)) return false;
    if (/^(images|media)\//.test(path)) return mediaDirectories.has(path) || usedMedia.has(path);
    return true;
  }
});
await writeFile(new URL('content.json', dist), JSON.stringify(payload));
await writeFile(new URL('.nojekyll', dist), '');
console.log(`Built ERU Archive with ${payload.posts?.length ?? 0} published posts.`);
