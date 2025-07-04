const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');
const fs = require('fs');

// 認証情報とスプレッドシート情報
const CREDENTIALS_PATH = './credentials.json';
const SHEET_ID = '1vm6JyX8a8Bt5FX4xE6CGgtRUYMh7gXzHhPAxnEooH_8';
const SHEET_NAME = 'Vin計測ツール';

// 列番号 → A〜Z, AA〜 に変換する関数
function columnToLetter(col) {
  let temp = '', letter = '';
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp - 1) / 26;
  }
  return letter;
}

// URLからplayCountを抽出
async function fetchPlayCount(url) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = res.data;
    const match = html.match(/["']?playCount["']?\s*[:=]\s*(\d+)/i);
    return match ? match[1] : 'N/A';
  } catch (err) {
    console.error(`❌ ${url}: ${err.message}`);
    return 'ERROR';
  }
}

(async () => {
  // 認証
  const creds = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDS_BASE64, 'base64').toString('utf-8')
);

  const doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();

  // 対象シート取得
  const sheet = doc.sheetsByTitle[SHEET_NAME];
  if (!sheet) {
    console.error(`❌ シート「${SHEET_NAME}」が見つかりません`);
    return;
  }

  // 行・列を取得
  const rowCount = sheet.rowCount;
  const colCount = sheet.columnCount;

  // 日付列を確認
  const now = new Date();
  const today = `${now.getMonth() + 1}/${now.getDate()}`; // "7/5"
  await sheet.loadCells(`A1:${columnToLetter(colCount)}${rowCount}`);

  let targetCol = null;

  // 1行目に今日の日付があるか探す
  for (let col = 1; col < colCount; col++) {
    const cell = sheet.getCell(0, col);
    if (cell.value === today) {
      targetCol = col;
      break;
    }
  }

  // なければ新しい列を追加
  if (targetCol === null) {
    for (let col = 1; col < colCount; col++) {
      const cell = sheet.getCell(0, col);
      if (!cell.value) {
        cell.value = today;
        targetCol = col;
        break;
      }
    }
    if (targetCol === null) {
      console.error('❌ 空き列がありません（列数を増やしてください）');
      return;
    }
  }

  // A列のURLを1行ずつ処理
  for (let row = 1; row < rowCount; row++) {
    const urlCell = sheet.getCell(row, 0);
    const resultCell = sheet.getCell(row, targetCol);

    const url = urlCell.value;
    if (!url || typeof url !== 'string' || !url.startsWith('http') || !url.includes('tiktok.com')) {
      console.log(`⏭️ ${row + 1}行目: スキップ（TikTok URLでない）`);
      continue;
    }

    const playCount = await fetchPlayCount(url);
    resultCell.value = playCount;
    console.log(`✅ ${row + 1}行目 (${today}): ${playCount}`);
  }

  await sheet.saveUpdatedCells();
})();
