# ERU Archive · GitHub Pages

`yungyung213/eruarv`의 `main`을 기준으로 홈페이지와 어드민을 함께 배포합니다. 이 묶음에는 기준 커밋 `1dd7001`의 게시물 9개와 업로드 미디어가 포함되어 있습니다.

## 처음 한 번만 설정하기

1. **첫 Push 전에** Netlify의 **Project configuration → Developer settings → Continuous deployment → Repository → Manage repository → Unlink the current repository**에서 연결을 끊습니다. 그러면 이전 커밋과 이후 게시물 저장이 Netlify 배포를 시작하지 않습니다. [Netlify 저장소 연결 해제 안내](https://docs.netlify.com/build/git-workflows/repo-permissions-linking/#unlink-a-git-repository)
2. GitHub Desktop으로 기존 `yungyung213/eruarv` 저장소를 복제하거나, 이미 복제했다면 `main`에서 **Pull origin**을 실행합니다. 압축을 푼 폴더 **안의** 파일을 저장소 최상단에 복사합니다. macOS Finder에서 **⌘⇧.**을 누르면 자동 배포 파일이 들어 있는 숨김 폴더 `.github`가 보입니다. 최근 추가한 게시물이 있으면 복제한 저장소의 `content/`와 `public/media/`를 유지하세요. 그 외 기존 Netlify용 `netlify/`, `netlify.toml`, `server/`, `setup/`, `src/`, `test/`, `package-lock.json`, `GITHUB-SETUP-KO.md`, `SETUP-KO.md`, `PLANNED-CHANGES.md`는 이번 버전에서 제거할 수 있습니다. 저장소의 숨김 폴더 `.git`은 그대로 둡니다.
3. GitHub 저장소 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다. 저장소에 복사한 변경사항을 GitHub Desktop에서 **Commit to main → Push origin**으로 올립니다. [GitHub Pages 배포 방식 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
4. 저장소 **Actions → Publish ERU Archive**에서 성공 여부를 확인합니다. Push 전에 Pages를 설정하지 않았다면 설정을 마치고 **Run workflow**를 한 번 누릅니다.

## 사이트와 어드민 사용하기

- 홈페이지는 [GitHub Pages](https://yungyung213.github.io/eruarv/)에 열립니다.
- 게시물 관리는 [어드민](https://yungyung213.github.io/eruarv/admin.html)에서 합니다.
- GitHub의 **Fine-grained personal access tokens**에서 `eruarv`만 선택하고 저장소 **Contents → Read and write**를 부여한 토큰을 어드민의 **GitHub token**에 붙여넣고 **Connect**를 누릅니다. 기존에 보관한 유효한 토큰에 같은 권한이 있다면 그대로 사용할 수 있습니다. 어드민용 토큰은 게시물 저장에만 필요합니다. [GitHub 토큰 안내](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- 토큰은 브라우저 메모리에만 남습니다. 새로고침하거나 창을 닫으면 다시 연결합니다. 토큰 값을 저장소 파일에 넣거나 채팅으로 보내지 마세요.
- 사진과 글을 저장하면 한 커밋으로 올라갑니다. GitHub Actions 배포가 끝난 뒤 홈페이지를 새로고침하면 새 게시물이 보입니다. 저장 이후의 배포 상태는 저장소 **Actions**에서 확인할 수 있습니다.
- 임시 저장과 비공개는 홈페이지 목록에서 글을 숨깁니다. 공개 GitHub 저장소의 파일과 이력에서는 글이나 사진을 볼 수 있으므로 민감한 자료는 올리지 마세요.

로컬 빌드는 Node.js 22 이상에서 `npm run build`를 실행합니다. 배포할 파일은 `dist/`에 생성됩니다.
