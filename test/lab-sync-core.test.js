const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../shared/lab-sync-core.js");

const K = "lab.evidence.v1";

test("only known experiment key families are managed", () => {
  assert.equal(Core.isManagedKey("lab.evidence.v1"), true);
  assert.equal(Core.isManagedKey("lab009-sleep-observatory"), true);
  assert.equal(Core.isManagedKey("ptq.settings"), true);
  assert.equal(Core.isManagedKey("ptq.best.rush1.12.30"), true);
  assert.equal(Core.isManagedKey("lab.drive-sync.base.v1"), false);
  assert.equal(Core.isManagedKey("lab.unrelated"), false);
  assert.equal(Core.isManagedKey("ptq.unrelated"), false);
});

test("first login uploads local data when Drive is empty", () => {
  const result = Core.reconcile({ [K]: "local" }, {}, {});
  assert.deepEqual(result.remote, { [K]: "local" });
  assert.deepEqual(result.local, { [K]: "local" });
  assert.equal(result.changedRemote, true);
  assert.equal(result.conflicts.length, 0);
});

test("first login downloads Drive data when browser is empty", () => {
  const result = Core.reconcile({}, { [K]: "remote" }, {});
  assert.deepEqual(result.local, { [K]: "remote" });
  assert.equal(result.changedLocal, true);
  assert.equal(result.conflicts.length, 0);
});

test("different pre-existing values conflict instead of overwriting either side", () => {
  const result = Core.reconcile({ [K]: "local" }, { [K]: "remote" }, {});
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.local[K], "local");
  assert.equal(result.remote[K], "remote");
  assert.equal(result.changedLocal, false);
  assert.equal(result.changedRemote, false);
});

test("three-way merge uploads a browser-only edit", () => {
  const result = Core.reconcile({ [K]: "new local" }, { [K]: "old" }, { [K]: "old" });
  assert.equal(result.remote[K], "new local");
  assert.equal(result.base[K], "new local");
  assert.equal(result.conflicts.length, 0);
});

test("three-way merge downloads a Drive-only edit", () => {
  const result = Core.reconcile({ [K]: "old" }, { [K]: "new remote" }, { [K]: "old" });
  assert.equal(result.local[K], "new remote");
  assert.equal(result.base[K], "new remote");
  assert.equal(result.conflicts.length, 0);
});

test("three-way merge propagates deletion and detects divergent edits", () => {
  const deleted = Core.reconcile({}, { [K]: "old" }, { [K]: "old" });
  assert.equal(Object.hasOwn(deleted.remote, K), false);
  assert.equal(deleted.conflicts.length, 0);

  const conflict = Core.reconcile({ [K]: "local edit" }, { [K]: "remote edit" }, { [K]: "old" });
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(conflict.local[K], "local edit");
  assert.equal(conflict.remote[K], "remote edit");
});

test("Drive document parser ignores unrelated keys but rejects malformed managed data", () => {
  const doc = Core.normalizeDocument({
    version: 1,
    items: { [K]: { value: "ok" }, unrelated: { value: "no" } },
  });
  assert.deepEqual(doc.values, { [K]: "ok" });
  assert.throws(() => Core.normalizeDocument({}), /malformed/);
  assert.throws(() => Core.normalizeDocument({ version: 2, items: {} }), /malformed/);
  assert.throws(() => Core.normalizeDocument({ version: 1, items: { [K]: { value: 3 } } }), /Malformed/);
});

test("Drive API errors are categorized without exposing identifiers or links", () => {
  const message = Core.describeDriveError({
    status: 403,
    reason: "accessNotConfigured",
    apiMessage: "Drive API is disabled for project 123456789012. Visit https://console.example/setup as owner@example.com",
  });
  assert.match(message, /403 · accessNotConfigured/);
  assert.match(message, /Drive API 사용 설정/);
  assert.match(message, /Drive API is disabled/);
  assert.doesNotMatch(message, /123456789012|https:\/\/|owner@example\.com/);
  assert.match(message, /이 브라우저 저장은 유지/);
  assert.match(Core.describeDriveError({ status: 403, reason: "SERVICE_DISABLED" }), /Drive API 사용 설정/);
});

test("network and expired-token errors give distinct recovery guidance", () => {
  assert.match(Core.describeDriveError(new TypeError("Failed to fetch")), /네트워크 연결/);
  assert.match(Core.describeDriveError({ status: 401, reason: "authError" }), /다시 연결/);
});

test("Drive writes use the v3 JSON version because browser CORS may hide ETag", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "shared", "lab-drive-sync.js"), "utf8");
  assert.match(source, /files\(id,name,createdTime,modifiedTime,version\)/);
  assert.match(source, /assertRemoteVersion/);
  assert.doesNotMatch(source, /headers\.get\(["']etag["']\)/i);
});

test("OAuth access token is reused during same-tab page navigation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "shared", "lab-drive-sync.js"), "utf8");
  assert.match(source, /sessionStorage\.setItem\(SESSION_TOKEN_KEY/);
  assert.match(source, /const cached = readSessionToken\(\)/);
  assert.match(source, /accessToken = cached\.accessToken/);
  assert.match(source, /clearSessionToken\(\)/);
});

test("every page loads the shared sync scripts in dependency order", () => {
  const root = path.join(__dirname, "..");
  const pages = [path.join(root, "site/templates/index.html")];
  for (const name of fs.readdirSync(path.join(root, "experiments"))) {
    pages.push(path.join(root, "experiments", name, "index.html"));
  }
  for (const page of pages) {
    const html = fs.readFileSync(page, "utf8");
    const config = html.indexOf("lab-config.js");
    const core = html.indexOf("lab-sync-core.js");
    const client = html.indexOf("lab-drive-sync.js");
    assert.ok(config >= 0 && config < core && core < client, page);
  }
});
