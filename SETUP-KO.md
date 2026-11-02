# ERU 어드민 V14 — 연결 가이드

**이 문서는 R2 방식의 이전 안내입니다. V16 GitHub 연결은 GITHUB-SETUP-KO.md를 사용하세요.**

**이 버전은 서버 기능이 포함된 소스 프로젝트입니다. 기존처럼 정적 ZIP을 Netlify에 드래그하는 방식으로는 로그인·업로드가 작동하지 않습니다.**
기존 Netlify 사이트에 Git 저장소를 연결해 빌드하거나, Netlify CLI에서 build 후 functions와 dist를 함께 배포해야 합니다.

현재: 화면/연결 코드/테스트/빌드 완료. 실제 Supabase·R2 계정 생성과 실서비스 연동 검증은 미완료입니다.

## 1. Supabase

1. https://supabase.com/dashboard 에서 가입하고 프로젝트 1개를 만듭니다.
2. SQL Editor에서 setup/schema.sql을 1회 실행합니다.
3. Authentication에서 관리자 이메일/비밀번호 사용자를 1명 만듭니다. 공개 회원가입은 사용하지 않습니다.
4. 해당 사용자 UUID로 schema.sql 맨 아래의 eru_admins insert 예문을 실행합니다.
5. 프로젝트 URL, public(anon/publishable) key, 관리자 UUID를 Netlify의 환경변수에 입력합니다.
   SUPABASE_URL, SUPABASE_PUBLIC_KEY, ADMIN_USER_ID
   ADMIN_USER_ID는 eru_admins에 등록한 UUID와 같아야 합니다. service-role key는 필요하지 않습니다.

## 2. Cloudflare R2

1. https://dash.cloudflare.com 에서 R2 버킷 1개를 만듭니다.
2. 사이트 이미지가 조회될 공개 URL을 연결합니다. R2_PUBLIC_URL에는 업로드 파일 경로를 붙이기 전의 https 주소를 넣습니다.
3. 해당 버킷에 한정된 Object Read/Write S3 API 토큰을 발급합니다.
4. setup/r2-cors.json의 AllowedOrigins를 실제 사이트 주소와 일치시켜 버킷 CORS에 적용합니다.
   로컬 테스트 때는 사용하는 로컬 서버 origin도 추가합니다.
5. 다음을 Netlify의 Functions 범위 환경변수에 저장합니다.
   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
   R2_SECRET_ACCESS_KEY는 서버 함수에서만 사용하며 어드민 브라우저 코드에는 포함되지 않습니다.

## 3. 배포

Node.js 22 이상 환경에서:

    npm ci
    npm test
    npm run build

Netlify Git 배포 설정: build command = npm run build, publish directory = dist
함수 위치는 netlify.toml에 지정되어 있습니다.
CLI를 사용할 경우 프로젝트 루트에서 기존 사이트에 link한 뒤 Netlify CLI의 build/deploy를 사용합니다.
로컬 함수 테스트는 Netlify CLI의 netlify dev를 사용합니다. 일반 정적 서버에서는 연결 전 미리보기만 표시됩니다.

계정/환경변수를 연결한 뒤 /admin.html에 접속합니다.
로그인 → 기존 데이터 가져오기 → 기존 게시물 4개 및 메인 5장 확인 → 업로드/편집 → 임시 저장 또는 게시.
초기 데이터 가져오기 전에는 게시/메인 저장이 차단됩니다. 이관은 기존 정적 이미지를 그대로 참조하며 R2로 중복 업로드하지 않습니다.

## 사용 범위

- 관리자 이메일/비밀번호 로그인, 서버 권한 확인 + DB RLS
- 이미지/GIF/MP4/WebM 여러 파일 업로드, 미디어 설명/순서 변경/목록에서 제거
- 정지 이미지는 원본 보존 + 최대폭 2400/640 WebP 생성 (원본 이상 확대하지 않음)
- GIF는 원본 유지, 동영상은 원본 전송. 동영상 포스터 URL 입력 가능
- 날짜/카테고리/캐릭터/팔레트/크레딧 편집, 임시 저장/게시
- 메인 슬라이드 파일 업로드, 순서 변경, 사이트 적용
- 게시된 데이터는 사이트 새로고침 시 반영. 카테고리/캐릭터 필터도 자동 갱신

정지 이미지의 압축 처리는 어드민 브라우저에서 수행합니다. GIF 용량 압축과 영상 재인코딩은 포함하지 않습니다.
동영상은 파일당 200MB까지 전송하도록 제한한 첫 버전입니다. 대용량 분할 업로드/재개 기능은 포함하지 않습니다.
업로드 후 저장하지 않은 파일이나 목록에서 제거한 파일은 R2에서 자동 삭제하지 않습니다.
R2 파일은 공개 미디어입니다. 임시 저장은 게시물을 갤러리 목록에 노출하지 않는 기능입니다.
현재는 한 명의 관리자를 기준으로 하며, 동시 편집 충돌 병합 기능은 없습니다.

## 검증과 남은 작업

로컬: 서버 권한 거부/잘못된 입력/서명 URL 만료/키 비노출 테스트 통과, 빌드 통과.
PC/모바일: 연결 전 화면, 미리보기, 게시물 선택, 미디어 순서 변경, 메인 목록, 저장 비활성 상태 검증.
아직 실계정이 없어 실제 로그인, R2 업로드, Supabase RLS 실환경 테스트는 수행하지 않았습니다.
실연결 후 이미지/GIF/동영상 1개씩 업로드 → 임시 저장 비노출 → 게시 후 표시 → 메인 변경을 확인해야 합니다.

기존 음악 링크의 YouTube 재생 불가 상태는 이번 작업으로 변경되지 않았습니다.

공식 참고:
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/buckets/cors/
- https://docs.netlify.com/build/functions/get-started/

V11: 업로드와 편집은 admin-editor.html 별도 창에서 진행합니다. 브라우저가 팝업을 막으면 해당 사이트의 새 창 열기를 허용해야 합니다. 모바일에서는 브라우저에 따라 새 탭으로 열립니다.

V12 구분값: 카테고리/캐릭터 목록 첫 항목 + 새로 만들기에서 추가합니다. 새 값은 eru_site.payload.taxonomy에 저장되므로 SQL 변경은 필요 없습니다. 현재 게시물에서 사용 중인 값도 자동 합칩니다. 팔레트 9색은 public/js/palette.js에서 공통 관리합니다. 기존 검정 값은 응답 전까지 임의 변환하지 않고 보존합니다.

V13 확정 팔레트: 빨강/주황/노랑/초록/파랑/남색/보라/흰색/회색/검정 (10색). 기존 검정 보존 질문은 해결되었으며, 앞 버전의 9색/기존 검정 별도 처리 안내를 대체합니다.
