/* A Little Window — illustrated scenery + local photographic plates, with live weather. */
(() => {
  'use strict';
  const W = 1600, H = 1000;
  const illustrationPane = { x: 280, y: 72, w: 1060, h: 704 };
  const photographicPane = { x: 242, y: 34, w: 1118, h: 740 };
  let pane = illustrationPane;
  const scene = document.querySelector('#scene');
  const ctx = scene.getContext('2d', { alpha: false });
  const exterior = document.createElement('canvas');
  const interior = document.createElement('canvas');
  const oldExterior = document.createElement('canvas');
  const oldInterior = document.createElement('canvas');
  for (const c of [exterior, interior, oldExterior, oldInterior]) { c.width = W; c.height = H; }
  const weathers = {
    sunny: { title: '햇살이 쉬어가는 창가', copy: '빛 한 조각, 따뜻한 차 한 잔. 서두르지 않는 하루.', en: 'SUNNY', name: '화창', sky: ['#87bac1', '#f3dfaf'], hill: '#829484', tree: '#526b4a', lake: '#8eafb0', index: 1 },
    rain: { title: '비가 머무는 오후', copy: '창밖은 조금 흐려도, 이 안은 따뜻하니까.', en: 'RAINY', name: '비', sky: ['#7a939c', '#c0c9be'], hill: '#738984', tree: '#446653', lake: '#859d97', index: 2 },
    snow: { title: '소리 없이 하얘지는 세상', copy: '천천히 내려앉는 눈. 잠시 멈춰도 좋은 풍경.', en: 'SNOWY', name: '눈', sky: ['#a0b7c6', '#e2ded2'], hill: '#b2bec0', tree: '#678578', lake: '#bdcdcb', index: 3 },
    fog: { title: '안개 너머의 느린 아침', copy: '멀리 보이지 않아도, 지금 이곳은 선명해요.', en: 'MISTY', name: '안개', sky: ['#9aaba8', '#ddd8c6'], hill: '#9daa9c', tree: '#738575', lake: '#b3bfb3', index: 4 },
    storm: { title: '폭풍을 바라보는 작은 방', copy: '바깥의 소란은 멀리 두고, 포근한 곳에 머물러요.', en: 'STORMY', name: '뇌우', sky: ['#4e626b', '#91a2a2'], hill: '#536b6b', tree: '#354e47', lake: '#607c7e', index: 5 }
  };
  const defaults = { weather: 'rain', style: 'realistic', hour: 16, volume: 35 };
  let state = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem('lab.window011.v1'));
    if (saved && typeof saved === 'object') {
      if (weathers[saved.weather]) state.weather = saved.weather;
      if (['casual', 'realistic'].includes(saved.style)) state.style = saved.style;
      if (Number.isFinite(saved.hour) && saved.hour >= 0 && saved.hour <= 23.75) state.hour = saved.hour;
      if (Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 100) state.volume = saved.volume;
    }
  } catch (_) { /* Storage is optional, including when opened as a file. */ }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reducedMotion.matches, elapsed = 0, last = 0, transitionStart = -2000;
  let frameId = 0, dirty = true, scale = 1, offsetX = 0, offsetY = 0;
  let real = false, light = 1, p, rng, g;
  let hasScene = false;
  const photoRequests = new Set();
  let audio = null, soundOn = false;
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mix(a, b, t) {
    const parse = s => s.match(/[a-f0-9]{2}/gi).map(x => parseInt(x, 16));
    const aa = parse(a), bb = parse(b);
    return '#' + aa.map((v, i) => Math.round(v + (bb[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function daylight(h) { return Math.min(1, Math.max(0, (h - 5) / 3), Math.max(0, (20 - h) / 3)); }
  const night = color => mix('#172631', color, light);
  function rect(x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
  function ellipse(x, y, rx, ry, color) { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  function path(points, color, stroke, width = 1) {
    g.beginPath(); points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath(); if (color) { g.fillStyle = color; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
  }
  function line(x, y, a, b, color, width = 1) { g.beginPath(); g.moveTo(x, y); g.lineTo(a, b); g.strokeStyle = color; g.lineWidth = width; g.stroke(); }
  function grad(x, y, x2, y2, stops) { const z = g.createLinearGradient(x, y, x2, y2); stops.forEach(([at, color]) => z.addColorStop(at, color)); return z; }
  function glow(x, y, radius, color) { const z = g.createRadialGradient(x, y, 0, x, y, radius); z.addColorStop(0, color); z.addColorStop(1, 'transparent'); g.fillStyle = z; g.fillRect(x - radius, y - radius, radius * 2, radius * 2); }
  function rounded(x, y, w, h, r, color) { g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
  function mountain(y, amp, color, seed, snowy) {
    if (real) {
      const ridge = [];
      for (let x = 0; x <= W + 4; x += 4) {
        const yy = y - amp * (.35 + Math.sin(x * .005 + seed) * .25 + Math.sin(x * .013 + seed * 5) * .16 + Math.sin(x * .049 + seed) * .035 + hash(x + seed) * .035);
        ridge.push([x, yy]);
      }
      path([[0, H], ...ridge, [W, H]], grad(0, y - amp, 0, y + 170, [[0, mix(color, '#d3d9c5', .08)], [1, color]]));
      g.save(); path([[0, H], ...ridge, [W, H]]); g.clip();
      for (let i = 0; i < 170; i++) {
        const x = rng() * W, yy = y - amp + rng() * amp;
        line(x, yy, x + 15 + rng() * 25, yy + 45 + rng() * 100, i % 2 ? '#e0e4cf0b' : '#344c5012', 2 + rng() * 8);
      }
      if (snowy) {
        for (let i = 0; i < ridge.length - 1; i++) {
          const [x, yy] = ridge[i];
          if (yy < y - amp * .52) path([[x, yy], [x + 5, ridge[i + 1][1]], [x + 5, yy + 10 + hash(x) * 16], [x, yy + 5 + hash(x + 7) * 19]], night('#d4ded8'));
        }
      }
      g.restore(); return;
    }
    const points = [[0, H], [0, y]];
    for (let x = 0; x <= W + 100; x += 95) points.push([x, y - hash(seed + x) * amp]);
    points.push([W, H]); path(points, color);
    if (snowy) for (let i = 2; i < points.length - 2; i += 2) {
      const [x, yy] = points[i]; path([[x - 36, yy + 47], [x, yy], [x + 37, yy + 43], [x + 5, yy + 27], [x - 9, yy + 32]], night('#dde5df'));
    }
  }
  function pine(x, y, size, color, snowy = false) {
    const lean = hash(x + y) * 8 - 4;
    rect(x - size * .027, y - size * .7, size * .054, size * .76, night('#5b6554'));
    for (let k = 0; k < 5; k++) {
      const yy = y - size + k * size * .16, w = size * (.17 + k * .065);
      if (real) {
        const points = [[x + lean, yy]];
        for (let j = 1; j <= 8; j++) points.push([x - w * j / 8 * (.85 + hash(x + j * 11) * .2), yy + size * .33 * j / 8]);
        for (let j = 8; j >= 0; j--) points.push([x + w * j / 8 * (.85 + hash(x + j * 31) * .2), yy + size * .33 * j / 8]);
        path(points, mix(color, night('#7b9276'), k * .045));
      } else path([[x + lean, yy], [x - w, yy + size * .33], [x + w, yy + size * .33]], mix(color, night('#7b9276'), k * .07));
      if (snowy) path([[x + lean, yy], [x - w * .8, yy + size * .23], [x + w * .6, yy + size * .19]], night('#e7e9df'));
      if (real) for (let j = 0; j < 16; j++) {
        const by = yy + size * (.1 + rng() * .2), bx = (rng() - .5) * w;
        line(x + lean, by - size * .07, x + bx, by, mix(color, '#bfd0b6', rng() * .18), .8);
      }
    }
  }
  function tree(x, y, size, color) {
    line(x, y, x - 3, y - size * .75, night('#665b49'), size * .065);
    for (let k = 0; k < (real ? 160 : 28); k++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * size * .32;
      const xx = x + Math.cos(a) * rr, yy = y - size * .65 + Math.sin(a) * rr * .8;
      const detail = real ? .35 : 1;
      ellipse(xx, yy, size * (.09 + rng() * .1) * detail, size * (.06 + rng() * .12) * detail, mix(color, night('#b3b58b'), rng() * .35));
      if (state.weather === 'snow') ellipse(xx, yy - size * .07, size * .095, size * .035, night('#e4e9e1'));
    }
  }
  function cottage(x, y, width, height, color, roof) {
    const wall = real ? grad(x, y, x + width, y + height, [[0, night(color)], [1, night(mix(color, '#514b3f', .38))]]) : night(color);
    rect(x, y, width, height, wall);
    path([[x - 12, y + 2], [x + width * .5, y - height * .55], [x + width + 12, y + 2]], night(roof));
    path([[x + width * .5, y - height * .55], [x + width + 12, y + 2], [x + width * .65, y + 2]], night(mix(roof, '#332f30', .28)));
    rect(x + width * .72, y - height * .58, 17, height * .3, night('#917565'));
    rect(x + width * .69, y - height * .6, 25, 7, night('#565345'));
    if (state.weather === 'snow') path([[x - 13, y - 1], [x + width * .5, y - height * .58], [x + width + 14, y - 1], [x + width * .91, y + 4], [x + width * .5, y - height * .46], [x + 6, y + 6]], night('#eef0e5'));
    if (real) {
      for (let xx = x + 8; xx < x + width; xx += 12) line(xx, y + 2, xx, y + height, night('#aa9380'), .6);
      for (let yy = 7; yy < height * .52; yy += 10) line(x + yy, y - yy, x + width - yy, y - yy, night('#aa9184'), .6);
    }
    for (let k = 0; k < 2; k++) {
      const wx = x + width * (.16 + k * .5), wy = y + height * .18;
      const shine = light < .65 || state.weather !== 'sunny';
      rect(wx - 5, wy - 5, width * .19 + 10, height * .32 + 10, night('#695949'));
      rect(wx, wy, width * .19, height * .32, shine ? '#dfbb75' : '#8ca9a0');
      line(wx + width * .095, wy, wx + width * .095, wy + height * .32, '#746448', 2);
      line(wx, wy + height * .16, wx + width * .19, wy + height * .16, '#746448', 2);
      if (shine) glow(wx + 15, wy + 18, real ? 48 : 28, '#e6b86025');
    }
    rect(x + width * .42, y + height * .5, width * .16, height * .5, night('#5b6555'));
    ellipse(x + width * .53, y + height * .77, 1.8, 1.8, '#cfc19a');
    rect(x - 5, y + height, width + 10, 7, night('#b4ad91'));
  }
  function buildExterior() {
    g = exterior.getContext('2d'); g.clearRect(0, 0, W, H); rng = seeded(411); p = weathers[state.weather];
    real = state.style === 'realistic'; light = daylight(state.hour);
    let skyTop = night(p.sky[0]), skyBottom = night(p.sky[1]);
    const sunset = light > 0 && (state.hour > 16 || state.hour < 8) ? (1 - light) : 0;
    if (state.weather === 'sunny') skyBottom = mix(skyBottom, '#d89177', sunset * .75);
    rect(0, 0, W, H, grad(0, 0, 0, 650, [[0, skyTop], [1, skyBottom]]));
    if (light < .5) {
      for (let k = 0; k < 110; k++) ellipse(160 + rng() * 1320, 55 + rng() * 310, rng() * 1.2 + .4, rng() * 1.2 + .4, `rgba(234,236,216,${(1-light)*rng()*.7})`);
      glow(1050, 160, 150, '#b5d5d916'); ellipse(1050, 160, 25, 25, '#e5e8ce'); ellipse(1060, 153, 24, 24, skyTop);
    } else if (state.weather === 'sunny') {
      const sx = 475 + (state.hour - 6) * 47, sy = 100 + Math.abs(12 - state.hour) * 14;
      glow(sx, sy, 270, real ? '#ffe9bb65' : '#fff3c158'); ellipse(sx, sy, 37, 37, '#f8e6b5');
    }
    for (let i = 0; i < 10; i++) {
      g.save(); if (real) g.filter = 'blur(17px)';
      ellipse(100 + i * 175, 110 + rng() * 125, 120 + rng() * 150, 20 + rng() * 23, state.weather === 'storm' ? '#364e5a40' : '#e4e6d430'); g.restore();
    }
    mountain(390, 230, night(mix(p.hill, p.sky[1], .65)), 14, true);
    mountain(420, 160, night(mix(p.hill, p.sky[1], .42)), 2, state.weather === 'snow');
    mountain(486, 145, night(mix(p.hill, p.sky[1], .18)), 9, false);
    for (let i = 0; i < 100; i++) pine(i * 18, 487 + hash(i) * 21, 22 + hash(i + 17) * 57, night(mix(p.tree, p.sky[1], .42)), state.weather === 'snow');
    const reflection = document.createElement('canvas'); reflection.width = W; reflection.height = 480;
    reflection.getContext('2d').drawImage(exterior, 0, 45, W, 480, 0, 0, W, 480);
    rect(0, 517, W, 310, grad(0, 517, 0, 830, [[0, night(p.lake)], [1, night(mix(p.lake, '#8b9981', .45))]]));
    g.save(); g.translate(0, 518); g.scale(1, -.57); g.globalAlpha = real ? .32 : .2; g.drawImage(reflection, 0, -480); g.restore();
    for (let i = 0; i < (real ? 470 : 100); i++) {
      const yy = 522 + rng() * 310, xx = rng() * W;
      line(xx, yy, xx + 10 + rng() * 95, yy, light < .5 ? '#bdcec812' : '#e8e7cc25', real ? .7 : 1.2);
    }
    path([[0, 570], [330, 550], [515, 590], [640, 652], [750, 699], [620, 756], [0, 810]], night(state.weather === 'snow' ? '#dce1d6' : '#718564'));
    path([[1600, 525], [1270, 540], [1100, 598], [1010, 679], [870, 757], [1140, 795], [1600, 839]], night(state.weather === 'snow' ? '#e0e2d5' : '#879072'));
    path([[1290, 588], [1278, 618], [1160, 656], [1080, 747], [1017, 771], [1168, 661], [1300, 625]], night(state.weather === 'snow' ? '#f1ebd7' : '#b8ad88'));
    for (let i = 0; i < 17; i++) pine(1070 + rng() * 470, 590 + rng() * 90, 48 + rng() * 70, night(mix(p.tree, '#7a8561', .1)), state.weather === 'snow');
    cottage(1130, 557, 140, 99, '#c0b194', '#716f5a'); cottage(865, 562, 186, 131, '#d4bd9b', '#956b50');
    for (let i = 0; i < 15; i++) pine(70 + rng() * 420, 620 + rng() * 180, 110 + rng() * 140, night(p.tree), state.weather === 'snow');
    tree(605, 738, 153, night(state.weather === 'sunny' ? '#879564' : p.tree));
    for (let i = 0; i < 16; i++) {
      const xx = 910 + i * 23; line(xx, 694 + i * .35, xx, 725 + i * .35, night('#898a6a'), 3);
      if (i) { line(xx - 23, 702 + i * .35, xx, 702 + i * .35, night('#a3a180'), 3); line(xx - 23, 717 + i * .35, xx, 717 + i * .35, night('#99987b'), 2); }
    }
    path([[0, 770], [260, 700], [380, 755], [470, 796], [660, 785], [840, 830], [1600, 799], [1600, 1000], [0, 1000]], night(state.weather === 'snow' ? '#e4e7dd' : '#607652'));
    if (state.weather !== 'snow') for (let i = 0; i < 280; i++) {
      const xx = rng() * W, yy = 810 + rng() * 180;
      line(xx, yy, xx + rng() * 8 - 4, yy - 3 - rng() * 13, night(mix('#526649', '#a9b18c', rng())), .8);
    }
    if (state.weather === 'fog' || state.weather === 'snow' || real) {
      const z = g.createLinearGradient(0, 240, 0, 690); z.addColorStop(0, '#d9dfd100'); z.addColorStop(.5, state.weather === 'fog' ? '#d5ddd68c' : '#d5ddd626'); z.addColorStop(1, '#d9dfd100'); rect(0, 240, W, 450, z);
    }
    if (real) { g.fillStyle = '#eef3e318'; for (let i = 0; i < 18000; i++) g.fillRect(rng() * W, rng() * H, 1, 1); }
  }
  function wood(x, y, w, h, base, horizontal = false) {
    rect(x, y, w, h, real ? grad(x, y, horizontal ? x : x + w, horizontal ? y + h : y, [[0, mix(base, '#e1bf89', .16)], [.45, base], [1, mix(base, '#241e19', .25)]]) : base);
    if (real) for (let i = 0; i < Math.max(w, h) / 7; i++) {
      const pos = rng(); g.beginPath();
      if (horizontal) { g.moveTo(x, y + pos * h); g.bezierCurveTo(x + w * .25, y + pos * h + 2, x + w * .6, y + pos * h - 2, x + w, y + pos * h); }
      else { g.moveTo(x + pos * w, y); g.bezierCurveTo(x + pos * w + 2, y + h * .3, x + pos * w - 2, y + h * .8, x + pos * w, y + h); }
      g.strokeStyle = i % 2 ? '#e8c69815' : '#20180f22'; g.lineWidth = .6; g.stroke();
    }
  }
  function buildInterior() {
    g = interior.getContext('2d'); g.clearRect(0, 0, W, H); rng = seeded(124);
    const roomLight = .53 + light * .32;
    const wall = mix('#393a31', real ? '#827a64' : '#94917a', roomLight);
    g.fillStyle = real ? grad(0, 0, W, H, [[0, wall], [.5, mix(wall, '#d0b688', .14)], [1, mix(wall, '#252c25', .28)]]) : wall;
    g.beginPath(); g.rect(0, 0, W, H); g.rect(pane.x, pane.y, pane.w, pane.h); g.fill('evenodd');
    if (real) for (let k = 0; k < 11000; k++) { g.fillStyle = k % 2 ? '#ecdfad10' : '#2527190d'; g.fillRect(rng() * W, rng() * H, rng() * 2 + .5, 1); }
    rect(0, 860, W, 140, grad(0, 860, 0, 1000, [[0, '#615542'], [1, '#3e3b2f']]));
    for (let y = 895; y < H; y += 37) { line(0, y, W, y, '#24271f39', 2); line(600 + hash(y) * 650, y - 37, 600 + hash(y) * 650, y, '#292c2140', 1); }
    // Deep walnut frame; inner bevels sit between the glass and room.
    g.save(); g.shadowColor = '#101a1788'; g.shadowBlur = 22; g.shadowOffsetY = 8;
    rect(252, 42, 1116, 34, '#524939'); rect(252, 42, 32, 764, '#4c4535'); rect(1336, 42, 32, 764, '#494433'); g.restore();
    wood(260, 48, 20, 739, '#786246'); wood(1340, 48, 20, 739, '#6d5b41'); wood(260, 49, 1100, 21, '#80684a', true);
    line(283, 73, 283, 785, '#b69b6e', 3); line(1335, 73, 1335, 785, '#3e4135', 4);
    for (const x of [638, 993]) { rect(x - 3, 69, 20, 719, '#3d4233'); wood(x, 71, 10, 718, '#897050'); line(x + 10, 72, x + 10, 778, '#b29a71', 1); }
    wood(280, 299, 1060, 12, '#746246', true); line(280, 312, 1340, 312, '#303c3338', 3);
    wood(253, 778, 1116, 23, '#736044', true);
    // Reflections of the room on the upper glass.
    g.save(); g.beginPath(); g.rect(pane.x, pane.y, pane.w, pane.h); g.clip();
    path([[287, 76], [361, 76], [767, 776], [728, 776]], '#faf1cc05');
    path([[994, 73], [1043, 73], [1340, 551], [1340, 607]], '#fff1bd07');
    if (real) glow(362, 405, 170, '#f1b76313'); g.restore();
    // Linen curtains, gathered to leave the view open.
    const curtain = real ? '#b4b098' : '#bbb99f';
    for (let i = 0; i < 9; i++) {
      const x = 207 + i * 8;
      path([[x, 34], [x + 15, 34], [x + 15 + i * .8, 350], [x - 5, 669], [x - 25, 796], [x - 37, 796], [x - 3, 375]], mix(curtain, '#545b45', i % 3 * .12));
      line(x + 6, 50, x + 2, 375, '#ede3b72b', 1);
    }
    rounded(201, 493, 65, 15, 7, '#6f6e51');
    wood(236, 801, 1151, 37, '#a68b61', true); wood(248, 838, 1124, 18, '#65533c', true);
    line(240, 803, 1383, 803, '#d1b989', 2);
    // Amber reading lamp.
    glow(174, 646, real ? 330 : 245, '#ffc46b28');
    ellipse(169, 863, 86, 13, '#262c2480'); ellipse(162, 846, 58, 13, '#555646');
    rounded(156, 557, 9, 286, 4, '#4b5544'); rounded(145, 830, 36, 14, 5, '#7c7b59');
    path([[107, 456], [213, 456], [265, 599], [55, 599]], real ? grad(55, 500, 265, 580, [[0, '#c3b68e'], [.5, '#f4d9a0'], [1, '#a7956d']]) : '#decc95');
    ellipse(160, 597, 105, 12, '#b09a6c'); ellipse(160, 600, 87, 6, '#f8dca0');
    if (real) for (let x = 64; x < 260; x += 4) line(130 + (x - 130) * .5, 459, x, 595, '#8d79451b', .6);
    // Stacked books and an open page on the sill.
    rounded(360, 771, 142, 28, 3, '#748374'); rect(363, 777, 133, 17, '#d2c6a0'); rect(359, 773, 6, 25, '#61745f');
    rounded(350, 752, 137, 22, 3, '#9e7054'); rect(354, 757, 127, 12, '#d9cfac');
    rounded(369, 732, 126, 22, 3, '#aaa57b'); rect(376, 737, 114, 12, '#e2d5ae');
    path([[695, 823], [740, 789], [807, 801], [867, 789], [900, 825], [807, 835]], '#d8ceaa');
    line(807, 801, 807, 833, '#ac9878', 2);
    for (let i = 0; i < 6; i++) { line(745 - i * 4, 799 + i * 4, 796, 807 + i * 4, '#807f6238', 1); line(821, 807 + i * 4, 861 + i * 3, 799 + i * 4, '#807f6238', 1); }
    // Ceramic cup: the steam is drawn separately so it can drift.
    ellipse(578, 817, 60, 12, '#30352b35'); ellipse(578, 805, 48, 9, '#b3b293');
    g.beginPath(); g.ellipse(620, 770, 19, 20, 0, 0, Math.PI * 2); g.strokeStyle = '#c5c8ad'; g.lineWidth = 9; g.stroke();
    rounded(545, 750, 65, 52, [4, 4, 17, 17], real ? grad(545, 750, 610, 802, [[0, '#d3d6bf'], [.6, '#c1c6ad'], [1, '#939e85']]) : '#ced3b5');
    ellipse(577, 750, 32, 8, '#e0e2c8'); ellipse(577, 750, 26, 5, '#75654b'); ellipse(574, 749, 21, 3, '#928363');
    // A sleeping ginger cat, with a tail curled around its paws.
    ellipse(1163, 817, 99, 12, '#262e2240');
    ellipse(1161, 783, 86, 35, real ? grad(1100, 758, 1220, 820, [[0, '#c4a17a'], [1, '#92765a']]) : '#b49a73');
    ellipse(1110, 784, 38, 28, '#c6ad86');
    path([[1082, 774], [1085, 745], [1107, 764]], '#b99c76'); path([[1111, 763], [1141, 748], [1137, 781]], '#b99c76');
    path([[1087, 768], [1088, 755], [1100, 766]], '#ac856e'); path([[1120, 766], [1136, 755], [1132, 774]], '#ac856e');
    g.beginPath(); g.moveTo(1090, 786); g.quadraticCurveTo(1096, 791, 1102, 786); g.moveTo(1114, 786); g.quadraticCurveTo(1120, 791, 1126, 786); g.strokeStyle = '#69594a'; g.lineWidth = 1.5; g.stroke();
    path([[1105, 791], [1112, 791], [1109, 794]], '#8f6a57');
    for (let k = 0; k < 3; k++) { line(1080, 792 + k * 4, 1100, 794 + k, '#dec8a48c', .7); line(1117, 795 + k, 1139, 792 + k * 4, '#dec8a48c', .7); }
    g.beginPath(); g.moveTo(1230, 777); g.bezierCurveTo(1286, 807, 1201, 830, 1158, 808); g.strokeStyle = '#a28663'; g.lineWidth = 20; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(1155 + i * 14, 766 + i * 2, 4, 12, -.25, 0, Math.PI); g.strokeStyle = '#876e5145'; g.lineWidth = real ? 4 : 3; g.stroke(); }
    if (real) for (let k = 0; k < 450; k++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()); const x = 1161 + Math.cos(a) * r * 80, y = 783 + Math.sin(a) * r * 29; line(x, y, x + 3, y + 1.4, '#e4c69b25', .7); }
    // Tall leafy plant on the right.
    ellipse(1439, 884, 72, 13, '#222e2550');
    path([[1387, 785], [1490, 785], [1477, 876], [1402, 876]], real ? grad(1387, 785, 1490, 876, [[0, '#a07757'], [.5, '#b48b67'], [1, '#785c46']]) : '#a38461');
    ellipse(1439, 784, 52, 13, '#b49772'); ellipse(1439, 782, 43, 8, '#514f3a');
    for (let i = 0; i < 9; i++) {
      const tx = 1375 + rng() * 145, ty = 540 + rng() * 170;
      g.beginPath(); g.moveTo(1438, 783); g.quadraticCurveTo(1420, 660, tx, ty); g.strokeStyle = '#697c49'; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(tx, ty); g.rotate((tx - 1438) * .009);
      ellipse(0, 0, 18 + rng() * 10, 47 + rng() * 13, mix('#4a6746', '#8a9a64', rng()));
      line(0, 37, 0, -37, '#9baa6b4d', 1); g.restore();
    }
    if (light < .5) { g.save(); g.globalCompositeOperation = 'source-atop'; rect(0, 0, W, H, '#14273142'); g.restore(); glow(158, 600, 195, '#ffc77314'); }
  }
  function regenerate(animate = true) {
    real = state.style === 'realistic'; light = daylight(state.hour);
    pane = real ? photographicPane : illustrationPane;
    const status = document.querySelector('#photo-status');
    const photo = real && window.WindowPhotoScenery.peek(state.weather);
    if (real && !photo) {
      status.hidden = false; status.textContent = '사진 같은 창가를 불러오는 중이에요…';
      const weather = state.weather;
      if (!photoRequests.has(weather)) {
        photoRequests.add(weather);
        window.WindowPhotoScenery.load(weather).then(() => {
          photoRequests.delete(weather);
          if (state.style === 'realistic' && state.weather === weather) regenerate();
        }).catch(() => {
          photoRequests.delete(weather);
          if (state.style === 'realistic' && state.weather === weather) {
            status.hidden = false;
            status.textContent = '풍경을 불러오지 못했어요. 캐주얼을 선택한 뒤 다시 시도해주세요.';
          }
        });
      }
      if (hasScene) return;
      // On a cold load, keep a neutral placeholder rather than claiming an illustration is a photo.
      exterior.getContext('2d').fillStyle = '#243731'; exterior.getContext('2d').fillRect(0, 0, W, H);
      dirty = true; schedule(); return;
    }
    status.hidden = true;
    oldExterior.getContext('2d').drawImage(exterior, 0, 0); oldInterior.getContext('2d').clearRect(0, 0, W, H); oldInterior.getContext('2d').drawImage(interior, 0, 0);
    if (real) {
      g = exterior.getContext('2d');
      // Images use the same straight-on window composition, not the old vector scenery.
      const s = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
      g.clearRect(0, 0, W, H);
      g.drawImage(photo, (W - photo.naturalWidth * s) / 2, (H - photo.naturalHeight * s) / 2, photo.naturalWidth * s, photo.naturalHeight * s);
      interior.getContext('2d').clearRect(0, 0, W, H);
      // Keep the room warm while the outside cools toward evening; the control changes lighting.
      g.save(); g.beginPath(); g.rect(pane.x, pane.y, pane.w, pane.h); g.clip();
      rect(pane.x, pane.y, pane.w, pane.h, `rgba(7,20,38,${(1-light)*.78})`);
      const dusk = light > 0 && (state.hour < 8 || state.hour > 16) ? 1-light : 0;
      rect(pane.x, pane.y, pane.w, pane.h, `rgba(244,139,79,${dusk*.13})`); g.restore();
      rect(0, 0, W, H, `rgba(8,15,24,${(1-light)*.16})`);
    } else { buildExterior(); buildInterior(); }
    transitionStart = animate && hasScene && !paused && !reducedMotion.matches ? performance.now() : -2000; hasScene = true;
    dirty = true; schedule();
  }
  function renderWeather() {
    const t = elapsed; g = ctx;
    g.save(); clipWindow();
    const wind = state.weather === 'storm' ? 100 : state.weather === 'snow' ? 35 : 18;
    // Water glints continually travel across the visible lake in every weather.
    g.save();
    g.beginPath(); g.moveTo(642, 512); g.lineTo(1060, 520); g.lineTo(988, 768); g.lineTo(622, 735); g.lineTo(552, 645); g.closePath(); g.clip();
    if (real) for (let i = 0; i < 28; i++) {
      const y = 548 + i * 7.8;
      const drift = Math.sin(t * (state.weather === 'storm' ? 2 : .95) + i * .7) * (state.weather === 'storm' ? 4.2 : 1.5);
      // Shift narrow strips of the actual reflected landscape, rather than drawing graphic waves.
      for (const [x, width] of [[485, 154], [688, 246], [997, 287]]) g.drawImage(exterior, x, y, width, 8, x + drift, y, width, 8);
    }
    for (let i = 0; i < (real ? 18 : 46); i++) {
      const y = 520 + hash(i + 380) * 249, length = 20 + hash(i + 389) * 68;
      const x = 530 + (hash(i + 391) * 550 + t * (8 + hash(i + 394) * 13)) % 550;
      const glint = ((.14+.13*Math.sin(t*1.1+i))*light+.03) * (real ? .3 : 1);
      line(x, y + Math.sin(t * 1.2 + i) * 1.5, x + length, y + Math.sin(t * 1.2 + i) * 1.5, `rgba(235,240,221,${glint})`, real ? .8 : 1.2);
    }
    g.restore();
    if (state.weather === 'rain' || state.weather === 'storm') {
      const count = state.weather === 'storm' ? 410 : 230;
      for (let i = 0; i < count; i++) {
        const speed = 330 + hash(i + 6) * 470, z = .25 + hash(i + 13) * .75;
        const yy = (hash(i) * 780 + t * speed) % 780 + 30;
        const xx = pane.x + (hash(i + 5) * pane.w - t * wind * z % pane.w + pane.w) % pane.w;
        line(xx, yy, xx - (5 + wind * .14) * z, yy + 30 * z, `rgba(226,243,248,${.16 + z * .39})`, .5 + z * 1.05);
      }
      // Sliding beads refract the photo beneath them and leave bright wet trails.
      for (let i = 0; i < 72; i++) {
        const z = hash(i + 99), speed = 18 + z * 67;
        const xx = pane.x + 12 + hash(i + 200) * (pane.w - 24) + Math.sin(t * .35 + i) * 2;
        const yy = pane.y + (hash(i + 230) * pane.h + t * speed) % pane.h;
        const r = 1.5 + z * 4;
        if (z > .35) line(xx, yy - 35 - z * 60, xx, yy, '#d6e9ef35', r * .65);
        if (real) {
          g.save(); g.beginPath(); g.ellipse(xx, yy, r, r * 1.6, 0, 0, Math.PI * 2); g.clip();
          g.drawImage(exterior, Math.max(0, xx-r*3), Math.max(0, yy-r*4), r*6, r*8, xx-r, yy-r*1.6, r*2, r*3.2); g.restore();
        } else ellipse(xx, yy, r, r * 1.6, '#d9edf336');
        g.beginPath(); g.ellipse(xx, yy, r, r * 1.6, 0, 0, Math.PI * 2); g.strokeStyle = '#e4f3fa80'; g.lineWidth = .8; g.stroke();
        ellipse(xx - r * .32, yy - r * .56, .9, 1.5, '#ffffffb0');
      }
      for (let i = 0; i < 35; i++) {
        const phase = (t * .8 + hash(i + 300)) % 1;
        g.beginPath(); g.ellipse(650 + hash(i + 303) * 320, 555 + hash(i + 311) * 170, phase * 26 + 1, phase * 5 + .5, 0, 0, Math.PI * 2); g.strokeStyle = `rgba(236,244,233,${(1-phase)*.35})`; g.lineWidth = 1.1; g.stroke();
      }
      // One visible, slowly fading distant strike per 14 seconds, never a rapid strobe.
      if (state.weather === 'storm' && !reducedMotion.matches) {
        const phase = (t + 4) % 14, brightness = phase < 1.6 ? Math.sin(phase / 1.6 * Math.PI) : 0;
        if (brightness > .01) {
          rect(pane.x, pane.y, pane.w, pane.h, `rgba(218,233,255,${brightness*.22})`);
          g.save(); g.globalAlpha = brightness; g.shadowColor = '#d6e8ff'; g.shadowBlur = 16;
          const strikeX = 810 + hash(Math.floor((t+4)/14)+17) * 210;
          const bolt = [[strikeX, 110], [strikeX-32, 178], [strikeX+6, 171], [strikeX-43, 250], [strikeX-25, 244], [strikeX-75, 340]];
          for (let j = 1; j < bolt.length; j++) line(...bolt[j-1], ...bolt[j], '#edf5ffdb', 2.5);
          line(strikeX-43, 250, strikeX+25, 285, '#d8eaffc0', 1.3); line(strikeX+25, 285, strikeX+11, 318, '#d8eaffb0', 1); g.restore();
        }
      }
    }
    if (state.weather === 'snow') {
      for (let i = 0; i < 230; i++) {
        const z = .17 + hash(i + 12) * .83, speed = 20 + 65 * z;
        const yy = pane.y + (hash(i) * pane.h + t * speed) % pane.h;
        const xx = pane.x + (hash(i + 8) * pane.w + Math.sin(t * .8 + i) * 34 + t * wind * z + pane.w) % pane.w;
        const r = .8 + z * 4.2;
        if (z > .94 && real) { g.save(); g.filter = 'blur(1.5px)'; ellipse(xx, yy, r, r, '#ffffffb0'); g.restore(); }
        else ellipse(xx, yy, r, r, `rgba(250,253,255,${.4+z*.55})`);
        if (!real && z > .85) {
          g.save(); g.translate(xx, yy); g.rotate(t * .4 + i);
          for (let k = 0; k < 3; k++) { g.rotate(Math.PI/3); line(-r*1.6, 0, r*1.6, 0, '#f7fcffc0', 1); } g.restore();
        }
      }
    }
    if (state.weather === 'fog') {
      g.save(); g.filter = 'blur(18px)';
      for (let i = 0; i < 8; i++) ellipse(pane.x - 370 + ((i * 270 + t * (19 + i * 2)) % 1850), 360 + Math.sin(i * 5 + t * .22) * 105, 310, 45 + hash(i)*35, '#eff4f131');
      g.restore();
    }
    // Cloud banks drift across the high window, distinct from the painted/photo sky.
    if (state.weather === 'sunny' || state.weather === 'storm') {
      g.save(); if (real) g.filter = 'blur(19px)';
      for (let i = 0; i < 5; i++) {
        const x = pane.x - 240 + ((i * 340 + t * (state.weather === 'storm' ? 36 : 13)) % 1810);
        const y = 133 + hash(i + 456) * 125;
        ellipse(x, y, 125 + hash(i)*100, 27, state.weather === 'storm' ? '#1a2d4455' : '#fffdf331');
        ellipse(x+65, y-15, 88, 37, state.weather === 'storm' ? '#24334a30' : '#fffdf32b');
      } g.restore();
    }
    if (state.weather === 'sunny' && light > .3) {
      const sunX = 475 + (state.hour - 6) * 47;
      const sway = Math.sin(t * .27) * 45;
      path([[sunX - 90, 75], [sunX + 60, 75], [1340+sway, 775], [840+sway, 775]], `rgba(255,230,154,${.06+Math.sin(t*.4)*.025})`);
      for (let i = 0; i < 28; i++) { const x = pane.x + hash(i + 470) * pane.w, y = pane.y + (hash(i + 600) * pane.h - t * 13 + pane.h * 100) % pane.h; ellipse(x + Math.sin(t * .65 + i) * 16, y, 1.3+hash(i)*1.3, 1.3+hash(i)*1.3, '#ffe8a0a0'); }
    }
    if (state.weather === 'sunny' && light < .3) for (let i = 0; i < 20; i++) glow(330 + hash(i) * 900 + Math.sin(t * .7 + i) * 27, 635 + hash(i + 7) * 130 + Math.cos(t*.5+i)*15, 8, `rgba(226,239,132,${.23+.2*Math.sin(t*1.4+i)})`);
    // A little flock traverses the view periodically, wings visibly beating.
    if (state.weather === 'sunny' || state.weather === 'fog') {
      const travel = t % 23;
      if (travel < 12) for (let i = 0; i < 4; i++) {
        const x = 180 + travel * 114 - i * 27, y = 250 + Math.sin(travel*.6)*19 + i*11;
        const wing = Math.sin(t*7+i*.6)*6;
        g.beginPath(); g.moveTo(x-10,y-wing); g.quadraticCurveTo(x-5,y-2,x,y+2); g.quadraticCurveTo(x+5,y-2,x+10,y-wing); g.strokeStyle = '#263a42ab'; g.lineWidth = 1.8; g.stroke();
      }
    }
    g.restore();
  }
  function clipWindow() {
    g.beginPath();
    // Rain, snow and haze remain behind the walnut mullions, even on the photo plate.
    const columns = real ? [[244, 649], [675, 951], [978, 1353]] : [[286, 636], [650, 990], [1006, 1334]];
    const rows = real ? [[35, 347], [375, 771]] : [[76, 297], [314, 775]];
    for (const [left, right] of columns) for (const [top, bottom] of rows) g.rect(left, top, right-left, bottom-top);
    g.clip();
  }
  function render(now) {
    frameId = 0;
    if (!last) last = now;
    if (!paused && !document.hidden) elapsed += Math.min(.05, (now - last) / 1000);
    last = now;
    const blend = Math.min(1, Math.max(0, (now - transitionStart) / 900));
    if (dirty || !paused || blend < 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#252d26'; ctx.fillRect(0, 0, scene.width, scene.height);
      ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      ctx.globalAlpha = 1; ctx.drawImage(exterior, 0, 0);
      if (blend < 1) { ctx.globalAlpha = 1 - blend; ctx.drawImage(oldExterior, 0, 0); ctx.globalAlpha = 1; }
      renderWeather(); ctx.drawImage(interior, 0, 0);
      if (blend < 1) { ctx.globalAlpha = 1 - blend; ctx.drawImage(oldInterior, 0, 0); ctx.globalAlpha = 1; }
      // Three thin curls of steam rising from the warm cup.
      g = ctx;
      for (let i = 0; i < 4; i++) {
        const phase = (elapsed * .25 + i / 4) % 1, x = (real ? 516 : 570) + i * 6, y = (real ? 802 : 743) - phase * 78;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + Math.sin(elapsed * .8 + i) * 15, y - 14, x - 12, y - 24, x + 3, y - 40);
        g.strokeStyle = `rgba(246,241,226,${Math.sin(phase*Math.PI)*.34})`; g.lineWidth = real ? 3 : 3.5; g.stroke();
      }
      if (real) {
        const vignette = ctx.createRadialGradient(800, 470, 260, 800, 470, 1100);
        vignette.addColorStop(0, 'transparent'); vignette.addColorStop(1, '#09151028'); rect(0, 0, W, H, vignette);
      }
      dirty = false;
    }
    if (!document.hidden && (!paused || blend < 1)) schedule();
  }
  function schedule() { if (!frameId && !document.hidden) frameId = requestAnimationFrame(render); }
  function resize() {
    const box = document.querySelector('#diorama').getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    scene.width = Math.round(box.width * dpr); scene.height = Math.round(box.height * dpr);
    scale = Math.max(scene.width / W, scene.height / H); offsetX = (scene.width - W * scale) / 2; offsetY = (scene.height - H * scale) / 2;
    dirty = true; schedule();
  }
  function timeString() { const h = Math.floor(state.hour); return `${String(h).padStart(2, '0')}:${String(Math.round((state.hour-h)*60)).padStart(2, '0')}`; }
  function syncUI() {
    const weather = weathers[state.weather];
    document.body.classList.toggle('photographic', state.style === 'realistic');
    document.querySelectorAll('[data-weather]').forEach(b => b.setAttribute('aria-pressed', b.dataset.weather === state.weather));
    document.querySelectorAll('[data-style]').forEach(b => b.setAttribute('aria-pressed', b.dataset.style === state.style));
    const period = state.hour < 5 ? '한밤' : state.hour < 11 ? '아침' : state.hour < 17 ? '오후' : state.hour < 20 ? '저녁' : '밤';
    const shortPeriod = period === '한밤' ? '밤' : period;
    const title = state.weather === 'rain' ? `비가 머무는 ${shortPeriod}` : state.weather === 'fog' ? `안개 너머의 느린 ${shortPeriod}` : state.weather === 'sunny' && daylight(state.hour) < .3 ? '달빛이 쉬어가는 창가' : weather.title;
    document.querySelector('#mood-title').textContent = title;
    document.querySelector('#mood-copy').textContent = weather.copy;
    document.querySelector('#weather-label').textContent = weather.en;
    document.querySelector('#scene-number').textContent = `SCENE 0${weather.index} / 05`;
    document.querySelector('#time-label').textContent = `${timeString()} · ${period}`;
    document.querySelector('#hour-output').textContent = timeString();
    document.querySelector('#hour').value = state.hour;
    document.querySelector('#hour').setAttribute('aria-valuetext', `${timeString()}, ${period}`);
    document.querySelector('#volume').value = state.volume;
    document.querySelector('#scene-note').textContent = state.style === 'realistic' ? 'AI 생성 풍경 · 실시간 날씨 효과' : '상상 속 날씨 · 소리는 켤 때만 재생돼요';
    scene.setAttribute('aria-label', `${state.style === 'realistic' ? '사실적' : '캐주얼'} 스타일의 ${period} 창가. ${weather.name} 날씨의 호숫가, 산과 오두막이 보이고 방에는 따뜻한 차와 잠든 고양이가 있어요.`);
    try { localStorage.setItem('lab.window011.v1', JSON.stringify(state)); } catch (_) {}
  }
  function setPause(value) {
    paused = value; document.body.classList.toggle('paused', paused);
    if (paused) transitionStart = -2000;
    const b = document.querySelector('#pause'); b.setAttribute('aria-pressed', paused); b.setAttribute('aria-label', paused ? '움직임 재생하기' : '움직임 멈추기'); b.title = b.getAttribute('aria-label');
    b.innerHTML = paused ? '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';
    document.querySelector('#motion-status').textContent = paused ? '움직임 멈춤' : '움직임 재생 중'; dirty = true; last = 0; schedule();
  }
  function setZen(value) {
    document.body.classList.toggle('zen', value);
    document.querySelectorAll('.chrome').forEach(el => { el.inert = value; });
    const sync = document.querySelector('#lab-drive-sync'); if (sync) sync.inert = value;
    const b = document.querySelector('#hide-ui'); b.setAttribute('aria-pressed', value); b.querySelector('span').textContent = value ? '설정 보기' : '풍경만 보기';
    b.focus({ preventScroll: true }); resize();
  }
  function announce(message) { document.querySelector('#status').textContent = message; }
  function updateAudio() {
    if (!audio) return;
    const level = soundOn ? state.volume / 100 * .24 : 0;
    const gain = { sunny: .13, rain: .55, snow: .08, fog: .13, storm: .75 }[state.weather];
    audio.master.gain.setTargetAtTime(level * gain, audio.context.currentTime, .65);
    audio.filter.frequency.setTargetAtTime({ sunny: 480, rain: 1850, snow: 350, fog: 430, storm: 1450 }[state.weather], audio.context.currentTime, .7);
    audio.low.gain.setTargetAtTime(state.weather === 'storm' ? .12 : 0, audio.context.currentTime, 1);
  }
  async function toggleSound() {
    const b = document.querySelector('#sound'); b.disabled = true;
    try {
      if (!audio) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('unsupported');
        const context = new AudioCtx(), buffer = context.createBuffer(1, context.sampleRate * 8, context.sampleRate);
        const data = buffer.getChannelData(0); let previous = 0;
        for (let i = 0; i < data.length; i++) { const white = Math.random() * 2 - 1; previous = (previous + .02 * white) / 1.02; data[i] = (previous * 3.5 + white * .32) * .7; }
        const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true;
        const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .4;
        const master = context.createGain(); master.gain.value = 0;
        const low = context.createGain(); low.gain.value = 0;
        const lowFilter = context.createBiquadFilter(); lowFilter.type = 'lowpass'; lowFilter.frequency.value = 130;
        noise.connect(filter).connect(master).connect(context.destination);
        noise.connect(lowFilter).connect(low).connect(master); noise.start(); audio = { context, filter, master, low };
      }
      await audio.context.resume(); soundOn = !soundOn; updateAudio();
      b.setAttribute('aria-pressed', soundOn); b.querySelector('span').textContent = soundOn ? '소리 끄기' : '소리 켜기';
      b.querySelector('svg').innerHTML = soundOn ? '<path d="m11 5-6 4H2v6h3l6 4V5m5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>' : '<path d="m11 5-6 4H2v6h3l6 4V5m5 4 5 6m0-6-5 6"/>';
    } catch (_) { announce('이 브라우저에서는 환경음을 켤 수 없어요. 풍경은 계속 볼 수 있어요.'); }
    finally { b.disabled = false; }
  }
  document.querySelectorAll('[data-weather]').forEach(b => b.addEventListener('click', () => {
    if (state.weather === b.dataset.weather) return;
    state.weather = b.dataset.weather; syncUI(); regenerate(); updateAudio(); announce(`${weathers[state.weather].name} 풍경으로 바꿨어요.`);
  }));
  document.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => {
    if (state.style === b.dataset.style) return;
    state.style = b.dataset.style; syncUI(); regenerate(); announce(`${state.style === 'casual' ? '캐주얼' : '사실적'} 스타일로 바꿨어요.`);
  }));
  let rebuildFrame = 0;
  document.querySelector('#hour').addEventListener('input', e => {
    state.hour = Number(e.target.value); syncUI();
    if (!rebuildFrame) rebuildFrame = requestAnimationFrame(() => { rebuildFrame = 0; regenerate(false); });
  });
  document.querySelector('#volume').addEventListener('input', e => { state.volume = Number(e.target.value); syncUI(); updateAudio(); });
  document.querySelector('#sound').addEventListener('click', toggleSound);
  document.querySelector('#pause').addEventListener('click', () => setPause(!paused));
  document.querySelector('#hide-ui').addEventListener('click', () => setZen(!document.body.classList.contains('zen')));
  document.querySelector('#fullscreen').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else throw new Error('unsupported'); }
    catch (_) { announce('이 브라우저에서는 전체 화면을 켤 수 없어요. 풍경만 보기를 이용해주세요.'); }
  });
  document.addEventListener('fullscreenchange', () => {
    const b = document.querySelector('#fullscreen'); b.setAttribute('aria-label', document.fullscreenElement ? '전체 화면 끝내기' : '전체 화면'); b.title = b.getAttribute('aria-label'); resize();
  });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.altKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'h') { e.preventDefault(); setZen(!document.body.classList.contains('zen')); }
    if (e.key === 'Escape' && document.body.classList.contains('zen')) setZen(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (frameId) cancelAnimationFrame(frameId); frameId = 0; if (audio) audio.context.suspend().catch(() => {}); }
    else { last = 0; dirty = true; schedule(); if (audio && soundOn) audio.context.resume().catch(() => {}); }
  });
  reducedMotion.addEventListener('change', e => setPause(e.matches));
  new ResizeObserver(resize).observe(document.querySelector('#diorama'));
  syncUI(); regenerate(false); resize(); setPause(paused);
})();
