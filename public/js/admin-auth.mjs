const endpoint = 'https://iclrraqcwuctgiqqdxst.supabase.co/functions/v1/eru-admin';
const extensions = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm'
};
export const maxUploadBytes = 4 * 1024 * 1024;

async function request(action, accessToken, body) {
  const response = await fetch(endpoint + '?action=' + action, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(45000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '어드민 서버 연결을 확인하세요.');
  return result;
}

export async function signIn(username, password) {
  const result = await request('login', null, {username, password});
  if (!result.accessToken) throw new Error('로그인 응답을 확인하세요.');
  return result.accessToken;
}

export function adminConnection(accessToken) {
  const staged = new WeakMap();
  return {
    readArchive: () => request('archive', accessToken),
    async saveArchive(input, revision, pendingUploads) {
      const references = new Set(
        [...(input.post?.images || []), ...(input.media || [])]
          .flatMap(media => [media.src, media.original, media.thumb, media.detail, media.medium, media.poster])
      );
      const uploads = [];
      const replacements = new Map();
      for (const [path, blob] of pendingUploads) {
        if (!references.has(path)) continue;
        let receipt = staged.get(blob);
        if (!receipt) {
          const content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
            reader.readAsDataURL(blob);
          });
          const result = await request('upload', accessToken, {type: blob.type, content});
          receipt = result.receipt;
          staged.set(blob, receipt);
        }
        uploads.push(receipt);
        replacements.set(path, receipt.path);
      }
      const replaceMediaPaths = (key, value) => {
        if (replacements.has(value)) return replacements.get(value);
        if (key === 'srcset' && typeof value === 'string') {
          return value.split(',').map(item => {
            const [path, size] = item.trim().split(/\s+/, 2);
            return `${replacements.get(path) || path} ${size || ''}`.trim();
          }).join(', ');
        }
        return value;
      };
      const prepared = JSON.parse(JSON.stringify(input, replaceMediaPaths));
      const result = await request('save', accessToken, {...prepared, revision, uploads});
      const saved = new Set(result.savedPaths);
      const savedReplacements = [...replacements].filter(([, path]) => saved.has(path));
      return {...result, savedPaths: savedReplacements.map(([local]) => local), savedReplacements};
    }
  };
}

export function uploadPath(blob) {
  const ext = extensions[blob.type];
  if (!ext || !blob.size || blob.size > maxUploadBytes) {
    throw new Error('지원 형식과 파일당 4MB 제한을 확인하세요.');
  }
  return `media/uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
}
