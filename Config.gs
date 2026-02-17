/**
 * Config.gs — 설정값 모음
 * 이 파일만 수정하면 바로 사용 가능합니다.
 */

const CONFIG = {
  // ===== 스프레드시트 설정 =====
  SPREADSHEET_ID: '',  // 비워두면 현재 바인딩된 시트 사용
  SHEET_NAME: '가격모니터링',

  // ===== 모니터링 대상 URL =====
  // URL과 CSS 셀렉터 또는 정규식으로 가격 추출
  TARGETS: [
    {
      name: '경쟁사A - 상품1',
      url: 'https://example.com/product/123',
      // 가격 추출 방식: 'regex' 또는 'xpath'
      method: 'regex',
      // regex: HTML에서 가격 패턴 매칭 (기본: 숫자,콤마 패턴)
      pattern: '([0-9,]+)\\s*원',
      // xpath: IMPORTXML용 (method를 'xpath'로 변경 시)
      xpath: '',
    },
    {
      name: '경쟁사B - 상품1',
      url: 'https://example.com/product/456',
      method: 'regex',
      pattern: '"price":\\s*([0-9,]+)',
      xpath: '',
    },
  ],

  // ===== 알림 설정 =====
  ALERT_ENABLED: true,
  ALERT_EMAIL: '',  // 비워두면 스크립트 실행자 이메일로 발송
  // 가격 변동률(%) 이상일 때 알림
  ALERT_THRESHOLD_PERCENT: 5,

  // ===== 실행 설정 =====
  // 자동 실행 간격 (분): 트리거 설정 시 사용
  RUN_INTERVAL_MINUTES: 60,
  // 요청 간 대기 시간 (밀리초) — 서버 부하 방지
  REQUEST_DELAY_MS: 2000,
  // HTTP 요청 타임아웃 (초)
  FETCH_TIMEOUT_SECONDS: 30,

  // ===== 데이터 보관 =====
  // 히스토리 최대 보관 일수 (0 = 무제한)
  MAX_HISTORY_DAYS: 90,
};
