/**
 * sheet-competitor-price
 * 경쟁사 가격 크롤링 → 스프레드시트 자동 업데이트
 *
 * 사용법: Config.gs에서 URL/패턴 설정 후 실행
 */

// ===================== 메인 함수 =====================

/**
 * 모든 대상의 가격을 수집하여 시트에 기록
 */
function fetchAllPrices() {
  const ss = CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  const sheet = getOrCreateSheet_(ss, CONFIG.SHEET_NAME);
  ensureHeaders_(sheet);

  const timestamp = new Date();
  const results = [];

  for (let i = 0; i < CONFIG.TARGETS.length; i++) {
    const target = CONFIG.TARGETS[i];
    try {
      Utilities.sleep(i > 0 ? CONFIG.REQUEST_DELAY_MS : 0);
      const price = extractPrice_(target);
      results.push({ target, price, error: null });
      Logger.log(`✅ ${target.name}: ${price}원`);
    } catch (e) {
      results.push({ target, price: null, error: e.message });
      Logger.log(`❌ ${target.name}: ${e.message}`);
    }
  }

  // 시트에 기록
  writeResults_(sheet, timestamp, results);

  // 알림 체크
  if (CONFIG.ALERT_ENABLED) {
    checkAlerts_(sheet, results);
  }

  // 오래된 데이터 정리
  if (CONFIG.MAX_HISTORY_DAYS > 0) {
    cleanOldData_(sheet);
  }
}

// ===================== 가격 추출 =====================

/**
 * URL에서 가격을 추출
 */
function extractPrice_(target) {
  const options = {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  };

  const response = UrlFetchApp.fetch(target.url, options);
  const code = response.getResponseCode();

  if (code !== 200) {
    throw new Error(`HTTP ${code}`);
  }

  const html = response.getContentText();

  if (target.method === 'xpath') {
    return extractByImportXml_(target);
  }

  return extractByRegex_(html, target.pattern);
}

/**
 * 정규식으로 가격 추출
 */
function extractByRegex_(html, pattern) {
  const regex = new RegExp(pattern);
  const match = html.match(regex);

  if (!match || !match[1]) {
    throw new Error('가격 패턴 매칭 실패');
  }

  const priceStr = match[1].replace(/,/g, '').trim();
  const price = parseInt(priceStr, 10);

  if (isNaN(price) || price <= 0) {
    throw new Error(`유효하지 않은 가격: ${match[1]}`);
  }

  return price;
}

/**
 * IMPORTXML로 가격 추출 (xpath 방식)
 */
function extractByImportXml_(target) {
  // IMPORTXML은 시트 함수로만 동작하므로, 임시 셀에서 값 읽기
  const ss = CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  const tempSheet = getOrCreateSheet_(ss, '_temp_xpath');
  tempSheet.getRange('A1').setFormula(
    `=IMPORTXML("${target.url}", "${target.xpath}")`
  );
  SpreadsheetApp.flush();
  Utilities.sleep(5000);

  const value = tempSheet.getRange('A1').getDisplayValue();
  ss.deleteSheet(tempSheet);

  if (!value || value === '#N/A' || value === '#ERROR!') {
    throw new Error('IMPORTXML 추출 실패');
  }

  const price = parseInt(value.replace(/[^0-9]/g, ''), 10);
  if (isNaN(price) || price <= 0) {
    throw new Error(`유효하지 않은 가격: ${value}`);
  }

  return price;
}

// ===================== 시트 관리 =====================

/**
 * 시트 가져오기/생성
 */
function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * 헤더 행 확인/생성
 */
function ensureHeaders_(sheet) {
  const firstCell = sheet.getRange('A1').getValue();
  if (firstCell === '수집일시') return;

  const headers = ['수집일시'];
  CONFIG.TARGETS.forEach(t => {
    headers.push(t.name + ' (가격)');
    headers.push(t.name + ' (변동률)');
  });
  headers.push('비고');

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#4a86c8')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

/**
 * 결과를 시트에 기록
 */
function writeResults_(sheet, timestamp, results) {
  const row = [Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')];
  const lastRow = sheet.getLastRow();
  const errors = [];

  for (const r of results) {
    if (r.price !== null) {
      row.push(r.price);
      // 이전 가격 대비 변동률 계산
      const prevPrice = getPreviousPrice_(sheet, r.target.name, lastRow);
      if (prevPrice > 0) {
        const changePercent = ((r.price - prevPrice) / prevPrice * 100).toFixed(1);
        row.push(changePercent + '%');
      } else {
        row.push('-');
      }
    } else {
      row.push('에러');
      row.push('-');
      errors.push(`${r.target.name}: ${r.error}`);
    }
  }

  row.push(errors.length > 0 ? errors.join(' | ') : '');

  sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);

  // 가격 열 숫자 서식
  for (let i = 0; i < results.length; i++) {
    const col = 2 + i * 2;
    sheet.getRange(lastRow + 1, col).setNumberFormat('#,##0');
  }
}

/**
 * 이전 가격 조회
 */
function getPreviousPrice_(sheet, targetName, lastRow) {
  if (lastRow <= 1) return 0;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = headers.indexOf(targetName + ' (가격)');
  if (colIndex === -1) return 0;

  const prevValue = sheet.getRange(lastRow, colIndex + 1).getValue();
  return typeof prevValue === 'number' ? prevValue : 0;
}

// ===================== 알림 =====================

/**
 * 가격 변동 알림 체크
 */
function checkAlerts_(sheet, results) {
  const lastRow = sheet.getLastRow();
  const alerts = [];

  for (const r of results) {
    if (r.price === null) continue;

    const prevPrice = getPreviousPrice_(sheet, r.target.name, lastRow);
    if (prevPrice <= 0) continue;

    const changePercent = Math.abs((r.price - prevPrice) / prevPrice * 100);
    if (changePercent >= CONFIG.ALERT_THRESHOLD_PERCENT) {
      const direction = r.price > prevPrice ? '📈 상승' : '📉 하락';
      alerts.push(
        `${direction} ${r.target.name}\n` +
        `  이전: ${prevPrice.toLocaleString()}원 → 현재: ${r.price.toLocaleString()}원 (${changePercent.toFixed(1)}%)`
      );
    }
  }

  if (alerts.length > 0) {
    sendAlertEmail_(alerts);
  }
}

/**
 * 알림 이메일 발송
 */
function sendAlertEmail_(alerts) {
  const email = CONFIG.ALERT_EMAIL || Session.getActiveUser().getEmail();
  const subject = `⚠️ 경쟁사 가격 변동 알림 (${alerts.length}건)`;
  const body = `경쟁사 가격 모니터링 알림\n\n` +
    `수집 시각: ${new Date().toLocaleString('ko-KR')}\n\n` +
    alerts.join('\n\n') +
    `\n\n---\nsheet-competitor-price 자동 알림`;

  MailApp.sendEmail(email, subject, body);
  Logger.log(`📧 알림 발송: ${email}`);
}

// ===================== 데이터 정리 =====================

/**
 * 오래된 데이터 삭제
 */
function cleanOldData_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 2) return;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.MAX_HISTORY_DAYS);

  const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let deleteCount = 0;

  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i][0]);
    if (d < cutoffDate) {
      deleteCount++;
    } else {
      break;
    }
  }

  if (deleteCount > 0) {
    sheet.deleteRows(2, deleteCount);
    Logger.log(`🗑️ ${deleteCount}행 오래된 데이터 삭제`);
  }
}

// ===================== 트리거 관리 =====================

/**
 * 자동 실행 트리거 설치
 */
function installTrigger() {
  // 기존 트리거 제거
  removeTrigger();

  ScriptApp.newTrigger('fetchAllPrices')
    .timeBased()
    .everyMinutes(CONFIG.RUN_INTERVAL_MINUTES)
    .create();

  Logger.log(`⏰ ${CONFIG.RUN_INTERVAL_MINUTES}분 간격 트리거 설치 완료`);
}

/**
 * 트리거 제거
 */
function removeTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'fetchAllPrices') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  Logger.log('🔄 기존 트리거 제거 완료');
}

// ===================== 유틸리티 =====================

/**
 * 수동 테스트용 — 첫 번째 타겟만 테스트
 */
function testSingleTarget() {
  if (CONFIG.TARGETS.length === 0) {
    Logger.log('⚠️ Config.gs에 TARGETS를 설정해주세요.');
    return;
  }

  const target = CONFIG.TARGETS[0];
  try {
    const price = extractPrice_(target);
    Logger.log(`✅ 테스트 성공: ${target.name} = ${price}원`);
  } catch (e) {
    Logger.log(`❌ 테스트 실패: ${e.message}`);
  }
}

/**
 * 메뉴 추가 (스프레드시트 바인딩 시)
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💰 가격 모니터링')
    .addItem('지금 수집', 'fetchAllPrices')
    .addItem('단건 테스트', 'testSingleTarget')
    .addSeparator()
    .addItem('자동실행 시작', 'installTrigger')
    .addItem('자동실행 중지', 'removeTrigger')
    .addToUi();
}
