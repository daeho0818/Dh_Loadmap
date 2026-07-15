#!/usr/bin/env node
/* ==========================================================================
   build.js — scans experiments/ and generates the static site into dist/.
   Zero dependencies: Node built-ins only (fs, path).

   Flow:
     1. read site.config.json (title, motto, ...)
     2. scan experiments/<slug>/meta.json
     3. render index.html (stats + grass + cards) from templates/
     4. copy each experiment folder into dist/experiments/
     5. copy shared style.css into dist/

   New experiment = copy a folder, edit meta.json, rebuild. No code change.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXPERIMENTS_DIR = path.join(ROOT, 'experiments');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const DIST = path.join(ROOT, 'dist');
const CONFIG_PATH = path.join(ROOT, 'site.config.json');

const DEFAULT_CONFIG = {
  title: '실험실 (placeholder)',
  taglineEn: 'weekend experiments',
  motto: '주말마다 하나씩. 완성도보다 완료.',
};

// --- tiny helpers ----------------------------------------------------------

function readJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Failed to read JSON ${p}: ${e.message}`);
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// --- ISO week math (parse "2026-W29", find week-of-year for a date) --------

function isoWeekOf(date) {
  // Returns [isoYear, isoWeek] for a JS Date (UTC-safe enough for weekly buckets).
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return [d.getUTCFullYear(), week];
}

function weekKey(year, week) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// --- load experiments ------------------------------------------------------

function loadExperiments() {
  if (!fs.existsSync(EXPERIMENTS_DIR)) return [];
  const out = [];
  for (const entry of fs.readdirSync(EXPERIMENTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(EXPERIMENTS_DIR, entry.name);
    const metaPath = path.join(dir, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      console.warn(`  ! skip ${entry.name} (no meta.json)`);
      continue;
    }
    const meta = readJSON(metaPath);
    meta._folder = entry.name;
    meta._hasThumb = fs.existsSync(path.join(dir, 'thumb.svg'));
    out.push(meta);
  }
  // latest first
  out.sort((a, b) => (b.id || 0) - (a.id || 0));
  return out;
}

// --- render pieces ---------------------------------------------------------

function renderCards(exps) {
  if (!exps.length) {
    return '<p style="color:var(--text-muted);font-size:14px;">아직 실험이 없습니다 · no experiments yet</p>';
  }
  return exps
    .map((e) => {
      const href = `./experiments/${e._folder}/`;
      const num = '#' + String(e.id).padStart(3, '0');
      const thumb = e._hasThumb
        ? `<img class="card-thumb" src="${href}thumb.svg" alt="" aria-hidden="true" />`
        : `<div class="card-thumb" style="background:var(--surface-1);"></div>`;
      const tags = (e.tags || []).join(' · ');
      return `
        <a class="card" href="${href}">
          ${thumb}
          <div class="card-body">
            <div class="card-meta">${esc(num)} · ${esc(e.date || '')}</div>
            <div class="card-title">${esc(e.title || e.slug)}</div>
            <div class="card-oneliner">${esc(e.oneliner || '')}</div>
          </div>
        </a>`;
    })
    .join('\n');
}

function renderGrass(exps) {
  const WEEKS = 52;
  // count experiments per iso week
  const counts = new Map();
  for (const e of exps) {
    let key = e.week;
    if (!key && e.date) {
      const [y, w] = isoWeekOf(new Date(e.date));
      key = weekKey(y, w);
    }
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  // walk back WEEKS weeks from today
  const cells = [];
  const today = new Date();
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const [y, w] = isoWeekOf(d);
    const c = counts.get(weekKey(y, w)) || 0;
    const level = c === 0 ? 0 : c === 1 ? 2 : 3;
    const color = `var(--grass-${level})`;
    cells.push(
      `<div class="grass-cell" style="background:${color};" title="${weekKey(y, w)}: ${c}"></div>`
    );
  }
  return cells.join('');
}

function computeActiveDays(exps) {
  // distinct dates with at least one experiment — accumulation, not a streak
  return new Set(exps.filter((e) => e.date).map((e) => e.date)).size;
}

// --- main ------------------------------------------------------------------

function build() {
  const config = { ...DEFAULT_CONFIG, ...readJSON(CONFIG_PATH, {}) };
  const exps = loadExperiments();
  console.log(`\n[build] ${exps.length} experiment(s) found`);

  const latest = exps[0];
  const latestLabel = latest ? '#' + String(latest.id).padStart(3, '0') : '—';

  const tpl = fs.readFileSync(path.join(TEMPLATES_DIR, 'index.html'), 'utf8');
  const html = tpl
    .replace(/{{SITE_TITLE}}/g, esc(config.title))
    .replace(/{{SITE_TAGLINE_EN}}/g, esc(config.taglineEn))
    .replace(/{{SITE_MOTTO}}/g, esc(config.motto))
    .replace(/{{STAT_COUNT}}/g, String(exps.length))
    .replace(/{{STAT_DAYS}}/g, computeActiveDays(exps) + '일')
    .replace(/{{STAT_LATEST}}/g, esc(latestLabel))
    .replace(/{{GRASS}}/g, renderGrass(exps))
    .replace(/{{CARDS}}/g, renderCards(exps))
    .replace(/{{BUILD_DATE}}/g, new Date().toISOString().slice(0, 10));

  // write dist
  rmDir(DIST);
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
  fs.copyFileSync(
    path.join(TEMPLATES_DIR, 'style.css'),
    path.join(DIST, 'style.css')
  );

  // copy experiments
  const distExp = path.join(DIST, 'experiments');
  for (const e of exps) {
    copyDir(path.join(EXPERIMENTS_DIR, e._folder), path.join(distExp, e._folder));
  }
  // .nojekyll so GitHub Pages serves _folders/underscored files as-is
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  console.log(`[build] wrote ${path.relative(ROOT, DIST)}/`);
  console.log(`[build] done.\n`);
}

build();
