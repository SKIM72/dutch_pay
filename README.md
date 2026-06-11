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
