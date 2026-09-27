(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LabSyncCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DOCUMENT_VERSION = 1;
  const INTERNAL_PREFIX = "lab.drive-sync.";
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  const EXACT_KEYS = new Set([
    "lab.profile.v1",
    "lab.wants.v1",
    "lab.evidence.v1",
    "ptq.settings",
    "lab.ai005.v1",
    "lab.spring006.v1",
    "lab.stock007.v1",
    "lab.dailyloop.v1",
    "lab009-sleep-observatory",
  ]);

  function isManagedKey(key) {
    return typeof key === "string" && (EXACT_KEYS.has(key) || key.startsWith("ptq.best."));
  }

  function cleanValues(input) {
    const out = {};
    if (!input || typeof input !== "object") return out;
    for (const [key, value] of Object.entries(input)) {
      if (isManagedKey(key) && typeof value === "string") out[key] = value;
    }
    return out;
  }

  function normalizeDocument(input) {
    if (!input || input.version !== DOCUMENT_VERSION || !input.items || typeof input.items !== "object" || Array.isArray(input.items)) {
      throw new Error("Unsupported or malformed Drive sync document");
    }
    const values = {};
    for (const [key, item] of Object.entries(input.items)) {
      if (!isManagedKey(key)) continue;
      if (!item || typeof item !== "object" || typeof item.value !== "string") {
        throw new Error(`Malformed Drive sync item: ${key}`);
      }
      values[key] = item.value;
    }
    return {
      version: DOCUMENT_VERSION,
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
      values,
    };
  }

  function makeDocument(values, now) {
    const items = {};
    for (const [key, value] of Object.entries(cleanValues(values))) items[key] = { value };
    return {
      version: DOCUMENT_VERSION,
      updatedAt: now || new Date().toISOString(),
      items,
    };
  }

  function sameValue(a, hasA, b, hasB) {
    return hasA === hasB && (!hasA || a === b);
  }

  function sanitizeApiText(value) {
    if (typeof value !== "string") return "";
    return value
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/https?:\/\/\S+/gi, "[링크]")
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[계정]")
      .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_./+=-]{24,}\b/gi, "[숨김]")
      .replace(/\b\d{8,}\b/g, "[숨김]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  function describeDriveError(error) {
    const status = Number(error && error.status);
    const statusText = Number.isInteger(status) && status > 0 ? String(status) : "네트워크";
    const reason = typeof (error && error.reason) === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(error.reason)
      ? error.reason
      : "";
    const apiMessage = sanitizeApiText(error && error.apiMessage);
    let guidance = "잠시 뒤 다시 시도해 주세요";
    if (status === 401) guidance = "Google 계정을 다시 연결해 주세요";
    else if (status === 403 && /(?:access_?not_?configured|api_?disabled|service_?disabled)/i.test(reason)) guidance = "Google Cloud에서 Drive API 사용 설정을 확인해 주세요";
    else if (status === 403 && /(?:insufficient_?permissions|access_token_scope_insufficient|forbidden)/i.test(reason)) guidance = "Drive appdata 권한과 테스트 사용자를 확인해 주세요";
    else if (status === 403) guidance = "Drive API 권한·사용 설정·할당량을 확인해 주세요";
    else if (status === 404) guidance = "원격 파일을 찾지 못했어요. 다시 동기화해 주세요";
    else if (status === 412) guidance = "원격 변경을 감지했어요. 다시 동기화해 주세요";
    else if (status === 429) guidance = "요청이 많아요. 잠시 뒤 다시 시도해 주세요";
    else if (status >= 500) guidance = "Google Drive가 일시적으로 응답하지 않아요";
    else if (!Number.isInteger(status) || status <= 0) guidance = "네트워크 연결이나 브라우저 차단 설정을 확인해 주세요";

    const detail = [reason, apiMessage].filter(Boolean).join(" · ");
    return `Drive 오류 (${statusText}${detail ? ` · ${detail}` : ""}) · ${guidance} · 이 브라우저 저장은 유지돼요`;
  }

  /* Three-way merge: one-sided edits win, divergent edits become conflicts. */
  function reconcile(localInput, remoteInput, baseInput) {
    const local = cleanValues(localInput);
    const remote = cleanValues(remoteInput);
    const base = cleanValues(baseInput);
    const nextLocal = { ...local };
    const nextRemote = { ...remote };
    const nextBase = {};
    const conflicts = [];
    const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)]);

    for (const key of keys) {
      const l = hasOwn(local, key), r = hasOwn(remote, key), b = hasOwn(base, key);
      const lv = local[key], rv = remote[key], bv = base[key];

      if (sameValue(lv, l, rv, r)) {
        if (l) nextBase[key] = lv;
        continue;
      }

      if (!b) {
        if (l && !r) {
          nextRemote[key] = lv;
          nextBase[key] = lv;
        } else if (!l && r) {
          nextLocal[key] = rv;
          nextBase[key] = rv;
        } else {
          conflicts.push({ key, local: lv, remote: rv, hasLocal: l, hasRemote: r });
        }
        continue;
      }

      const localUnchanged = sameValue(lv, l, bv, true);
      const remoteUnchanged = sameValue(rv, r, bv, true);
      if (localUnchanged && !remoteUnchanged) {
        if (r) {
          nextLocal[key] = rv;
          nextBase[key] = rv;
        } else {
          delete nextLocal[key];
        }
      } else if (remoteUnchanged && !localUnchanged) {
        if (l) {
          nextRemote[key] = lv;
          nextBase[key] = lv;
        } else {
          delete nextRemote[key];
        }
      } else {
        conflicts.push({ key, local: lv, remote: rv, hasLocal: l, hasRemote: r });
        nextBase[key] = bv;
      }
    }

    return {
      local: nextLocal,
      remote: nextRemote,
      base: nextBase,
      conflicts,
      changedLocal: JSON.stringify(local) !== JSON.stringify(nextLocal),
      changedRemote: JSON.stringify(remote) !== JSON.stringify(nextRemote),
    };
  }

  return { DOCUMENT_VERSION, INTERNAL_PREFIX, isManagedKey, cleanValues, normalizeDocument, makeDocument, reconcile, sanitizeApiText, describeDriveError };
});
