/* =========================================================================
   auth-guard.js — proteksi halaman: redirect ke login.html jika belum
   login di tab browser ini. File berdiri sendiri, hanya dipasang lewat
   satu baris <script> tambahan di halaman yang dilindungi — tidak ada
   baris kode lain yang diubah.
   ========================================================================= */
(function () {
  const SESSION_KEY = "maximum_auth_session"; // harus sama dengan AUTH_CONFIG.SESSION_KEY
  let session = null;
  try { session = sessionStorage.getItem(SESSION_KEY); } catch (_) {}
  if (!session) {
    window.location.replace("login.html");
  }
})();
