(function () {
  "use strict";

  const Core = window.LabSyncCore;
  if (!Core || !window.localStorage) return;

  const CLIENT_ID = String(window.LAB_GOOGLE_CLIENT_ID || "").trim();
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const FILE_NAME = "personal-lab-sync-v1.json";
  const BASE_PREFIX = Core.INTERNAL_PREFIX + "base.v1.account.";
  const LEGACY_BASE_KEY = Core.INTERNAL_PREFIX + "base.v1";
  const LAST_ACCOUNT_KEY = Core.INTERNAL_PREFIX + "last-account";
  const ENABLED_KEY = Core.INTERNAL_PREFIX + "enabled";
  const BACKUP_PREFIX = Core.INTERNAL_PREFIX + "backup.";
  const SESSION_TOKEN_KEY = Core.INTERNAL_PREFIX + "oauth-token.v1";
  const REAUTH_REQUIRED_KEY = Core.INTERNAL_PREFIX + "oauth-reauth-required.v1";
  const nativeSet = Storage.prototype.setItem;
  const nativeRemove = Storage.prototype.removeItem;

  let accessToken = null;
  let tokenClient = null;
  let syncing = false;
  let syncTimer = null;
  let refreshTimer = null;
  let tokenRequest = null;
  let pendingConflict = null;
  let ignoreStorageHooks = false;
  let ui = null;

  function internalGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function internalSet(key, value) {
    try { nativeSet.call(localStorage, key, value); } catch (_) { /* local-only still works where possible */ }
  }
  function internalRemove(key) {
    try { nativeRemove.call(localStorage, key); } catch (_) { /* ignore */ }
  }
  function readSessionToken() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(SESSION_TOKEN_KEY) || "null");
      if (cached && typeof cached.accessToken === "string" && cached.accessToken && Number(cached.expiresAt) > Date.now() + 120000) {
        return cached;
      }
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (_) { /* A fresh token can still be requested. */ }
    return null;
  }
  function cacheSessionToken(token, expiresAt) {
    try { sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify({ accessToken: token, expiresAt })); } catch (_) { /* Memory-only token still works. */ }
  }
  function clearSessionToken() {
    try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch (_) { /* ignore */ }
  }
  function needsInteractiveReauth() {
    try { return sessionStorage.getItem(REAUTH_REQUIRED_KEY) === "1"; } catch (_) { return false; }
  }
  function setInteractiveReauth(required) {
    try {
      if (required) sessionStorage.setItem(REAUTH_REQUIRED_KEY, "1");
      else sessionStorage.removeItem(REAUTH_REQUIRED_KEY);
    } catch (_) { /* A tab-local memory fallback is unnecessary; failed renewals still stop in this page. */ }
  }
  function invalidateAccessToken() {
    accessToken = null;
    clearTimeout(refreshTimer);
    clearSessionToken();
  }
  function scheduleTokenRefresh(expiresAt) {
    clearTimeout(refreshTimer);
    const delay = Math.max(30000, Number(expiresAt) - Date.now() - 90000);
    refreshTimer = setTimeout(() => {
      requestToken(false).then(() => synchronize(false)).catch(() => {});
    }, delay);
  }
  function readObject(key) {
    try {
      const value = JSON.parse(internalGet(key) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_) { return {}; }
  }
  function collectLocal() {
    const values = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (Core.isManagedKey(key)) {
          const value = localStorage.getItem(key);
          if (typeof value === "string") values[key] = value;
        }
      }
    } catch (_) { /* return what was readable */ }
    return values;
  }
  function applyLocal(values) {
    const current = collectLocal();
    ignoreStorageHooks = true;
    try {
      for (const key of Object.keys(current)) {
        if (!Object.prototype.hasOwnProperty.call(values, key)) nativeRemove.call(localStorage, key);
      }
      for (const [key, value] of Object.entries(values)) nativeSet.call(localStorage, key, value);
    } finally {
      ignoreStorageHooks = false;
    }
  }

  function scheduleSync() {
    if (!accessToken || syncing || ignoreStorageHooks) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => synchronize(false), 900);
  }

  try {
    Storage.prototype.setItem = function (key, value) {
      nativeSet.call(this, key, value);
      if (!ignoreStorageHooks && this === localStorage && Core.isManagedKey(String(key))) scheduleSync();
    };
    Storage.prototype.removeItem = function (key) {
      nativeRemove.call(this, key);
      if (!ignoreStorageHooks && this === localStorage && Core.isManagedKey(String(key))) scheduleSync();
    };
  } catch (_) { /* The site remains local-only if this browser forbids wrapping Storage. */ }

  window.addEventListener("storage", (event) => {
    if (event.storageArea === localStorage && Core.isManagedKey(event.key)) scheduleSync();
  });

  function createUi() {
    const host = document.createElement("div");
    host.id = "lab-drive-sync";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host{all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","Noto Sans KR",sans-serif;color:#ecebf2}
        *{box-sizing:border-box}.pill,.btn{font:inherit;cursor:pointer}.pill{border:1px solid rgba(255,255,255,.18);border-radius:999px;background:#24232b;color:#ecebf2;padding:8px 12px;box-shadow:0 5px 20px rgba(0,0,0,.28);font-size:12px}.pill[data-kind="ok"]{border-color:#5dcaa5}.pill[data-kind="warn"]{border-color:#e3b341}
        .panel{position:absolute;right:0;bottom:42px;width:min(330px,calc(100vw - 24px));padding:14px;border:1px solid #44424d;border-radius:12px;background:#201f26;box-shadow:0 12px 36px rgba(0,0,0,.42);font-size:13px;line-height:1.45}.panel[hidden]{display:none}.title{font-size:14px;font-weight:700}.sub{margin-top:3px;color:#aaa7b5;font-size:11.5px}.status{margin:11px 0;padding:8px 10px;border-radius:8px;background:#2a2932;color:#d8d6df}.actions{display:flex;flex-wrap:wrap;gap:7px}.btn{border:1px solid #55525f;border-radius:8px;background:#302f38;color:#ecebf2;padding:7px 10px;font-size:12px}.btn:hover{border-color:#5dcaa5}.btn.primary{background:#226a57;border-color:#3e9c7d}.btn.danger{color:#d3d0da}.btn:disabled{opacity:.45;cursor:not-allowed}.conflict{margin-top:10px;padding:9px;border:1px solid #8d6b24;border-radius:8px;background:#322a1c}.conflict b{display:block;color:#f0c96b;margin-bottom:4px}.conflict .actions{margin-top:8px}.note{margin-top:9px;color:#8f8c99;font-size:10.5px}
        @media(prefers-color-scheme:light){:host{color:#26241f}.pill{background:#fff;color:#26241f;border-color:#c9c5bb}.panel{background:#fff;color:#26241f;border-color:#d9d6ce}.status{background:#f0eee9;color:#4d4941}.btn{background:#f7f5f1;color:#302d28;border-color:#ccc7bc}.btn.primary{background:#1d8b69;color:#fff}.sub,.note{color:#777168}.conflict{background:#fff8e8;border-color:#d4a83b}}
      </style>
      <button class="pill" id="toggle" type="button" aria-expanded="false">로컬 저장</button>
      <section class="panel" id="panel" hidden aria-label="Google Drive 동기화">
        <div class="title">실험 데이터 저장</div>
        <div class="sub">로그인하면 비공개 Drive 앱 데이터에 동기화해요.</div>
        <div class="status" id="status">이 브라우저에 저장 중 · Local only</div>
        <div class="actions">
          <button class="btn primary" id="connect" type="button">Google 계정 연결</button>
          <button class="btn" id="sync" type="button" hidden>지금 동기화</button>
          <button class="btn danger" id="disconnect" type="button" hidden>로그아웃</button>
        </div>
        <div class="conflict" id="conflict" hidden>
          <b>서로 다른 데이터가 있어요</b>
          <span id="conflictText"></span>
          <div class="actions">
            <button class="btn" id="keepLocal" type="button">이 브라우저 유지</button>
            <button class="btn" id="useDrive" type="button">Drive 데이터 사용</button>
          </div>
        </div>
        <div class="note">로그아웃하거나 연결하지 않으면 기존 localStorage만 사용해요.</div>
      </section>`;
    document.body.appendChild(host);

    const $ = (id) => shadow.getElementById(id);
    ui = { host, shadow, toggle: $("toggle"), panel: $("panel"), status: $("status"), connect: $("connect"), sync: $("sync"), disconnect: $("disconnect"), conflict: $("conflict"), conflictText: $("conflictText") };
    ui.toggle.addEventListener("click", () => {
      ui.panel.hidden = !ui.panel.hidden;
      ui.toggle.setAttribute("aria-expanded", String(!ui.panel.hidden));
    });
    ui.connect.addEventListener("click", () => {
      requestToken(true).then(() => synchronize(false)).catch(() => {});
    });
    ui.sync.addEventListener("click", () => synchronize(false));
    ui.disconnect.addEventListener("click", disconnect);
    $("keepLocal").addEventListener("click", () => resolveConflicts("local"));
    $("useDrive").addEventListener("click", () => resolveConflicts("remote"));

    if (!CLIENT_ID) {
      ui.connect.disabled = true;
      setStatus("OAuth client ID 설정 전 · 로컬 저장 중", "local");
    }
  }

  function setStatus(message, kind) {
    if (!ui) return;
    ui.status.textContent = message;
    ui.toggle.dataset.kind = kind === "ok" ? "ok" : kind === "warn" ? "warn" : "local";
    ui.toggle.textContent = kind === "ok" ? "Drive 동기화됨" : kind === "warn" ? "동기화 확인 필요" : "로컬 저장";
  }
  function setConnected(connected) {
    if (!ui) return;
    ui.connect.hidden = connected;
    ui.sync.hidden = !connected;
    ui.disconnect.hidden = !connected;
  }
  function showConflict(conflicts) {
    if (!ui) return;
    ui.conflict.hidden = !conflicts.length;
    ui.conflictText.textContent = conflicts.length ? `${conflicts.length}개 항목을 자동으로 덮어쓰지 않았어요. 사용할 쪽을 선택하면 반대쪽은 이 브라우저에 백업해요.` : "";
  }

  function loadIdentity() {
    if (!CLIENT_ID) return;
    const ready = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: receiveToken,
        error_callback: failTokenRequest,
      });
      if (internalGet(ENABLED_KEY) === "1") {
        const cached = readSessionToken();
        if (cached) {
          accessToken = cached.accessToken;
          setConnected(true);
          scheduleTokenRefresh(cached.expiresAt);
          synchronize(false);
        } else if (needsInteractiveReauth()) {
          setConnected(false);
          setStatus("Google 계정을 다시 연결해 주세요 · 로컬 저장 유지", "warn");
        } else {
          requestToken(false).then(() => synchronize(false)).catch(() => {});
        }
      }
    };
    if (window.google && google.accounts && google.accounts.oauth2) return ready();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = ready;
    script.onerror = () => setStatus("Google 로그인을 불러오지 못했어요 · 로컬 저장 유지", "warn");
    document.head.appendChild(script);
  }

  function authError(reason) {
    const error = new Error("Google authorization required");
    error.status = 401;
    error.reason = reason || "authError";
    return error;
  }

  function requestToken(interactive) {
    if (tokenRequest) return tokenRequest.promise;
    if (!tokenClient) {
      setStatus("Google 로그인 준비 중…", "local");
      return Promise.reject(authError("identityNotReady"));
    }
    if (!interactive && (internalGet(ENABLED_KEY) !== "1" || needsInteractiveReauth())) {
      setConnected(false);
      setStatus("Google 계정을 다시 연결해 주세요 · 로컬 저장 유지", "warn");
      return Promise.reject(authError("interactionRequired"));
    }

    setStatus(interactive ? "Google 계정 연결 중…" : "Google 연결 갱신 중…", "local");
    if (ui) ui.connect.disabled = true;
    let resolveRequest;
    let rejectRequest;
    const promise = new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    tokenRequest = { promise, resolve: resolveRequest, reject: rejectRequest, interactive };
    try {
      // Empty prompt is only used after this browser has explicitly enabled Drive sync.
      // It can renew a previously granted token without asking again, but cannot bypass
      // revoked consent, a signed-out Google session, or browser popup restrictions.
      tokenClient.requestAccessToken({ prompt: interactive ? "select_account" : "" });
    } catch (error) {
      failTokenRequest(error);
    }
    return promise;
  }

  function failTokenRequest(error) {
    const request = tokenRequest;
    tokenRequest = null;
    invalidateAccessToken();
    if (ui) ui.connect.disabled = false;
    if (!request) return;
    setConnected(false);
    if (!request.interactive) setInteractiveReauth(true);
    setStatus(request.interactive ? "Google 연결이 취소됐어요 · 로컬 저장 유지" : "Google 계정을 다시 연결해 주세요 · 로컬 저장 유지", "warn");
    request.reject(authError(error && (error.type || error.error)));
  }

  function receiveToken(response) {
    const request = tokenRequest;
    if (!request) return;
    if (!response || response.error || !response.access_token) {
      failTokenRequest(response);
      return;
    }
    tokenRequest = null;
    accessToken = response.access_token;
    internalSet(ENABLED_KEY, "1");
    setInteractiveReauth(false);
    setConnected(true);
    if (ui) ui.connect.disabled = false;
    const expiresIn = Math.max(60, Number(response.expires_in) || 3600);
    const expiresAt = Date.now() + expiresIn * 1000;
    cacheSessionToken(accessToken, expiresAt);
    scheduleTokenRefresh(expiresAt);
    if (request) request.resolve(accessToken);
  }

  async function driveFetch(url, options, canRenew) {
    const opts = { ...(options || {}), headers: { ...((options && options.headers) || {}), Authorization: `Bearer ${accessToken}` } };
    const response = await fetch(url, opts);
    if (response.status === 401 && canRenew !== false) {
      invalidateAccessToken();
      await requestToken(false);
      const method = String(opts.method || "GET").toUpperCase();
      if (method === "GET" || method === "HEAD") return driveFetch(url, options, false);
      // Replaying a write here would skip saveRemote's version check. Ask the caller
      // to restart the complete sync transaction with the renewed token instead.
      const error = authError("retryTransaction");
      error.retryAfterRenewal = true;
      throw error;
    }
    if (response.status === 401) {
      invalidateAccessToken();
      setInteractiveReauth(true);
      setConnected(false);
    }
    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch (_) { /* Some proxy errors have no JSON body. */ }
      const apiError = payload && payload.error;
      const legacyDetails = apiError && Array.isArray(apiError.errors) ? apiError.errors : [];
      const rpcDetails = apiError && Array.isArray(apiError.details) ? apiError.details : [];
      const errorInfo = rpcDetails.find((detail) => detail && typeof detail.reason === "string");
      const error = new Error(`Drive API ${response.status}`);
      error.status = response.status;
      error.reason = (legacyDetails[0] && legacyDetails[0].reason) || (errorInfo && errorInfo.reason);
      error.apiMessage = apiError && apiError.message;
      throw error;
    }
    return response;
  }

  async function loadAccountId() {
    const response = await driveFetch("https://www.googleapis.com/drive/v3/about?fields=user(permissionId)");
    const body = await response.json();
    if (!body.user || typeof body.user.permissionId !== "string" || !body.user.permissionId) {
      throw new Error("Drive account identity unavailable");
    }
    return body.user.permissionId;
  }

  async function loadRemote() {
    const query = new URLSearchParams({
      spaces: "appDataFolder",
      q: `name='${FILE_NAME}' and trashed=false`,
      orderBy: "createdTime asc",
      fields: "files(id,name,createdTime,modifiedTime,version)",
      pageSize: "10",
    });
    const list = await driveFetch(`https://www.googleapis.com/drive/v3/files?${query}`);
    const body = await list.json();
    const file = body.files && body.files[0];
    if (!file) return { fileId: null, version: null, values: {} };
    const download = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
    const document = Core.normalizeDocument(await download.json());
    return { fileId: file.id, version: String(file.version || ""), values: document.values };
  }

  async function assertRemoteVersion(fileId, expectedVersion) {
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=version,trashed`);
    const metadata = await response.json();
    if (metadata.trashed || !expectedVersion || String(metadata.version || "") !== expectedVersion) {
      const error = new Error("Drive file changed before upload");
      error.status = 412;
      error.reason = "remoteChanged";
      error.apiMessage = "Drive file changed before upload.";
      throw error;
    }
  }

  async function saveRemote(fileId, values, version) {
    let id = fileId;
    if (!id) {
      const create = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"], mimeType: "application/json" }),
      });
      id = (await create.json()).id;
    } else {
      // Drive v3 exposes `version` in JSON, while ETag is not reliably readable by browser CORS.
      // Re-check immediately before upload rather than silently overwriting a newer remote value.
      await assertRemoteVersion(id, version);
    }
    const upload = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id,version`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Core.makeDocument(values)),
    });
    const metadata = await upload.json();
    return { fileId: id, version: String(metadata.version || "") };
  }

  async function synchronize(fromWrite, canRetryAfterRenewal = true) {
    if (!accessToken || syncing) return;
    syncing = true;
    setStatus("Drive와 동기화 중…", "local");
    try {
      const accountId = await loadAccountId();
      const baseKey = BASE_PREFIX + encodeURIComponent(accountId);
      if (internalGet(LAST_ACCOUNT_KEY) !== accountId) {
        // A shared origin has one local dataset. Never reuse a prior account's merge base
        // when the account chooser switches users: differences must become a conflict.
        internalRemove(baseKey);
        internalSet(LAST_ACCOUNT_KEY, accountId);
      }
      let completed = false;
      for (let attempt = 0; attempt < 3 && !completed; attempt += 1) {
        const remote = await loadRemote();
        const result = Core.reconcile(collectLocal(), remote.values, readObject(baseKey));
        if (result.changedLocal) applyLocal(result.local);
        let fileId = remote.fileId;
        let version = remote.version;
        if (result.changedRemote) {
          try {
            const saved = await saveRemote(fileId, result.remote, version);
            fileId = saved.fileId;
            version = saved.version;
          } catch (error) {
            if (error.status === 412 && attempt < 2) continue;
            throw error;
          }
        }
        internalSet(baseKey, JSON.stringify(result.base));
        pendingConflict = result.conflicts.length ? { result, fileId, version, baseKey } : null;
        showConflict(result.conflicts);
        if (result.conflicts.length) {
          setStatus("충돌 확인 필요 · 데이터는 덮어쓰지 않았어요", "warn");
          if (ui) ui.panel.hidden = false;
        } else {
          setStatus("Google Drive 동기화 완료", "ok");
        }
        if (result.changedLocal && !fromWrite) setTimeout(() => location.reload(), 180);
        completed = true;
      }
      if (!completed) throw new Error("Drive changed repeatedly during sync");
    } catch (error) {
      if (error.retryAfterRenewal && canRetryAfterRenewal) {
        // Release the transaction lock before restarting so all remote reads and
        // version checks run again with the renewed token.
        syncing = false;
        await synchronize(fromWrite, false);
        return;
      }
      setStatus(Core.describeDriveError(error), "warn");
    } finally {
      syncing = false;
    }
  }

  function saveBackup(source, conflicts) {
    const values = {};
    for (const conflict of conflicts) {
      const present = source === "local" ? conflict.hasLocal : conflict.hasRemote;
      const value = source === "local" ? conflict.local : conflict.remote;
      values[conflict.key] = present ? { present: true, value } : { present: false };
    }
    const key = BACKUP_PREFIX + Date.now();
    const payload = JSON.stringify({ source, createdAt: new Date().toISOString(), values });
    try {
      const old = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const oldKey = localStorage.key(i);
        if (oldKey && oldKey.startsWith(BACKUP_PREFIX)) old.push(oldKey);
      }
      old.sort().slice(0, -4).forEach(internalRemove);
      nativeSet.call(localStorage, key, payload);
      return localStorage.getItem(key) === payload;
    } catch (_) {
      return false;
    }
  }

  async function resolveConflicts(choice) {
    if (!pendingConflict || syncing) return;
    syncing = true;
    const { result } = pendingConflict;
    try {
      const backupSource = choice === "local" ? "remote" : "local";
      if (!saveBackup(backupSource, result.conflicts)) {
        throw new Error("Could not verify conflict backup");
      }
      if (choice === "local") {
        for (const conflict of result.conflicts) {
          if (conflict.hasLocal) result.remote[conflict.key] = conflict.local;
          else delete result.remote[conflict.key];
        }
        await saveRemote(pendingConflict.fileId, result.remote, pendingConflict.version);
        internalSet(pendingConflict.baseKey, JSON.stringify(collectLocal()));
        showConflict([]);
        pendingConflict = null;
        setStatus("이 브라우저 데이터로 Drive를 갱신했어요", "ok");
      } else {
        for (const conflict of result.conflicts) {
          if (conflict.hasRemote) result.local[conflict.key] = conflict.remote;
          else delete result.local[conflict.key];
        }
        applyLocal(result.local);
        internalSet(pendingConflict.baseKey, JSON.stringify(result.local));
        showConflict([]);
        pendingConflict = null;
        setStatus("Drive 데이터를 불러왔어요", "ok");
        setTimeout(() => location.reload(), 180);
      }
    } catch (error) {
      setStatus(`${Core.describeDriveError(error)} · 양쪽 데이터 유지`, "warn");
      if (error.status === 412 || error.retryAfterRenewal) setTimeout(() => synchronize(false), 250);
    } finally {
      syncing = false;
    }
  }

  function disconnect() {
    const oldToken = accessToken;
    accessToken = null;
    pendingConflict = null;
    if (tokenRequest) {
      const request = tokenRequest;
      tokenRequest = null;
      request.reject(authError("disconnected"));
    }
    if (ui) ui.connect.disabled = false;
    clearTimeout(syncTimer);
    clearTimeout(refreshTimer);
    clearSessionToken();
    setInteractiveReauth(false);
    internalRemove(ENABLED_KEY);
    setConnected(false);
    showConflict([]);
    setStatus("로그아웃됨 · 이 브라우저에만 저장", "local");
    if (oldToken && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(oldToken, function () {});
    }
  }

  function start() {
    internalRemove(LEGACY_BASE_KEY);
    createUi();
    loadIdentity();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
