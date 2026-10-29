/* =========================================================================
   login.js — logika halaman login.html untuk MAXIMUM THE ULTIMATE.
   Versi Firebase Authentication (REST, tanpa SDK dan tanpa build).
   Username diubah jadi email internal: "budi" -> "budi@maximum.app".
   Buat akun di Firebase Console dengan email persis seperti itu.
   ========================================================================= */

(function () {
  var FIREBASE_API_KEY = "AIzaSyAEhQvjI0YISOVElhh7yESMaI8520KI000"; // web key, aman publik
  var EMAIL_DOMAIN = "maximum.app"; // harus sama dengan domain email di Firebase Console
  var SIGNIN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
    encodeURIComponent(FIREBASE_API_KEY);

  var form = document.getElementById("login-form");
  var errorEl = document.getElementById("login-error");
  var submitBtn = document.getElementById("login-submit");
  var usernameInput = document.getElementById("login-username");
  var passwordInput = document.getElementById("login-password");

  // Sudah login sebelumnya di tab ini? Langsung ke halaman utama.
  try {
    if (sessionStorage.getItem(AUTH_CONFIG.SESSION_KEY)) {
      window.location.replace("index.html");
      return;
    }
  } catch (_) {}

  function setError(msg) {
    errorEl.textContent = msg || "";
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Memeriksa…" : "Masuk";
  }

  function toEmail(username) {
    var u = username.toLowerCase();
    return u.indexOf("@") === -1 ? u + "@" + EMAIL_DOMAIN : u;
  }

  function messageFor(code) {
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(code)) {
      return "Username atau password salah.";
    }
    if (/TOO_MANY_ATTEMPTS/.test(code)) return "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.";
    if (/USER_DISABLED/.test(code)) return "Akun ini dinonaktifkan.";
    if (/OPERATION_NOT_ALLOWED/.test(code)) return "Login Email/Password belum diaktifkan di Firebase.";
    return "Login gagal (" + code + ").";
  }

  form.addEventListener("submit", async function (evt) {
    evt.preventDefault();
    setError("");

    var username = usernameInput.value.trim();
    var password = passwordInput.value;

    if (!username || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }

    setLoading(true);
    MaximumLoader.show("Memeriksa Akun");

    try {
      var res = await fetch(SIGNIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: toEmail(username),
          password: password,
          returnSecureToken: true
        })
      });
      var data = await res.json();

      if (res.ok && data && data.idToken) {
        try {
          sessionStorage.setItem(AUTH_CONFIG.SESSION_KEY, username);
          sessionStorage.setItem("maximum_auth_token", data.idToken);
        } catch (_) {}
        MaximumLoader.setLabel("Harap Tunggu");
        var goToIndex = function () { window.location.href = "index.html"; };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(function () { requestAnimationFrame(goToIndex); });
        } else {
          setTimeout(goToIndex, 50);
        }
        return; // biarkan loader tetap tampil sampai pindah halaman
      }

      var code = (data && data.error && data.error.message) || ("HTTP " + res.status);
      MaximumLoader.hide();
      setError(messageFor(code));
      setLoading(false);
    } catch (err) {
      console.error(err);
      MaximumLoader.hide();
      setError("Tidak bisa terhubung ke server login. Coba lagi.");
      setLoading(false);
    }
  });
})();