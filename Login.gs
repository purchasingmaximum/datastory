/**
 * Login.gs — Backend Google Apps Script TERPISAH khusus untuk fitur Login.
 *
 * SENGAJA DIPISAH dari Code.gs:
 * - Code.gs (backend EVENTS/ITEMS) dan URL /exec yang sudah dipakai di
 *   js/data.js (CONFIG.API_URL) TIDAK disentuh sama sekali oleh file ini.
 * - File ini di-deploy sebagai Web App TERPISAH, dengan URL /exec-nya
 *   sendiri, lalu ditempel ke js/auth-config.js (AUTH_CONFIG.LOGIN_API_URL).
 *
 * Spreadsheet untuk login HARUS spreadsheet baru (bukan spreadsheet
 * EVENTS/ITEMS), dengan satu sheet bernama "USERS" berkolom:
 *   A: username | B: password
 * (baris 1 = header, data mulai baris 2).
 *
 * Cara pakai:
 * 1. Buat Google Spreadsheet baru, salin ID-nya dari URL.
 * 2. Buat sheet bernama USERS, isi kolom A "username" dan B "password" di
 *    baris 1, lalu isi daftar akun mulai baris 2.
 * 3. Extensions → Apps Script di spreadsheet baru itu, tempel seluruh isi
 *    file ini sebagai project BARU (jangan digabung ke Code.gs).
 * 4. Ganti LOGIN_SPREADSHEET_ID di bawah dengan ID dari langkah 1.
 * 5. Deploy → New deployment → Web app (Execute as: Me, Who has access:
 *    Anyone), lalu salin URL /exec ke js/auth-config.js.
 *
 * REVISI (PERBAIKAN BUG PENTING):
 * js/login.js mengirim login lewat GET (?action=login&username=...), bukan
 * POST, supaya body tidak hilang saat Apps Script me-redirect (302). TAPI
 * versi doGet() sebelumnya HANYA mengembalikan pesan health-check dan sama
 * sekali TIDAK memeriksa username/password — jadi login SELALU dianggap
 * berhasil (ok:true) untuk kombinasi apa pun, termasuk password yang salah.
 * doGet() di bawah sekarang benar-benar memvalidasi kredensial, sama seperti
 * doPost(). Setelah Anda tempel ulang file ini ke Apps Script, WAJIB buat
 * "New deployment" (versi baru) dari deployment yang sama supaya URL /exec
 * yang sudah dipakai di auth-config.js ikut memakai kode yang sudah
 * diperbaiki ini.
 */

const LOGIN_SPREADSHEET_ID = "PASTE_SPREADSHEET_ID_LOGIN_DI_SINI";
const USERS_SHEET_NAME = "USERS";

function loginSs_() {
  if (!LOGIN_SPREADSHEET_ID || LOGIN_SPREADSHEET_ID === "PASTE_SPREADSHEET_ID_LOGIN_DI_SINI") {
    throw new Error("LOGIN_SPREADSHEET_ID belum diisi di Login.gs.");
  }
  return SpreadsheetApp.openById(LOGIN_SPREADSHEET_ID);
}

function loginJsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------- */
/* Cache ringan untuk daftar USERS (mempercepat percobaan login berulang   */
/* dalam beberapa menit yang sama — tidak menghilangkan cold-start Apps    */
/* Script itu sendiri, tapi mengurangi jumlah pembacaan sheet).            */
/* ---------------------------------------------------------------------- */
const USERS_CACHE_KEY = "mx_login_users_cache_v1";
const USERS_CACHE_TTL_SECONDS = 300; // 5 menit

function getUsersRowsCached_() {
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get(USERS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // lanjut baca langsung dari sheet
  }

  const sheet = loginSs_().getSheetByName(USERS_SHEET_NAME);
  if (!sheet) throw new Error("Sheet USERS tidak ditemukan.");
  const rows = sheet.getDataRange().getValues();

  try {
    cache.put(USERS_CACHE_KEY, JSON.stringify(rows), USERS_CACHE_TTL_SECONDS);
  } catch (e) {
    // daftar user terlalu besar untuk cache — abaikan, tetap jalan tanpa cache
  }

  return rows;
}

/**
 * Cek kredensial terhadap sheet USERS. Dipakai bersama oleh doGet (login
 * lewat query string) dan doPost (login lewat body JSON), supaya keduanya
 * selalu punya logika yang sama persis.
 */
function checkLogin_(username, password) {
  const uname = String(username || "").trim();
  const pass = String(password || "");

  if (!uname || !pass) {
    return { ok: false, error: "Username dan password wajib diisi." };
  }

  const rows = getUsersRowsCached_();
  const isMatch = rows.slice(1).some((row) => {
    return String(row[0] || "").trim() === uname && String(row[1] || "") === pass;
  });

  if (!isMatch) {
    return { ok: false, error: "Username atau password salah." };
  }

  return { ok: true, username: uname };
}

/* ---------------------------------------------------------------------- */
/* POST — login                                                            */
/* ---------------------------------------------------------------------- */
function doPost(e) {
  let payload;

  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return loginJsonResponse_({ ok: false, error: "Invalid JSON body." });
  }

  try {
    if (payload.action !== "login") {
      return loginJsonResponse_({ ok: false, error: "Unknown action." });
    }

    return loginJsonResponse_(checkLogin_(payload.username, payload.password));
  } catch (err) {
    return loginJsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/* ---------------------------------------------------------------------- */
/* GET — login (dipakai oleh js/login.js) + health check                   */
/* ---------------------------------------------------------------------- */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};

    if (params.action === "login") {
      return loginJsonResponse_(checkLogin_(params.username, params.password));
    }

    return loginJsonResponse_({
      ok: true,
      message: "Login API aktif. Gunakan GET ?action=login&username=...&password=... atau POST dengan { action: 'login', username, password }.",
    });
  } catch (err) {
    return loginJsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * Jalankan sekali dari editor Apps Script untuk membuat sheet USERS +
 * header-nya jika belum ada (opsional, bisa juga dibuat manual).
 */
function setupLoginSheet() {
  const ss = loginSs_();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["username", "password"]);
  }
  return { ok: true, sheet: sheet.getName() };
}
