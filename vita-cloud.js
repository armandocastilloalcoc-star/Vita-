/* ============================================================
 * Vita Cloud — sincronización opcional y no destructiva.
 *  - NO bloquea la app: si no inicias sesión, Vita funciona igual (local).
 *  - Al iniciar sesión: PRIMERO sube tus datos locales a la nube (no se pierden),
 *    luego baja lo que falte. Después, cada cambio se sincroniza solo.
 *  - Botón flotante "☁︎ Vita Cloud" para entrar y para generar el token MCP.
 * Servido en /vita-cloud.js  (mismo dominio que el backend).
 * ============================================================ */
(function () {
  "use strict";
  var API = (window.VITA_API || "").replace(/\/$/, "");
  var SESSION = "vita_session";
  var SYNCED = "vita_synced_once";

  var KEY_MAP = {
    mc_profile: "profile", mc_log: "log", mc_plans: "plans",
    mc_daily_menu: "daily_menu", mc_water_log: "water_log",
    mc_weight_history: "weight_history", mc_weekly_report: "weekly_report",
    mc_coach_memory: "coach_memory",
  };
  var BACK2LOCAL = {};
  Object.keys(KEY_MAP).forEach(function (k) { BACK2LOCAL[KEY_MAP[k]] = k; });

  function token() { return localStorage.getItem(SESSION); }
  function loggedIn() { return !!token(); }

  function api(path, opts) {
    opts = opts || {};
    var h = { "Content-Type": "application/json" };
    if (loggedIn()) h["Authorization"] = "Bearer " + token();
    return fetch(API + path, {
      method: opts.method || "GET", headers: h,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
        return j;
      });
    });
  }

  // ---- sync continua (no destructiva): cada escritura local sube a la nube ----
  var rawSet = localStorage.setItem.bind(localStorage);
  var timers = {};
  localStorage.setItem = function (k, v) {
    rawSet(k, v);
    if (loggedIn() && KEY_MAP[k]) {
      clearTimeout(timers[k]);
      timers[k] = setTimeout(function () {
        var val; try { val = JSON.parse(v); } catch (e) { val = v; }
        api("/api/data/" + KEY_MAP[k], { method: "PUT", body: val }).catch(function () {});
      }, 600);
    }
  };

  // Primera sincronización: subir local -> nube, luego bajar lo que falte.
  function firstSync() {
    var pushes = [];
    Object.keys(KEY_MAP).forEach(function (lk) {
      var raw = localStorage.getItem(lk);
      if (raw != null) {
        var val; try { val = JSON.parse(raw); } catch (e) { val = raw; }
        pushes.push(api("/api/data/" + KEY_MAP[lk], { method: "PUT", body: val }).catch(function () {}));
      }
    });
    return Promise.all(pushes).then(function () {
      return api("/api/data").then(function (res) {
        var data = (res && res.data) || {};
        Object.keys(data).forEach(function (bk) {
          var lk = BACK2LOCAL[bk];
          if (lk && localStorage.getItem(lk) == null) {
            var v = data[bk];
            rawSet(lk, typeof v === "string" ? v : JSON.stringify(v));
          }
        });
        localStorage.setItem(SYNCED, "1");
      });
    });
  }

  /* ---------------- UI ---------------- */
  function css() {
    var s = document.createElement("style");
    s.textContent =
      ".vc-fab{position:fixed;right:14px;bottom:14px;z-index:99998;background:#14201c;color:#fafdfc;border:0;border-radius:999px;padding:10px 15px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}" +
      ".vc-ov{position:fixed;inset:0;z-index:99999;background:rgba(12,20,18,.5);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif}" +
      ".vc-card{background:#fafdfc;color:#14201c;width:min(380px,92vw);border-radius:20px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.3)}" +
      ".vc-card h2{font-size:24px;margin:0 0 4px}.vc-card p.sub{margin:0 0 16px;color:#5a6b64;font-size:13px}" +
      ".vc-card input{width:100%;box-sizing:border-box;padding:12px 14px;margin:6px 0;border:1px solid #d4ded9;border-radius:12px;font-size:15px}" +
      ".vc-card button.main{width:100%;padding:13px;margin-top:10px;border:0;border-radius:12px;background:#14201c;color:#fafdfc;font-size:15px;font-weight:600;cursor:pointer}" +
      ".vc-card .alt{text-align:center;margin-top:14px;font-size:13px;color:#5a6b64}.vc-card .alt a{color:#14201c;font-weight:600;cursor:pointer}" +
      ".vc-err{color:#b3261e;font-size:13px;min-height:16px;margin-top:6px}" +
      ".vc-tok{word-break:break-all;background:#eef4f1;border-radius:10px;padding:10px;font:12px ui-monospace,monospace;margin:8px 0}";
    document.head.appendChild(s);
  }
  function el(h) { var d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; }
  function tr(c) {
    return ({ email_ya_registrado: "Ese correo ya está registrado.",
      credenciales_invalidas: "Correo o contraseña incorrectos.",
      "email y password (min 6) requeridos": "Correo y contraseña (mínimo 6).",
      db_not_configured: "Servidor sin base de datos." })[c] || c;
  }

  function showAuth() {
    var mode = "login";
    var ov = el('<div class="vc-ov"><div class="vc-card">' +
      '<h2>Vita Cloud</h2><p class="sub" id="s">Inicia sesión para guardar y sincronizar tus datos en la nube.</p>' +
      '<input id="e" type="email" placeholder="correo" autocomplete="email">' +
      '<input id="p" type="password" placeholder="contraseña" autocomplete="current-password">' +
      '<div class="vc-err" id="x"></div><button class="main" id="g">Entrar</button>' +
      '<div class="alt" id="a">¿No tienes cuenta? <a id="sw">Crear cuenta</a></div>' +
      '<div class="alt"><a id="cl">Seguir sin conectar</a></div></div></div>');
    document.body.appendChild(ov);
    var q = function (s) { return ov.querySelector(s); };
    function bindSwap() {
      q("#sw").onclick = function () {
        mode = mode === "login" ? "register" : "login";
        q("#g").textContent = mode === "login" ? "Entrar" : "Crear cuenta";
        q("#s").textContent = mode === "login"
          ? "Inicia sesión para guardar y sincronizar tus datos en la nube."
          : "Crea tu cuenta. Tus datos actuales se subirán automáticamente.";
        q("#a").innerHTML = mode === "login"
          ? '¿No tienes cuenta? <a id="sw">Crear cuenta</a>'
          : '¿Ya tienes cuenta? <a id="sw">Entrar</a>';
        bindSwap();
      };
    }
    bindSwap();
    q("#cl").onclick = function () { ov.remove(); };
    q("#g").onclick = function () {
      q("#x").textContent = ""; q("#g").disabled = true;
      api("/api/auth/" + mode, { method: "POST", body: { email: q("#e").value.trim(), password: q("#p").value } })
        .then(function (res) { localStorage.setItem(SESSION, res.token); return firstSync(); })
        .then(function () { location.reload(); })
        .catch(function (err) { q("#x").textContent = tr(err.message); q("#g").disabled = false; });
    };
  }

  function showPanel() {
    var ov = el('<div class="vc-ov"><div class="vc-card">' +
      '<h2>Vita Cloud</h2><p class="sub">Sesión activa. Tus datos se sincronizan solos.</p>' +
      '<button class="main" id="t">Generar token MCP para Arkos</button><div id="b"></div>' +
      '<div class="alt"><a id="o">Cerrar sesión</a> &nbsp;·&nbsp; <a id="c">Cerrar</a></div></div></div>');
    document.body.appendChild(ov);
    var q = function (s) { return ov.querySelector(s); };
    q("#t").onclick = function () {
      q("#t").disabled = true;
      api("/api/mcp-token", { method: "POST", body: { name: "Arkos Note" } })
        .then(function (r) {
          q("#b").innerHTML = '<p style="font-size:13px;margin:14px 0 4px">URL del MCP:</p><div class="vc-tok">' +
            ((API || location.origin) + "/mcp") + '</div><p style="font-size:13px;margin:10px 0 4px">Token (guárdalo):</p>' +
            '<div class="vc-tok">' + r.token + '</div>';
        })
        .catch(function (e) { q("#b").innerHTML = '<div class="vc-err">' + tr(e.message) + '</div>'; })
        .finally(function () { q("#t").disabled = false; });
    };
    q("#o").onclick = function () { localStorage.removeItem(SESSION); localStorage.removeItem(SYNCED); location.reload(); };
    q("#c").onclick = function () { ov.remove(); };
  }

  function fab() {
    var b = el('<button class="vc-fab">☁︎ Vita Cloud</button>');
    b.onclick = function () { loggedIn() ? showPanel() : showAuth(); };
    document.body.appendChild(b);
  }

  function boot() {
    css(); fab();
    // si ya hay sesión pero no se ha hecho la primera sync en este navegador
    if (loggedIn() && !localStorage.getItem(SYNCED)) {
      firstSync().catch(function (e) {
        if (/401|no_autorizado/.test(e.message)) { localStorage.removeItem(SESSION); }
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.VitaCloud = { api: api, showPanel: showPanel, loggedIn: loggedIn };
})();
