// Space Goose — a tiny side-scrolling runner/shooter for the <canvas id="game"> in index.html.
// SPACE / CLICK = jump · hold = fly · X / J / K / right-click = shoot · P = pause · M = mute
(() => {
  'use strict';

  // ---------- canvas (crisp on retina, still 800x400 logical px) ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const DPR = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.touchAction = 'none';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const FONT = '"Press Start 2P", monospace';
  const COL = {
    bg: '#0E0A1F', text: '#E9E1FF', muted: '#B9AEDB',
    yellow: '#FFD23F', cyan: '#3BE8FF', pink: '#FF4FA3', green: '#7CFF6B',
    hillFar: '#1C1540', hillNear: '#271E52',
    ground: '#30265F', groundEdge: '#4A3D8F', crater: '#231B4A', pebble: '#3E3378', empty: '#3E3378',
  };

  // ---------- tuning ----------
  const GROUND_Y = 340;
  const CEIL_Y = 78;            // highest the goose's feet can go
  const GOOSE_X = 110;
  const PX = 3;                 // sprite pixel size
  const GRAVITY = 2600;
  const JUMP_V = 680;
  const LIFT = 3900;            // wing power while flying (beats gravity)
  const MAX_CLIMB = 400;
  const MAX_FALL = 820;          // so dropping out of flight isn't a plummet
  const FLY_TIME = 2.4;         // seconds of flight on a full wing bar
  const WING_REFILL = 1.5;      // per second while on the ground
  const JUMP_BUFFER = 0.12;     // press slightly before landing still counts
  const FIRE_COOLDOWN = 0.17;
  const BULLET_SPEED = 900;
  const MAX_HP = 3;
  const INVULN = 1.4;
  const START_SPEED = 320;
  const MAX_SPEED = 700;
  const ACCEL = 5;
  const EGG_POINTS = 25;
  const HI_KEY = 'spaceGoose.hi';
  const MUTE_KEY = 'spaceGoose.muted';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const pad = (n) => String(Math.floor(n)).padStart(5, '0');

  // ---------- pixel sprites ----------
  const PALETTE = {
    W: '#F7F4FF', S: '#C9C0EA', O: '#FF9F1C', K: '#1A1433', Y: '#FFD23F', w: '#FFFFFF', o: '#E07A00',
    G: '#7CFF6B', g: '#3FBF4A', P: '#FF4FA3',
  };

  // `solid` paints every pixel one colour (hit flashes, empty hearts)
  function makeSprite(rows, solid = null) {
    const c = document.createElement('canvas');
    c.width = rows[0].length;
    c.height = rows.length;
    const g = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (PALETTE[ch]) { g.fillStyle = solid || PALETTE[ch]; g.fillRect(x, y, 1, 1); }
    }));
    return c;
  }

  const HEAD = [
    '..........WWW...',
    '.........WWWWW..',
    '.........WWKWWOO',
    '.........WWWWWO.',
    '..........WWWW..',
    '..........YYYY..', // helmet collar
    '..........WWW...',
  ];
  const BODY_WING_DOWN = [
    '..........WWW...',
    '.W.......WWWW...',
    'WWW.....WWWWWW..',
    'WWWWWWWWWWWWWW..',
    '.WWSSSSSWWWWWW..',
    '..WWSSSSWWWWW...',
    '...WWWWWWWWW....',
  ];
  const BODY_WING_UP = [
    '...SS.....WWW...',
    '.W.SSS...WWWW...',
    'WWW.SSS.WWWWWW..',
    'WWWWWSSWWWWWWW..',
    '.WWWWWWWWWWWWW..',
    '..WWWWWWWWWWW...',
    '...WWWWWWWWW....',
  ];
  const LEGS_A = ['....O.....O.....', '....OO....OO....'];
  const LEGS_B = ['......OO........', '......OOO.......'];
  const LEGS_AIR = ['.....OO..OO.....', '................'];

  // one-eyed alien blob, looking left at the goose
  const BLOB = [
    '....GGGG....',
    '..GGGGGGGG..',
    '.GGwwwwGGGG.',
    'GGwwKKwwGGGG',
    'GGwwKKwwGGGG',
    '.GGwwwwGGGG.',
    '..GGGGGGGG..',
  ];
  const BLOB_LEGS_A = ['.g..g..g..g.', 'g..g..g..g..'];
  const BLOB_LEGS_B = ['.g..g..g..g.', '..g..g..g..g'];

  const HEART = [
    '.PP.PP.',
    'PwPPPPP',
    'PPPPPPP',
    '.PPPPP.',
    '..PPP..',
    '...P...',
  ];

  const SPR = {
    runA: makeSprite([...HEAD, ...BODY_WING_DOWN, ...LEGS_A]),
    runB: makeSprite([...HEAD, ...BODY_WING_DOWN, ...LEGS_B]),
    airUp: makeSprite([...HEAD, ...BODY_WING_UP, ...LEGS_AIR]),
    airDown: makeSprite([...HEAD, ...BODY_WING_DOWN, ...LEGS_AIR]),
    blobA: makeSprite([...BLOB, ...BLOB_LEGS_A]),
    blobB: makeSprite([...BLOB, ...BLOB_LEGS_B]),
    blobHit: makeSprite([...BLOB, ...BLOB_LEGS_A], '#FFFFFF'),
    heart: makeSprite(HEART),
    heartEmpty: makeSprite(HEART, COL.empty),
    egg: makeSprite([
      '..YYY..',
      '.YwYYY.',
      '.wYYYY.',
      'YYYYYYY',
      'YYYYYYo',
      'YYYYYoo',
      '.YYYoo.',
      '..ooo..',
    ]),
  };
  const GOOSE_SIZE = 16 * PX; // 48

  // ---------- sound (tiny WebAudio synth, starts on first input) ----------
  let actx = null;
  let noiseBuf = null;
  let muted = store.get(MUTE_KEY) === '1';

  function unlockAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.4, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
  }

  function tone(f0, f1, dur, { type = 'square', vol = 0.06, delay = 0 } = {}) {
    if (muted || !actx) return;
    const t0 = actx.currentTime + delay;
    const osc = actx.createOscillator();
    const amp = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    amp.gain.setValueAtTime(vol, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol) {
    if (muted || !actx) return;
    const src = actx.createBufferSource();
    const amp = actx.createGain();
    src.buffer = noiseBuf;
    amp.gain.setValueAtTime(vol, actx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    src.connect(amp);
    amp.connect(actx.destination);
    src.start();
    src.stop(actx.currentTime + dur);
  }

  const sfx = {
    jump: () => tone(300, 620, 0.12),
    pew: () => tone(520, 360, 0.08, { type: 'sawtooth', vol: 0.03 }), // a little honk blaster
    tick: () => tone(900, 700, 0.04, { vol: 0.03 }),
    boom: () => { noise(0.25, 0.1); tone(180, 50, 0.25, { vol: 0.06 }); },
    zap: () => tone(700, 300, 0.12, { type: 'triangle', vol: 0.04 }),
    egg: () => { tone(988, 988, 0.07, { type: 'triangle', vol: 0.1 }); tone(1480, 1480, 0.12, { type: 'triangle', vol: 0.1, delay: 0.07 }); },
    heart: () => { tone(660, 660, 0.07, { type: 'triangle', vol: 0.1 }); tone(880, 880, 0.07, { type: 'triangle', vol: 0.1, delay: 0.06 }); tone(1320, 1320, 0.12, { type: 'triangle', vol: 0.1, delay: 0.12 }); },
    hurt: () => { tone(320, 120, 0.25, { type: 'sawtooth', vol: 0.08 }); noise(0.12, 0.06); },
    dead: () => { tone(220, 40, 0.5, { vol: 0.08 }); noise(0.3, 0.12); },
    level: () => { tone(660, 660, 0.08, { vol: 0.05 }); tone(990, 990, 0.14, { vol: 0.05, delay: 0.09 }); },
  };

  // ---------- state ----------
  let state = 'title'; // title | play | dying | over
  let paused = false;
  let t = 0;           // clock for animations
  let scroll = 0;      // distance travelled, drives parallax
  let worldSpeed = 160;
  let speed = START_SPEED;
  let score = 0;
  let hi = Number(store.get(HI_KEY)) || 0;
  let newHi = false;
  let eggCount = 0;
  let kills = 0;
  let milestone = 0;
  let milestoneFlash = 0;
  let dieTimer = 0;
  let overTimer = 0;
  let shake = 0;
  let held = false;        // jump/fly button down
  let jumpBuffer = 0;
  let shootHeld = false;
  let shootQueued = false; // so a quick tap still fires
  let obstacles = [];
  let pickups = [];
  let particles = [];
  let popups = [];
  let bullets = [];
  let enemies = [];
  let enemyShots = [];
  let distToNext = 0;
  let nextType = 'crystal';
  let enemyTimer = 0;

  const goose = {
    y: GROUND_Y, vy: 0, onGround: true, flying: false, wing: 1, hp: MAX_HP,
    invuln: 0, fireCD: 0, muzzle: 0, rot: 0, sy: 1, anim: 0,
  };

  const starLayers = [
    { f: 0.03, size: 1, alpha: 0.45, n: 70 },
    { f: 0.08, size: 2, alpha: 0.6, n: 34 },
    { f: 0.16, size: 2, alpha: 0.95, n: 12, colors: [COL.cyan, COL.pink, COL.yellow] },
  ].map((L) => ({
    ...L,
    stars: Array.from({ length: L.n }, () => ({
      x: rand(0, W), y: rand(0, GROUND_Y - 40), ph: rand(0, 6.28), sp: rand(1, 3),
      c: L.colors ? pick(L.colors) : COL.text,
    })),
  }));

  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, COL.bg);
  sky.addColorStop(1, '#22174A');

  function start() {
    state = 'play';
    paused = false;
    speed = START_SPEED;
    score = 0;
    eggCount = 0;
    kills = 0;
    newHi = false;
    milestone = 0;
    milestoneFlash = 0;
    held = false;
    jumpBuffer = 0;
    shootHeld = false;
    shootQueued = false;
    obstacles = [];
    pickups = [];
    particles = [];
    popups = [];
    bullets = [];
    enemies = [];
    enemyShots = [];
    distToNext = 500;
    nextType = 'crystal';
    enemyTimer = 2.5;
    Object.assign(goose, {
      y: GROUND_Y, vy: 0, onGround: true, flying: false, wing: 1, hp: MAX_HP,
      invuln: 0, fireCD: 0, muzzle: 0, rot: 0, sy: 1,
    });
  }

  // ---------- input ----------
  const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
  const SHOOT_KEYS = new Set(['KeyX', 'KeyJ', 'KeyK']);

  // Any button starts / restarts / unpauses. Returns true if the press was used up that way.
  function menuPress() {
    unlockAudio();
    if (state === 'title') { start(); return true; }
    if (state === 'over') { if (overTimer > 0.5) start(); return true; }
    if (state !== 'play') return true;
    if (paused) { paused = false; return true; }
    return false;
  }
  function pressFly() {
    if (menuPress()) return;
    held = true;
    jumpBuffer = JUMP_BUFFER;
  }
  function pressShoot() {
    if (menuPress()) return;
    shootHeld = true;
    shootQueued = true;
  }

  addEventListener('keydown', (e) => {
    if (JUMP_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) pressFly();
    } else if (SHOOT_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) pressShoot();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'play') paused = !paused;
    } else if (e.code === 'KeyM') {
      unlockAudio();
      muted = !muted;
      store.set(MUTE_KEY, muted ? '1' : '0');
    }
  });
  addEventListener('keyup', (e) => {
    if (JUMP_KEYS.has(e.code)) held = false;
    else if (SHOOT_KEYS.has(e.code)) shootHeld = false;
  });

  // Mouse: left = jump/fly, right = shoot. mousedown fires per button (pointerdown doesn't
  // for a second button held at the same time), so mouse uses mouse events.
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.button === 2) pressShoot();
    else if (e.button === 0) pressFly();
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 2) shootHeld = false;
    else if (e.button === 0) held = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Touch: left half = jump/fly, right half = shoot (two thumbs at once works).
  const touchRole = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const role = e.clientX - r.left > r.width / 2 ? 'shoot' : 'fly';
    touchRole.set(e.pointerId, role);
    if (role === 'shoot') pressShoot();
    else pressFly();
  });
  const touchEnd = (e) => {
    const role = touchRole.get(e.pointerId);
    touchRole.delete(e.pointerId);
    if (role === 'shoot') shootHeld = false;
    else if (role === 'fly') held = false;
  };
  addEventListener('pointerup', touchEnd);
  addEventListener('pointercancel', touchEnd);

  addEventListener('blur', () => {
    held = false;
    shootHeld = false;
    if (state === 'play') paused = true;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') paused = true; });

  // ---------- ground obstacles ----------
  const CRYSTAL_COLORS = [
    { base: '#FF4FA3', light: '#FFB3D9', dark: '#9E2466' },
    { base: '#3BE8FF', light: '#C2F9FF', dark: '#1B7E9C' },
  ];

  // shards are drawn in order, so small ones come first (behind)
  const SHARDS = {
    crystal: () => [{ dx: 20, w: 20, h: rand(16, 28) }, { dx: 0, w: 30, h: rand(40, 62) }],
    cluster: () => [{ dx: 0, w: 26, h: rand(30, 48) }, { dx: 44, w: 26, h: rand(28, 46) }, { dx: 20, w: 30, h: rand(44, 60) }],
    spire: () => [{ dx: 26, w: 22, h: rand(50, 70) }, { dx: 0, w: 32, h: rand(120, 150) }], // fly over it
  };

  function pickType() {
    const r = Math.random();
    if (score > 250 && r < 0.15) return 'spire';
    if (score > 80 && r < 0.5) return 'cluster';
    return 'crystal';
  }

  function gapFor(type) {
    let gap = 200 + speed * 0.7 + Math.random() * (260 + speed * 0.4);
    if (type === 'spire') gap += speed * 0.5; // time to land and refill wings first
    return gap;
  }

  function spawnObstacle(type) {
    const x = W + 30;
    const shards = SHARDS[type]();
    const w = Math.max(...shards.map((s) => s.dx + s.w));
    const top = GROUND_Y - Math.max(...shards.map((s) => s.h));
    obstacles.push({ x, w, shards, col: pick(CRYSTAL_COLORS) });
    if (Math.random() < 0.4) {
      const y = Math.random() < 0.3 ? GROUND_Y - 200 : top - 48;
      pickups.push({ kind: 'egg', x: x + w / 2, y, ph: rand(0, 6.28) });
    }
    return w;
  }

  // ---------- enemies ----------
  const ENEMY_COLORS = {
    blob: [COL.green, PALETTE.g, '#FFFFFF'],
    jelly: [COL.cyan, COL.pink, '#FFFFFF'],
    saucer: [COL.muted, COL.yellow, COL.pink, '#FFFFFF'],
  };

  function pickEnemy() {
    const r = Math.random();
    if (score > 350 && r < 0.18 && !enemies.some((e) => e.kind === 'saucer')) return 'saucer';
    if (score > 200 && r < 0.38) return 'wave';
    if (score > 100 && r < 0.6) return 'jelly';
    return 'blob';
  }

  function spawnEnemy(kind) {
    const x = W + 40;
    if (kind === 'blob' || kind === 'wave') {
      const y0 = kind === 'wave' ? rand(90, GROUND_Y - 70) : rand(60, GROUND_Y - 36);
      const vx = -(200 + speed * 0.45);
      const n = kind === 'wave' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        enemies.push({ kind: 'blob', x: x + i * 48, y: y0, y0, ph: i * 0.6, hp: 1, pts: 10, vx, flash: 0 });
      }
    } else if (kind === 'jelly') {
      const y0 = rand(120, GROUND_Y - 90);
      enemies.push({ kind, x, y: y0, y0, ph: rand(0, 6.28), hp: 2, pts: 20, vx: -(speed * 0.55 + 40), flash: 0 });
    } else {
      const y0 = rand(110, 220);
      enemies.push({ kind, x: W + 50, y: y0, y0, ph: 0, hp: 5, maxHp: 5, pts: 50, mode: 'enter', timer: 0, shotCD: 1, flash: 0 });
    }
  }

  function fireAt(x, y) {
    const dx = GOOSE_X + 24 - x;
    const dy = goose.y - 26 - y;
    const d = Math.hypot(dx, dy) || 1;
    enemyShots.push({ x, y, vx: (dx / d) * 260, vy: (dy / d) * 260 });
    sfx.zap();
  }

  // The saucer parks on the right, follows the goose up and down, shoots, then leaves.
  function updateSaucer(e, dt) {
    if (e.mode === 'enter') {
      e.x -= 260 * dt;
      if (e.x <= 640) { e.x = 640; e.mode = 'hover'; e.timer = 6; }
    } else if (e.mode === 'hover') {
      e.timer -= dt;
      const ty = Math.max(90, Math.min(GROUND_Y - 80, goose.y - 40));
      e.y0 += Math.sign(ty - e.y0) * Math.min(Math.abs(ty - e.y0), 80 * dt);
      e.shotCD -= dt;
      if (e.shotCD <= 0) { fireAt(e.x - 22, e.y + 4); e.shotCD = 1.3; }
      if (e.timer <= 0) e.mode = 'leave';
    } else {
      e.x += 300 * dt;
      e.y0 -= 200 * dt;
    }
    e.y = e.y0 + Math.sin(e.ph * 3) * 4;
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      e.flash -= dt;
      e.ph += dt;
      if (e.kind === 'blob') {
        e.x += e.vx * dt;
        e.y = e.y0 + Math.sin(e.ph * 4) * 16;
      } else if (e.kind === 'jelly') {
        e.x += e.vx * dt;
        e.y = e.y0 + Math.sin(e.ph * 1.8) * 45;
      } else {
        updateSaucer(e, dt);
      }
    }
    enemies = enemies.filter((e) => !e.dead && e.x > -60 && e.x < W + 120 && e.y > -60);
  }

  function enemyBox(e) {
    if (e.kind === 'blob') return { x: e.x - 15, y: e.y - 11, w: 30, h: 20 };
    if (e.kind === 'jelly') return { x: e.x - 15, y: e.y - 15, w: 30, h: 28 };
    return { x: e.x - 30, y: e.y - 14, w: 60, h: 24 };
  }

  function kill(e) {
    e.dead = true;
    kills++;
    score += e.pts;
    popup('+' + e.pts, e.x, e.y - 24, COL.green);
    const big = e.kind === 'saucer';
    burst(e.x, e.y, big ? 34 : 16, { colors: ENEMY_COLORS[e.kind], speed: big ? 300 : 200, life: 0.6, g: 200 });
    shake = Math.max(shake, big ? 10 : 4);
    sfx.boom();
    const y = Math.min(e.y, GROUND_Y - 18);
    if (big) pickups.push({ kind: goose.hp < MAX_HP ? 'heart' : 'egg', x: e.x, y, ph: 0 });
    else if (e.kind === 'jelly' && Math.random() < 0.35) pickups.push({ kind: 'egg', x: e.x, y, ph: 0 });
  }

  // ---------- collision ----------
  function gooseBoxes() {
    const y = goose.y;
    return [
      { x: GOOSE_X + 28, y: y - 46, w: 16, h: 22 }, // head + neck
      { x: GOOSE_X + 4, y: y - 22, w: 36, h: 18 },  // body
    ];
  }

  function obstacleBoxes(o) {
    return o.shards.map((s) => ({ x: o.x + s.dx + s.w * 0.2, y: GROUND_Y - s.h + 8, w: s.w * 0.6, h: s.h - 8 }));
  }

  // ---------- effects ----------
  function burst(x, y, n, { colors, speed: sp = 200, up = 0, life = 0.6, g = 600, size = 3 }) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * sp;
      const max = life * rand(0.5, 1);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: max, max, g, size, color: pick(colors) });
    }
  }
  const dust = () => burst(GOOSE_X + 20, GROUND_Y - 2, 7, { colors: [COL.groundEdge, '#6A5CB0'], speed: 90, up: 50, life: 0.35, g: 300 });
  const popup = (text, x, y, color) => popups.push({ text, x, y, color, life: 0.8, max: 0.8 });

  function hurt() {
    goose.hp--;
    if (goose.hp <= 0) return die();
    goose.invuln = INVULN;
    goose.vy = Math.min(goose.vy, -380); // knocked up and out of the way
    goose.onGround = false;
    shake = 8;
    sfx.hurt();
    burst(GOOSE_X + 24, goose.y - 26, 12, { colors: [PALETTE.W, PALETTE.S, COL.pink], speed: 200, up: 80, life: 0.6, g: 500 });
  }

  function die() {
    state = 'dying';
    dieTimer = 0;
    shake = 12;
    held = false;
    shootHeld = false;
    goose.hp = 0;
    goose.vy = -560;
    goose.onGround = false;
    sfx.dead();
    burst(GOOSE_X + 30, goose.y - 28, 26, { colors: [PALETTE.W, PALETTE.S, PALETTE.O], speed: 260, up: 160, life: 0.9, g: 500 });
    if (Math.floor(score) > hi) {
      hi = Math.floor(score);
      newHi = true;
      store.set(HI_KEY, hi);
    }
  }

  // ---------- update ----------
  function updateGoose(dt) {
    const g = goose;
    g.invuln -= dt;
    g.muzzle -= dt;
    g.fireCD -= dt;
    jumpBuffer -= dt;

    if (jumpBuffer > 0 && g.onGround) {
      g.vy = -JUMP_V;
      g.onGround = false;
      g.sy = 1.25;
      jumpBuffer = 0;
      sfx.jump();
      dust();
    }

    g.flying = held && !g.onGround && g.wing > 0;
    if (g.flying) {
      g.wing = Math.max(0, g.wing - dt / FLY_TIME);
      // a fast jump first slows to climb speed, then the wings hold a steady climb
      g.vy = g.vy < -MAX_CLIMB ? g.vy + GRAVITY * dt : Math.max(-MAX_CLIMB, g.vy + (GRAVITY - LIFT) * dt);
      if (Math.random() < 0.5) {
        particles.push({ x: GOOSE_X + rand(6, 30), y: g.y - rand(4, 14), vx: -40, vy: 80, life: 0.3, max: 0.3, g: 0, size: 2, color: pick([COL.cyan, '#FFFFFF']) });
      }
    } else {
      g.vy = Math.min(MAX_FALL, g.vy + GRAVITY * dt);
    }
    g.y += g.vy * dt;
    if (g.y < CEIL_Y) { g.y = CEIL_Y; g.vy = Math.max(0, g.vy); }
    if (g.y >= GROUND_Y) {
      if (!g.onGround) { g.sy = 0.75; dust(); }
      g.y = GROUND_Y;
      g.vy = 0;
      g.onGround = true;
    }
    if (g.onGround) g.wing = Math.min(1, g.wing + WING_REFILL * dt);

    const targetRot = g.onGround ? 0 : Math.max(-0.35, Math.min(0.4, g.vy / 1600));
    g.rot += (targetRot - g.rot) * Math.min(1, dt * 14);

    if ((shootHeld || shootQueued) && g.fireCD <= 0) {
      bullets.push({ x: GOOSE_X + 50, y: g.y - 40 });
      g.fireCD = FIRE_COOLDOWN;
      g.muzzle = 0.06;
      shootQueued = false;
      sfx.pew();
    }
  }

  function updatePlay(dt) {
    speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    score += (speed * dt) / 40;
    const m = Math.floor(score / 500);
    if (m > milestone) { milestone = m; milestoneFlash = 1; sfx.level(); }

    updateGoose(dt);

    // move the world
    const dx = speed * dt;
    for (const o of obstacles) o.x -= dx;
    for (const p of pickups) p.x -= dx;
    for (const p of particles) p.x -= dx;
    obstacles = obstacles.filter((o) => o.x + o.w > -40);

    distToNext -= dx;
    if (distToNext <= 0) {
      const w = spawnObstacle(nextType);
      nextType = pickType();
      distToNext = w + gapFor(nextType);
    }
    enemyTimer -= dt;
    if (enemyTimer <= 0) {
      spawnEnemy(pickEnemy());
      enemyTimer = Math.max(0.7, 2.2 - score / 800) + Math.random() * 1.2;
    }

    updateEnemies(dt);
    for (const b of bullets) b.x += BULLET_SPEED * dt;
    for (const s of enemyShots) { s.x += s.vx * dt; s.y += s.vy * dt; }

    // honk waves vs aliens
    for (const b of bullets) {
      const bb = { x: b.x - 6, y: b.y - 7, w: 14, h: 14 };
      const e = enemies.find((en) => !en.dead && overlap(bb, enemyBox(en)));
      if (!e) continue;
      b.dead = true;
      e.hp--;
      e.flash = 0.08;
      burst(b.x, b.y, 4, { colors: [COL.pink, '#FFFFFF'], speed: 120, life: 0.25, g: 0, size: 2 });
      if (e.hp <= 0) kill(e);
      else sfx.tick();
    }
    bullets = bullets.filter((b) => !b.dead && b.x < W + 20);

    const boxes = gooseBoxes();
    const touches = (box) => boxes.some((b) => overlap(b, box));

    for (const p of pickups) {
      if (!touches({ x: p.x - 9, y: p.y - 11, w: 18, h: 22 })) continue;
      p.taken = true;
      if (p.kind === 'heart') {
        goose.hp = Math.min(MAX_HP, goose.hp + 1);
        sfx.heart();
        popup('+1 HP', p.x, p.y - 20, COL.pink);
      } else {
        eggCount++;
        score += EGG_POINTS;
        goose.wing = Math.min(1, goose.wing + 0.3);
        sfx.egg();
        popup('+' + EGG_POINTS, p.x, p.y - 20, COL.yellow);
      }
      burst(p.x, p.y, 10, { colors: [p.kind === 'heart' ? COL.pink : COL.yellow, '#FFFFFF'], speed: 160, life: 0.5, g: 0, size: 2 });
    }
    pickups = pickups.filter((p) => !p.taken && p.x > -20);

    if (goose.invuln <= 0) {
      if (obstacles.some((o) => obstacleBoxes(o).some(touches))) return hurt();
      const e = enemies.find((en) => !en.dead && touches(enemyBox(en)));
      if (e) {
        if (e.kind !== 'saucer') kill(e); // ramming small aliens pops them, but still hurts
        return hurt();
      }
      const s = enemyShots.find((sh) => touches({ x: sh.x - 5, y: sh.y - 5, w: 10, h: 10 }));
      if (s) { s.dead = true; return hurt(); }
    }
    enemyShots = enemyShots.filter((s) => !s.dead && s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20);
  }

  function updateDying(dt) {
    dieTimer += dt;
    goose.vy += GRAVITY * 0.55 * dt;
    goose.y += goose.vy * dt;
    goose.rot += dt * 10;
    if (dieTimer > 1.2) { state = 'over'; overTimer = 0; }
  }

  function update(dt) {
    t += dt;
    if (paused) return;

    if (state === 'play') worldSpeed = speed;
    else worldSpeed += ((state === 'title' ? 160 : 20) - worldSpeed) * Math.min(1, dt * 3);
    scroll += worldSpeed * dt;
    goose.anim += (dt * worldSpeed) / 45;
    goose.sy += (1 - goose.sy) * Math.min(1, dt * 10);
    shake = Math.max(0, shake - dt * 40);
    milestoneFlash = Math.max(0, milestoneFlash - dt);

    if (state === 'play') updatePlay(dt);
    else if (state === 'dying') updateDying(dt);
    else if (state === 'over') overTimer += dt;

    for (const p of particles) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) { p.y -= 40 * dt; p.life -= dt; }
    popups = popups.filter((p) => p.life > 0);
  }

  // ---------- drawing ----------
  function text(str, x, y, size, color, align = 'center', shadow = null) {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(str, x + 3, y + 3);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawPlanet() {
    const span = W + 260;
    const px = W + 130 - ((scroll * 0.012 + 260) % span);
    const py = 92;
    const r = 40;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,210,63,0.7)';
    ctx.beginPath();
    ctx.ellipse(px, py, 68, 13, -0.25, Math.PI, Math.PI * 2); // back half of the ring
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#6B3A9A';
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
    ctx.fillStyle = '#7E4AAE';
    ctx.fillRect(px - r, py - 18, r * 2, 8);
    ctx.fillRect(px - r, py + 6, r * 2, 5);
    ctx.fillStyle = '#58307F';
    ctx.fillRect(px - r, py - 4, r * 2, 6);
    ctx.fillStyle = 'rgba(14,10,31,0.45)';
    ctx.beginPath();
    ctx.arc(px + 14, py + 10, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(px, py, 68, 13, -0.25, 0, Math.PI); // front half
    ctx.stroke();

    const mx = W + 30 - ((scroll * 0.02 + 560) % (W + 60));
    ctx.fillStyle = '#2C7F99';
    ctx.beginPath();
    ctx.arc(mx, 54, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7FEFFF';
    ctx.fillRect(mx - 5, 49, 3, 3);
  }

  function drawHills(off, base, amp, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= W; x += 8) {
      const wx = x + off;
      const y = base - amp * (0.6 * Math.sin(wx * 0.006 + seed) + 0.4 * Math.sin(wx * 0.017 + seed * 2));
      const q = Math.round(y / 4) * 4; // stepped, pixel-ish skyline
      ctx.lineTo(x, q);
      ctx.lineTo(x + 8, q);
    }
    ctx.lineTo(W + 8, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawBackground() {
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);
    for (const L of starLayers) {
      for (const s of L.stars) {
        const x = (((s.x - scroll * L.f) % W) + W) % W;
        ctx.globalAlpha = L.alpha * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
        ctx.fillStyle = s.c;
        ctx.fillRect(Math.round(x), Math.round(s.y), L.size, L.size);
      }
    }
    ctx.globalAlpha = 1;
    drawPlanet();
    drawHills(scroll * 0.25, GROUND_Y - 34, 22, COL.hillFar, 1);
    drawHills(scroll * 0.5, GROUND_Y - 10, 12, COL.hillNear, 2);
  }

  function drawGround() {
    ctx.fillStyle = COL.ground;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = COL.groundEdge;
    ctx.fillRect(0, GROUND_Y, W, 4);
    ctx.fillStyle = 'rgba(59,232,255,0.35)';
    ctx.fillRect(0, GROUND_Y, W, 1);

    const TILE = 140;
    const first = Math.floor(scroll / TILE);
    for (let i = first; i <= first + Math.ceil(W / TILE) + 1; i++) {
      const bx = i * TILE - scroll;
      const r1 = hash(i);
      const r2 = hash(i + 0.37);
      const r3 = hash(i + 0.71);
      const cx = bx + r1 * TILE;
      const cy = GROUND_Y + 18 + r2 * 28;
      const rw = 12 + r3 * 18;
      ctx.fillStyle = COL.crater;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rw * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COL.groundEdge;
      ctx.fillRect(cx - rw * 0.6, cy + rw * 0.28 - 1, rw * 1.2, 2);
      ctx.fillStyle = COL.pebble;
      ctx.fillRect(Math.round(bx + r2 * TILE), Math.round(GROUND_Y + 10 + r3 * 44), 3, 3);
      ctx.fillRect(Math.round(bx + r3 * TILE), Math.round(GROUND_Y + 12 + r1 * 40), 2, 2);
    }
  }

  function drawCrystal(o) {
    const { base, light, dark } = o.col;
    const b = GROUND_Y + 2;
    ctx.fillStyle = base;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.ellipse(o.x + o.w / 2, GROUND_Y + 3, o.w * 0.8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    for (const s of o.shards) {
      const x = Math.round(o.x + s.dx);
      const { w, h } = s;
      const top = b - h;
      const tipX = x + w / 2;
      const shoulder = top + Math.min(h * 0.3, 20);
      ctx.beginPath();
      ctx.moveTo(x, b);
      ctx.lineTo(x + w * 0.1, shoulder);
      ctx.lineTo(tipX, top);
      ctx.lineTo(x + w * 0.9, shoulder);
      ctx.lineTo(x + w, b);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.stroke();
      // lit facet
      ctx.beginPath();
      ctx.moveTo(x + w * 0.1 + 3, shoulder + 2);
      ctx.lineTo(tipX, top + 5);
      ctx.lineTo(tipX, b - 3);
      ctx.lineTo(x + w * 0.2, b - 3);
      ctx.closePath();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = light;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawBlob(e) {
    const spr = e.flash > 0 ? SPR.blobHit : Math.floor(e.ph * 8) % 2 ? SPR.blobB : SPR.blobA;
    ctx.drawImage(spr, Math.round(e.x - 18), Math.round(e.y - 13), 36, 27);
  }

  function drawJelly(e) {
    const flash = e.flash > 0;
    const pulse = Math.sin(e.ph * 4) * 2;
    ctx.lineWidth = 2;
    ctx.strokeStyle = flash ? '#FFFFFF' : 'rgba(59,232,255,0.7)';
    for (let i = 0; i < 4; i++) {
      const x0 = e.x - 10 + i * 7;
      ctx.beginPath();
      ctx.moveTo(x0, e.y);
      for (let k = 1; k <= 4; k++) ctx.lineTo(x0 + Math.sin(t * 6 + i + k) * 3, e.y + k * 6);
      ctx.stroke();
    }
    ctx.fillStyle = flash ? '#FFFFFF' : 'rgba(59,232,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y - 2, 17 + pulse, 14 - pulse * 0.5, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flash ? '#FFFFFF' : '#A6F5FF';
    ctx.fillRect(Math.round(e.x - 17 - pulse), Math.round(e.y - 3), Math.round(34 + pulse * 2), 3);
    ctx.fillStyle = COL.pink;
    ctx.fillRect(Math.round(e.x + 4), Math.round(e.y - 12), 3, 3);
    ctx.fillRect(Math.round(e.x - 8), Math.round(e.y - 9), 2, 2);
    ctx.fillStyle = PALETTE.K;
    ctx.fillRect(Math.round(e.x - 7), Math.round(e.y - 7), 3, 3);
    ctx.fillRect(Math.round(e.x + 1), Math.round(e.y - 7), 3, 3);
  }

  function drawSaucer(e) {
    const cx = e.x;
    const by = e.y + 10;
    const flash = e.flash > 0;
    // pilot
    ctx.fillStyle = COL.green;
    ctx.fillRect(cx - 5, by - 21, 10, 10);
    ctx.fillStyle = PALETTE.K;
    ctx.fillRect(cx - 3, by - 18, 2, 2);
    ctx.fillRect(cx + 1, by - 18, 2, 2);
    // dome
    ctx.beginPath();
    ctx.arc(cx, by - 12, 13, Math.PI, 0);
    ctx.fillStyle = 'rgba(233,225,255,0.25)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(233,225,255,0.85)';
    ctx.stroke();
    // saucer
    ctx.beginPath();
    ctx.ellipse(cx, by - 8, 32, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#FFFFFF' : '#8F84C9';
    ctx.fill();
    ctx.strokeStyle = '#4B4180';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, by - 11, 26, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#FFFFFF' : COL.muted;
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const on = (Math.floor(t * 8) + i) % 3 === 0;
      ctx.fillStyle = on ? COL.yellow : '#5E5390';
      ctx.fillRect(cx - 24 + i * 12, by - 7, 4, 4);
    }
    // charging shot = warning
    if (e.mode === 'hover' && e.shotCD < 0.35) {
      const r = (1 - e.shotCD / 0.35) * 6;
      ctx.fillStyle = COL.green;
      ctx.beginPath();
      ctx.arc(cx - 22, e.y + 4, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // health bar
    ctx.fillStyle = COL.empty;
    ctx.fillRect(cx - 20, by - 34, 40, 4);
    ctx.fillStyle = COL.green;
    ctx.fillRect(cx - 20, by - 34, (40 * e.hp) / e.maxHp, 4);
  }

  function drawPickup(p) {
    const y = p.y + Math.sin(t * 4 + p.ph) * 3;
    const heart = p.kind === 'heart';
    ctx.fillStyle = heart ? 'rgba(255,79,163,0.2)' : 'rgba(255,210,63,0.15)';
    ctx.beginPath();
    ctx.arc(p.x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    if (heart) ctx.drawImage(SPR.heart, Math.round(p.x - 10), Math.round(y - 9), 21, 18);
    else ctx.drawImage(SPR.egg, Math.round(p.x - 7), Math.round(y - 8), 14, 16);
    if (Math.sin(t * 5 + p.ph) > 0.85) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(Math.round(p.x + 6), Math.round(y - 11), 2, 6);
      ctx.fillRect(Math.round(p.x + 4), Math.round(y - 9), 6, 2);
    }
  }

  function drawShots() {
    for (const s of enemyShots) {
      ctx.fillStyle = 'rgba(124,255,107,0.3)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8 + Math.sin(t * 20) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COL.green;
      ctx.fillRect(Math.round(s.x - 4), Math.round(s.y - 4), 8, 8);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(Math.round(s.x - 2), Math.round(s.y - 2), 4, 4);
    }
    // honk waves: ")" rings flying out of the beak
    for (const b of bullets) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = COL.pink;
      ctx.beginPath();
      ctx.arc(b.x - 4, b.y, 8, -0.9, 0.9);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COL.yellow;
      ctx.beginPath();
      ctx.arc(b.x - 10, b.y, 5, -0.9, 0.9);
      ctx.stroke();
    }
  }

  function drawGoose() {
    const g = goose;
    if (state === 'over') return;
    let spr;
    if (state === 'dying') spr = SPR.airUp;
    else if (g.onGround) spr = Math.floor(g.anim) % 2 ? SPR.runB : SPR.runA;
    else if (g.flying) spr = Math.floor(t * 16) % 2 ? SPR.airUp : SPR.airDown;
    else spr = g.vy < 0 ? SPR.airUp : SPR.airDown;

    if (state !== 'dying') {
      const k = Math.max(0.3, 1 - (GROUND_Y - g.y) / 250);
      ctx.fillStyle = 'rgba(14,10,31,0.45)';
      ctx.beginPath();
      ctx.ellipse(GOOSE_X + 22, GROUND_Y + 3, 18 * k, 4 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const half = GOOSE_SIZE / 2;
    ctx.save();
    if (g.invuln > 0 && state === 'play' && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.translate(GOOSE_X + half, g.y); // squash from the feet
    ctx.scale(2 - g.sy, g.sy);
    ctx.translate(0, -half);            // rotate around the middle
    ctx.rotate(g.rot);
    ctx.drawImage(spr, -half, -half, GOOSE_SIZE, GOOSE_SIZE);

    // space helmet
    const hx = -half + 35;
    const hy = -half + 5;
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59,232,255,0.14)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(59,232,255,0.85)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, 10, Math.PI * 1.1, Math.PI * 1.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.restore();

    if (g.muzzle > 0) {
      ctx.fillStyle = COL.yellow;
      ctx.beginPath();
      ctx.arc(GOOSE_X + 50, g.y - 40, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHUD() {
    text(`HI ${pad(hi)}`, W - 150, 26, 12, COL.muted, 'right');
    const flash = milestoneFlash > 0 && Math.floor(milestoneFlash * 10) % 2 === 0;
    text(pad(score), W - 18, 26, 12, flash ? COL.yellow : COL.text, 'right');
    if (state !== 'title') {
      for (let i = 0; i < MAX_HP; i++) ctx.drawImage(i < goose.hp ? SPR.heart : SPR.heartEmpty, 18 + i * 26, 14, 21, 18);
      ctx.drawImage(SPR.egg, 104, 15, 14, 16);
      text(`x${eggCount}`, 124, 24, 12, COL.yellow, 'left');
      text('FLY', 18, 47, 8, COL.muted, 'left');
      ctx.fillStyle = COL.empty;
      ctx.fillRect(48, 43, 80, 8);
      const low = goose.wing < 0.25 && Math.floor(t * 8) % 2 === 0;
      ctx.fillStyle = low ? COL.pink : COL.cyan;
      ctx.fillRect(48, 43, Math.round(80 * goose.wing), 8);
    }
    if (muted) text('MUTED', 18, H - 16, 8, COL.muted, 'left');
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(14,10,31,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawOverlay() {
    const blink = Math.floor(t * 2.5) % 2 === 0;
    if (state === 'title') {
      if (blink) text('PRESS SPACE OR CLICK', W / 2, 104, 16, COL.yellow, 'center', COL.pink);
      text('TAP TO HOP - HOLD TO FLY', W / 2, 150, 10, COL.text);
      text('X / J / RIGHT-CLICK = SHOOT', W / 2, 172, 10, COL.text);
      text('BLAST ALIENS - DODGE CRYSTALS', W / 2, 194, 10, COL.muted);
      text('M SOUND    P PAUSE', W / 2, H - 16, 8, COL.muted);
    } else if (state === 'over') {
      dim(0.55);
      text('GAME OVER', W / 2, 120, 28, COL.yellow, 'center', COL.pink);
      text(`SCORE ${pad(score)}`, W / 2, 168, 14, COL.text);
      text(`ALIENS x${kills}   EGGS x${eggCount}`, W / 2, 196, 10, COL.green);
      if (newHi && blink) text('NEW HIGH SCORE!', W / 2, 226, 12, COL.cyan);
      if (overTimer > 0.5 && blink) text('SPACE / CLICK TO RETRY', W / 2, 266, 10, COL.muted);
    } else if (paused) {
      dim(0.5);
      text('PAUSED', W / 2, 168, 24, COL.yellow, 'center', COL.pink);
      text('SPACE / CLICK / P TO RESUME', W / 2, 212, 10, COL.muted);
    }
  }

  const DRAW_ENEMY = { blob: drawBlob, jelly: drawJelly, saucer: drawSaucer };

  function render() {
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBackground();
    drawGround();
    pickups.forEach(drawPickup);
    obstacles.forEach(drawCrystal);
    for (const e of enemies) if (!e.dead) DRAW_ENEMY[e.kind](e);
    drawShots();
    drawGoose();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      text(p.text, p.x, p.y, 10, p.color);
    }
    ctx.globalAlpha = 1;
    drawHUD();
    drawOverlay();
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // clamp so tab switches don't teleport
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
