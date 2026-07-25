#!/usr/bin/env node
/* ==========================================================================
   make-data.mjs — PokéAPI CSV → ../data.js 생성 (1회성 생성 스크립트)

   실행: node experiments/004-type-quiz/tools/make-data.mjs
   출처: https://github.com/PokeAPI/pokeapi (data/v2/csv, CC0가 아닌 포켓몬
   이름 자체는 Nintendo/Game Freak 소유 — 팬 프로젝트 비상업 사용)

   추출 규칙:
   - 기본 폼(is_default=1) + 타입이 달라지는 변형 폼:
     리전 폼(알로라/가라르/히스이/팔데아), 메가진화(X/Y 포함), 원시회귀,
     로토무 폼체인지. 기본 폼과 타입 조합이 같은 변형(예: 메가이상해꽃)은
     중복 정답만 늘리므로 제외. 변형의 세대는 등장 세대로 덮어쓴다
     (히스이 윈디 = 8세대, 1세대 아님).
   - 단일 타입도 포함 (t2=0) — 쉬움 난이도의 단일 타입 문제용.
   - main 플래그 = 최종 진화형(다른 종의 진화 전 단계가 아님) 또는 전설/환상.
     "주류 포켓몬 위주" 난이도 필터의 근사치.
   - 이름은 한국어(language 3) + 영어(language 9) 둘 다 담는다.
   ========================================================================== */

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const FILES = ['pokemon.csv', 'pokemon_types.csv', 'pokemon_species.csv',
  'pokemon_species_names.csv', 'type_names.csv'];

// 따옴표 필드까지 처리하는 최소 CSV 파서
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => {
    const o = {};
    header.forEach((h, i) => (o[h] = r[i]));
    return o;
  });
}

async function get(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return parseCSV(await res.text());
}

const [pokemon, ptypes, species, spNames, typeNames] = await Promise.all(FILES.map(get));

// 타입 이름 (id 1–18만: unknown/shadow/stellar 제외)
const KO = '3', EN = '9';
const types = {};
for (const t of typeNames) {
  const id = Number(t.type_id);
  if (id < 1 || id > 18) continue;
  types[id] = types[id] || [null, null];
  if (t.local_language_id === KO) types[id][0] = t.name;
  if (t.local_language_id === EN) types[id][1] = t.name;
}

const genOf = new Map(species.map((s) => [s.id, Number(s.generation_id)]));

// 주류 판정: 최종 진화형(= 어떤 종도 이 종에서 진화하지 않음) 또는 전설/환상
const hasEvo = new Set(species.map((s) => s.evolves_from_species_id).filter(Boolean));
const isMain = new Map(species.map((s) => [s.id,
  !hasEvo.has(s.id) || s.is_legendary === '1' || s.is_mythical === '1' ? 1 : 0]));

const names = new Map(); // species_id -> {ko, en}
for (const n of spNames) {
  const rec = names.get(n.pokemon_species_id) || {};
  if (n.local_language_id === KO) rec.ko = n.name;
  if (n.local_language_id === EN) rec.en = n.name;
  names.set(n.pokemon_species_id, rec);
}

const typesOf = new Map(); // pokemon_id -> [type_id by slot]
for (const t of ptypes) {
  const arr = typesOf.get(t.pokemon_id) || [];
  arr[Number(t.slot) - 1] = Number(t.type_id);
  typesOf.set(t.pokemon_id, arr);
}

// 변형 폼 규칙: [identifier 접미사, 이름 변환, 등장 세대]
const FORM_RULES = [
  ['-mega-x', (ko, en) => [`메가${ko}X`, `Mega ${en} X`], 6],
  ['-mega-y', (ko, en) => [`메가${ko}Y`, `Mega ${en} Y`], 6],
  ['-mega', (ko, en) => [`메가${ko}`, `Mega ${en}`], 6],
  ['-primal', (ko, en) => [`원시${ko}`, `Primal ${en}`], 6],
  ['-alola', (ko, en) => [`알로라 ${ko}`, `Alolan ${en}`], 7],
  ['-galar', (ko, en) => [`가라르 ${ko}`, `Galarian ${en}`], 8],
  ['-hisui', (ko, en) => [`히스이 ${ko}`, `Hisuian ${en}`], 8],
  ['-paldea', (ko, en) => [`팔데아 ${ko}`, `Paldean ${en}`], 9],
];
// 접미사 규칙으로 못 만드는 고유 명칭 폼 (identifier → [ko, en, gen])
const EXTRA_FORMS = {
  'rotom-heat': ['히트로토무', 'Heat Rotom', 4],
  'rotom-wash': ['워시로토무', 'Wash Rotom', 4],
  'rotom-frost': ['프로스트로토무', 'Frost Rotom', 4],
  'rotom-fan': ['스핀로토무', 'Fan Rotom', 4],
  'rotom-mow': ['커트로토무', 'Mow Rotom', 4],
};

const defaultOf = new Map(); // species_id -> default pokemon row
for (const p of pokemon) if (p.is_default === '1') defaultOf.set(p.species_id, p);
const pairKey = (tt) => [...tt].sort((a, b) => a - b).join('-');

const mons = [];
let skipped = 0;
for (const p of pokemon) {
  const tt = typesOf.get(p.id) || [];
  const nm = names.get(p.species_id);
  const gen = genOf.get(p.species_id);
  if (!nm?.ko || !nm?.en || !gen) { skipped++; continue; }

  const main = isMain.get(p.species_id) || 0;

  if (p.is_default === '1') {
    mons.push([Number(p.species_id), gen, tt[0], tt[1] || 0, nm.ko, nm.en, Number(p.id), main]);
    continue;
  }

  // 변형 폼: 규칙에 맞고, 기본 폼과 타입 조합이 다를 때만
  let name2 = null, formGen = null;
  if (EXTRA_FORMS[p.identifier]) {
    const [ko, en, g] = EXTRA_FORMS[p.identifier];
    name2 = [ko, en]; formGen = g;
  } else {
    const rule = FORM_RULES.find(([suf]) => p.identifier.endsWith(suf));
    if (rule) { name2 = rule[1](nm.ko, nm.en); formGen = rule[2]; }
  }
  if (!name2) continue;
  const base = defaultOf.get(p.species_id);
  const baseTT = base ? typesOf.get(base.id) || [] : [];
  if (pairKey(tt) === pairKey(baseTT)) continue; // 타입 그대로면 제외
  mons.push([Number(p.species_id), formGen, tt[0], tt[1] || 0, name2[0], name2[1], Number(p.id), main]);
}
mons.sort((a, b) => a[0] - b[0]);

const out = `/* generated by tools/make-data.mjs (${new Date().toLocaleDateString('sv-SE')}) — do not edit by hand.
   source: PokeAPI CSV. mons: [dexNo, gen, type1, type2(단일이면 0), koName, enName, pokeId, main]
   (pokeId는 스프라이트 URL용 — 폼은 dexNo와 다름 · main=1: 최종 진화/전설) */
window.POKEDATA = ${JSON.stringify({ types, mons })};
`;

const { writeFileSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');
const path = await import('node:path');
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(path.join(dir, 'data.js'), out);

// index.html의 캐시 버스터(?v=)를 자동 갱신 — 배포 후 브라우저가 옛 data.js를 캐시하는 문제 방지
const { readFileSync } = await import('node:fs');
const idxPath = path.join(dir, 'index.html');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const idx = readFileSync(idxPath, 'utf8');
writeFileSync(idxPath, idx.replace(/src="data\.js(\?v=\d*)?"/, `src="data.js?v=${stamp}"`));

const duals = mons.filter((m) => m[3]);
const combos = new Set(duals.map((m) => [m[2], m[3]].sort((a, b) => a - b).join('-')));
console.log(`mons: ${mons.length} (dual ${duals.length}, main ${mons.filter((m) => m[7]).length}, skipped ${skipped}), dual combos: ${combos.size}, bytes: ${out.length}`);
