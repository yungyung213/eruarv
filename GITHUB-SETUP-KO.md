# ERU V16 — GitHub 연결

기존 Supabase 프로젝트/로그인 사용자/관리자 UID를 그대로 사용합니다. 기존 DB 테이블은 남겨도 됩니다. GitHub 모드에서는 Supabase로 로그인만 인증합니다.

## 1. 저장소에 소스 올리기

대상: https://github.com/yungyung213/eruarv

비공개 저장소를 권장합니다. 공개 저장소라면 임시 저장 글도 저장소와 Git 이력에서 공개됩니다.

ZIP을 압축 해제하고 package.json, public, server, src, netlify, build.mjs 등이 저장소 최상위에 오도록 올립니다. ZIP 자체나 바깥 포장 폴더를 올리지 않습니다. node_modules, dist, .env, 비밀 키는 올리지 않습니다. GitHub 웹 파일 업로드로 소스를 올릴 수 있습니다. 빈 저장소는 첫 커밋이 있어야 저장 API가 작동합니다. 기본 브랜치가 main인지 확인하세요.

## 2. 기존 Netlify 사이트에 Git 연결

기존 ERU 사이트에 위 저장소를 연결합니다. 새 사이트를 만들 필요가 없습니다.

- Base directory: 비움
- Build command: npm run build
- Publish directory: dist
- Functions: netlify/functions (netlify.toml에 포함)
- Node.js: 22 이상

정적 폴더 드래그 배포만으로는 어드민 서버 기능이 작동하지 않습니다. main에 커밋하면 Netlify가 자동 빌드/배포하도록 연결해야 합니다.

## 3. Netlify 환경변수

서버 함수 설정에 다음 값을 입력합니다. 비밀 키/비밀번호를 채팅이나 소스 파일에 붙이지 않습니다.

```text
CONTENT_STORAGE=github
SUPABASE_URL=기존 Supabase 프로젝트 URL
SUPABASE_PUBLIC_KEY=Supabase publishable 또는 anon key
ADMIN_USER_ID=관리자로 등록한 Supabase 사용자 UID
GITHUB_OWNER=yungyung213
GITHUB_REPO=eruarv
GITHUB_BRANCH=main
GITHUB_TOKEN=해당 저장소에 한정된 비공개 토큰
```

GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens에서 eruarv 저장소 하나만 선택합니다. Repository permissions의 Contents: Read and write만 추가하고 기본 Metadata 읽기 권한은 유지합니다. 만료일을 지정하고 만료되면 Netlify 값을 갱신합니다. 토큰은 Netlify Functions 범위에 저장하며 브라우저로 전달하지 않습니다. 환경변수 설정 후 재배포합니다.

## 4. 처음 사용

/admin.html → 기존 Supabase 이메일/비밀번호로 로그인 → 기존 데이터 가져오기 (1회) → 업로드/편집.

파일 추가 후 임시 저장 또는 게시를 눌러야 브랜치에 반영됩니다. 콘텐츠와 해당 파일을 하나의 커밋으로 기록하므로 파일마다 배포하지 않습니다. 임시 저장/새 구분값 저장도 Git 커밋이므로 Netlify 빌드를 발생시킬 수 있습니다.

GitHub 저장 완료와 Netlify 배포 완료는 다릅니다. 최종 배포 여부는 Netlify Deploys에서 확인합니다.

## 범위와 제한

- GIF/MP4/WebM 파일당 4MB 이하. 큰 파일의 분할/재개/재인코딩은 미구현입니다.
- 사진은 먼저 최적화합니다. 원본 4MB 이하는 별도 보관하며, 초과 원본은 GitHub에 올리지 않고 최적화본만 저장합니다. 최적화 후에도 4MB를 넘으면 안내하고 중단합니다.
- 임시 저장 글은 갤러리와 content.json에서 제외합니다. 단, 미디어는 랜덤 경로로 public에 기록하므로 배포 후 URL을 아는 사람은 볼 수 있습니다. 비밀 파일 보관용이 아닙니다.
- 제거한 파일과 과거 커밋은 자동 삭제하지 않으며 Git 이력에 미디어가 남습니다.
- 다른 창이 먼저 저장하면 충돌을 알립니다. 작성 내용을 따로 보관하고 목록을 새로고침하여 편집해야 합니다. 자동 병합/복구는 없습니다.
- 저장소 메타데이터가 약 700KB를 넘으면 정리를 안내합니다.
- 토큰 만료/권한 부족/브랜치 보호 시 저장이 차단됩니다.
- GitHub/Netlify 사용량과 빌드 한도는 별도입니다. 무제한 무료를 보장하지 않습니다.
- 노이즈 ON/OFF와 블로그형 추가 개편은 예정 항목입니다. 현재 메인 입자 효과는 정지 이미지 샘플링입니다. 영상/GIF 본래 재생은 갤러리에서 지원합니다.
- 기존 YouTube 음원 재생 불가는 미해결입니다.

## 검증

로컬 단위/모의 API 테스트와 빌드만 수행했습니다. 실제 계정 연결/배포는 하지 않았습니다. 연결 후 사진/GIF/영상 추가 → 임시 저장 비노출 → 게시 → 배포 반영을 확인해야 합니다.

공식 문서:

- https://docs.github.com/en/rest/git/trees
- https://docs.github.com/en/rest/git/blobs
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- https://docs.netlify.com/build/functions/configuration/
