# Settle Up

다중 통화 여행 정산을 위한 정적 웹/PWA 서비스입니다.

## 브라우저 회귀 테스트

테스트는 로컬 정적 서버와 가짜 Supabase 클라이언트를 사용합니다. 운영 Supabase에는 연결하거나 데이터를 쓰지 않습니다. 테스트 중 `insert`, `update`, `upsert`, `delete` 또는 허용하지 않은 RPC가 호출되면 즉시 실패합니다.

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

개별 환경만 확인할 수도 있습니다.

```bash
npm run test:e2e:desktop
npm run test:e2e:mobile
```

현재 자동 검증 범위:

- 로그인 전 소개 화면과 로그인 폼 전환
- 시스템 다크 모드 적용
- 모바일 헤더 로고/버전/로그인 메뉴 겹침 방지
- 비로그인 초대 링크의 읽기 전용 UI
- 지출일자 및 금액 정렬
- 로그인 유도 CTA가 DB를 변경하지 않는지 확인

Pull Request와 `main` 브랜치 배포 전 GitHub Actions에서 Chromium 데스크톱/모바일 테스트가 실행됩니다.

## 데이터베이스 보안 테스트

`supabase/`는 운영 프로젝트와 연결되지 않은 로컬 전용 Supabase 환경입니다.
Docker Desktop을 실행한 뒤 아래 명령으로 RLS와 RPC 권한을 검증합니다.

```bash
npm run db:start:test
npm run db:reset:test
npm run test:db
npm run db:stop
```

현재 자동 검증 범위:

- 모든 앱 테이블의 RLS 활성화
- 비로그인 사용자의 정산방, 지출, 멤버, 채팅 테이블 직접 접근 차단
- 공개 초대 미리보기 RPC의 허용 필드와 읽기 전용 동작
- 회원 탈퇴, 멤버 내보내기, PIN RPC의 익명 실행 차단
- 방장, 참여자, 외부 사용자, 신규 참여자, 퇴장 사용자의 권한 경계
- `profiles.admin_pin` 직접 조회·수정 차단

중요: 로컬 기준선을 운영 DB와 별도로 검증하는 단계입니다. 검토 없이
`supabase link`, `supabase db push`, `supabase migration up --linked`를 실행하지 마세요.
