import {updateArchive} from './archive.mjs';
import {TYPES} from './validation.mjs';

const owner = 'yungyung213';
const repository = 'eruarv';
const branch = 'main';
const archivePath = 'content/archive.json';
const repoPath = `/repos/${owner}/${repository}`;
export const maxUploadBytes = 4 * 1024 * 1024;

export function githubConnection(token) {
  async function request(path, {method = 'GET', body, allowMissing = false} = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30000)
    });
    if (allowMissing && response.status === 404) return null;
    if (response.status === 409 || response.status === 422) {
      throw new Error('저장소에 새 변경이 생겼거나 브랜치 쓰기가 제한되어 있습니다. 입력한 내용은 유지됩니다.');
    }
    if (!response.ok) {
      throw new Error(`GitHub 요청 실패 (${response.status}). 토큰의 만료일과 eruarv 저장소의 Contents 쓰기 권한을 확인하세요.`);
    }
    return response.json();
  }

  async function readArchive() {
    const ref = await request(`${repoPath}/git/ref/heads/${branch}`);
    const revision = ref.object.sha;
    const file = await request(`${repoPath}/contents/${archivePath}?ref=${revision}`, {allowMissing: true});
    if (!file) return {revision, posts: [], settings: {}};
    if (file.encoding !== 'base64' || typeof file.content !== 'string') {
      throw new Error('GitHub에서 게시물 파일을 읽을 수 없습니다.');
    }
    const bytes = Uint8Array.from(atob(file.content), character => character.charCodeAt(0));
    const archive = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(archive.posts) || !archive.settings || typeof archive.settings !== 'object') {
      throw new Error('저장소의 게시물 파일 형식이 올바르지 않습니다.');
    }
    return {...archive, revision};
  }

  async function saveArchive(input, revision, pendingUploads) {
    const current = await readArchive();
    if (revision !== current.revision) {
      throw new Error('다른 창에서 변경사항을 저장했습니다. 현재 입력 내용을 보관하고 목록을 다시 열어 주세요.');
    }

    const next = updateArchive(current, input);
    const content = JSON.stringify(next, null, 2) + '\n';
    if (new TextEncoder().encode(content).length > 700000) {
      throw new Error('게시물 정보 파일의 크기 제한을 초과했습니다.');
    }
    const referencedPaths = new Set(
      [...next.posts.flatMap(row => row.payload.images), ...(next.settings.mainMedia || [])]
        .flatMap(media => [media.src, media.original, media.thumb, media.detail, media.medium, media.poster])
    );
    const treeEntries = [{path: archivePath, mode: '100644', type: 'blob', content}];
    const savedPaths = [];
    for (const [path, blob] of pendingUploads) {
      if (!referencedPaths.has(path)) continue;
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
        reader.readAsDataURL(blob);
      });
      const result = await request(`${repoPath}/git/blobs`, {
        method: 'POST', body: {content: encoded, encoding: 'base64'}
      });
      treeEntries.push({path: `public/${path}`, mode: '100644', type: 'blob', sha: result.sha});
      savedPaths.push(path);
    }
    const parent = await request(`${repoPath}/git/commits/${current.revision}`);
    const tree = await request(`${repoPath}/git/trees`, {
      method: 'POST', body: {base_tree: parent.tree.sha, tree: treeEntries}
    });
    const commit = await request(`${repoPath}/git/commits`, {
      method: 'POST', body: {message: `ERU: ${input.action}`, tree: tree.sha, parents: [current.revision]}
    });
    await request(`${repoPath}/git/refs/heads/${branch}`, {
      method: 'PATCH', body: {sha: commit.sha, force: false}
    });
    return {...next, revision: commit.sha, savedPaths};
  }

  return {
    async verify() {
      const [user, repo] = await Promise.all([request('/user'), request(repoPath)]);
      if (user.login.toLowerCase() !== owner || repo.permissions?.push === false) {
        throw new Error('eruarv 저장소 소유자의 쓰기 권한이 필요합니다.');
      }
    },
    readArchive,
    saveArchive
  };
}

export function uploadPath(blob) {
  const extension = TYPES[blob.type];
  if (!extension || !blob.size || blob.size > maxUploadBytes) {
    throw new Error('지원 형식과 파일당 4MB 제한을 확인하세요.');
  }
  const date = new Date().toISOString().slice(0, 10);
  return `media/uploads/${date}/${crypto.randomUUID()}.${extension}`;
}
