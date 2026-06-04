/* =====================================================
   Road Trip Rush — script.js
   Single-player 2D side-scroller
   ===================================================== */

(() => {
  "use strict";

  // ----- Constants -----
  const CANVAS_W = 900;
  const CANVAS_H = 420;
  const GROUND_Y = 336;            // top of road surface
  const PLAYER_X_SCREEN = 140;     // player's fixed screen X
  const PLAYER_W = 78;             // car body width
  const PLAYER_H = 44;              // car body height (incl. wheels)
  const GRAVITY = 0.275;
  const JUMP_VELOCITY = -11.5;     // car "hop" over potholes
  const MOVE_SPEED = 3.6;
  const WORLD_LENGTH = 7200;       // pixels to reach destination
  const MAX_HEALTH = 100;
  const OBSTACLE_DAMAGE = 18;
  const HIGH_SCORE_KEY = "roadTripRush.highScores.v1";
  const MAX_HIGH_SCORES = 5;
  const COUNTDOWN_SECONDS = 60;
  const CITY_TIME_BONUS = 45;

  // ----- Selfie / Scrapbook -----
  const SCRAPBOOK_KEY = "roadTripRush.scrapbook.v1";
  const SELFIES_PER_RUN = 3;
  const MAX_SCRAPBOOK = 15;            // cap to keep localStorage manageable
  const SNAP_JPEG_QUALITY = 0.55;       // ~70KB per 900x420 photo
  const SELFIE_TOTAL_FRAMES = 50;      // ~0.8s at 60fps; the snap happens at SNAP_FRAME
  const SNAP_FRAME = 22;                // frame when the shutter fires
  // Selfie scoring weights (paid per item visible in the photo)
  const SELFIE_PTS = {
    collectible: 10,
    obstacle:    5,
    sign:        25,
    billboard:   30,
    finishFlag:  75,
  };

  // ----- Difficulty -----
  const DIFFICULTY_KEY = "roadTripRush.difficulty.v1";
  const DIFFICULTIES = {
    easy:   { label: "Easy",          timer: 80, damage: 12, obstacleSpacing: 1.3, scrollMult: 0.9 },
    normal: { label: "Road-Trip",     timer: 60, damage: 18, obstacleSpacing: 1.0, scrollMult: 1.0 },
    hard:   { label: "Sunset Sprint", timer: 45, damage: 24, obstacleSpacing: 0.8, scrollMult: 1.1 },
  };
  function loadDifficulty() {
    const stored = localStorage.getItem(DIFFICULTY_KEY);
    return DIFFICULTIES[stored] ? stored : "normal";
  }
  function saveDifficulty(key) {
    if (DIFFICULTIES[key]) localStorage.setItem(DIFFICULTY_KEY, key);
  }

  // ----- Combo / multiplier -----
  // Streak resets to 0 on obstacle hit; multiplier scales with streak length.
  const COMBO_TIERS = [
    { threshold: 7, mult: 3 },
    { threshold: 3, mult: 2 },
    { threshold: 0, mult: 1 },
  ];
  function comboMultiplierFor(count) {
    for (const tier of COMBO_TIERS) if (count >= tier.threshold) return tier.mult;
    return 1;
  }

  // ----- Power-ups -----
  const POWERUP_DEFS = {
    coffee: { emoji: "☕", color: "#8b5a2b", duration: 300, label: "Caffeine Rush" },
    gps:    { emoji: "🗺️", color: "#4ca64c", duration: 240, label: "GPS Slowdown" },
    tire:   { emoji: "🛞", color: "#333",    duration: 0,   label: "Spare Tire"   }, // shield until next hit
    star:   { emoji: "🎆", color: "#ffd60a", duration: 180, label: "Star-Spangled" },
    gas:    { emoji: "⛽", color: "#d7263d", duration: 0,   label: "+30 Health"   }, // instant
  };
  const POWERUP_KEYS = Object.keys(POWERUP_DEFS);
  const POWERUP_SPACING_MIN = 1200;
  const POWERUP_SPACING_MAX = 1800;

  // ----- Audio -----
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playTone(frequency, type, duration, gainVal = 0.3) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function sfxJump() {
    playTone(300, "sine", 0.12, 0.2);
    playTone(500, "sine", 0.1, 0.15);
  }

  function sfxCollect() {
    playTone(880, "sine", 0.08, 0.25);
    playTone(1100, "sine", 0.12, 0.2);
  }

  function sfxHit() {
    playTone(180, "sawtooth", 0.25, 0.4);
  }

  function sfxWin() {
    [523, 659, 784, 1047].forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, audioCtx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.12 + 0.2);
      osc.start(audioCtx.currentTime + i * 0.12);
      osc.stop(audioCtx.currentTime + i * 0.12 + 0.2);
    });
  }

  function sfxLose() {
    [400, 320, 240].forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, audioCtx.currentTime + i * 0.18);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.18 + 0.25);
      osc.start(audioCtx.currentTime + i * 0.18);
      osc.stop(audioCtx.currentTime + i * 0.18 + 0.25);
    });
  }

  function sfxWarningBeep() {
    playTone(1400, "square", 0.1, 0.35);
  }

  function sfxShutter() {
    // Short, percussive "k-chk" — high white-noise burst then a low click
    playTone(2400, "square", 0.04, 0.25);
    setTimeout(() => playTone(180, "square", 0.05, 0.3), 60);
  }

  function sfxSelfieReady() {
    // Quick rising chirp when entering selfie mode
    playTone(660, "sine", 0.08, 0.18);
    playTone(880, "sine", 0.1, 0.18);
  }

  function sfxHonk() {
    // Two-tone car honk
    playTone(440, "square", 0.18, 0.3);
    setTimeout(() => playTone(370, "square", 0.18, 0.3), 100);
  }

  function sfxPowerUp() {
    // Ascending arpeggio
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, "triangle", 0.1, 0.22), i * 50);
    });
  }

  function sfxCombo(tier) {
    // Higher-pitched ding for higher tiers
    const base = 880 + (tier - 1) * 220;
    playTone(base, "sine", 0.1, 0.22);
    setTimeout(() => playTone(base * 1.5, "sine", 0.12, 0.18), 60);
  }

  // ----- DOM -----
  const screens = {
    title: document.getElementById("title-screen"),
    game: document.getElementById("game-screen"),
    scores: document.getElementById("scores-screen"),
    scrapbook: document.getElementById("scrapbook-screen"),
  };
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const els = {
    healthFill: document.getElementById("health-fill"),
    distanceFill: document.getElementById("distance-fill"),
    score: document.getElementById("score"),
    timerDisplay: document.getElementById("timer-display"),
    levelDisplay: document.getElementById("level-display"),
    pauseOverlay: document.getElementById("pause-overlay"),
    gameoverOverlay: document.getElementById("gameover-overlay"),
    gameoverTitle: document.getElementById("gameover-title"),
    gameoverMessage: document.getElementById("gameover-message"),
    finalScore: document.getElementById("final-score"),
    initialsSection: document.getElementById("initials-section"),
    scoresList: document.getElementById("scores-list"),
    noScores: document.getElementById("no-scores"),
    selfiesLeft: document.getElementById("selfies-left"),
    scrapbookGrid: document.getElementById("scrapbook-grid"),
    noScrapbook: document.getElementById("no-scrapbook"),
    comboBadge: document.getElementById("combo-badge"),
    activePowerups: document.getElementById("active-powerups"),
    difficultyButtons: () => document.querySelectorAll(".diff-btn"),
  };

  // ----- State -----
  const game = {
    running: false,
    paused: false,
    worldX: 0,             // how far the world has scrolled (player progress)
    player: {
      x: PLAYER_X_SCREEN,
      y: GROUND_Y - PLAYER_H,
      vy: 0,
      onGround: true,
      facing: 1,
      iFrames: 0,          // invulnerability frames after hit
    },
    health: MAX_HEALTH,
    score: 0,
    timeLeft: COUNTDOWN_SECONDS,
    lastTimestamp: null,
    level: 1,
    frame: 0,
    shake: { frames: 0, intensity: 0 },
    particles: [],
    transition: { active: false, frames: 0 },
    obstacles: [],
    collectibles: [],
    clouds: [],
    mountains: [],
    buildings: [],
    streetlights: [],
    stars: [],
    billboards: [],
    powerUps: [],            // pickups placed in the world
    activePowerUps: [],      // currently-active effects with framesLeft
    confetti: [],            // win-screen confetti
    shield: false,            // from spare-tire pickup
    combo: { count: 0, multiplier: 1 },
    honk: { ttl: 0 },         // visual cue for honk
    difficulty: "normal",
    keys: {},
    pickupLabels: [],
    selfiesLeft: SELFIES_PER_RUN,
    selfie: { active: false, frame: 0, snapped: false },
    rafId: null,
  };

  // ----- Screen routing -----
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ----- World generation -----
  function generateWorld() {
    game.obstacles.length = 0;
    game.collectibles.length = 0;
    game.clouds.length = 0;
    game.mountains.length = 0;

    // Obstacles: pothole, cone, roadblock, low-fuel
    // Spacing tightens with harder difficulties.
    const obstacleTypes = ["pothole", "cone", "roadblock", "fuel"];
    const spacingMult = DIFFICULTIES[game.difficulty].obstacleSpacing;
    let x = 600;
    while (x < WORLD_LENGTH - 400) {
      const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
      game.obstacles.push(makeObstacle(type, x));
      x += Math.floor((220 + Math.floor(Math.random() * 220)) * spacingMult);
    }

    // Collectibles: souvenir, snack, postcard, camera
    const collectibleTypes = ["souvenir", "snack", "postcard", "camera"];
    let cx = 400;
    while (cx < WORLD_LENGTH - 300) {
      const type = collectibleTypes[Math.floor(Math.random() * collectibleTypes.length)];
      // Some collectibles float higher to encourage jumping
      const high = Math.random() < 0.35;
      game.collectibles.push(makeCollectible(type, cx, high));
      cx += 160 + Math.floor(Math.random() * 180);
    }

    // Background clouds
    for (let i = 0; i < 24; i++) {
      game.clouds.push({
        x: Math.random() * WORLD_LENGTH,
        y: 30 + Math.random() * 110,
        r: 18 + Math.random() * 16,
      });
    }

    // Mountains
    for (let i = 0; i < 14; i++) {
      game.mountains.push({
        x: i * 600 + Math.random() * 200,
        h: 90 + Math.random() * 60,
        w: 280 + Math.random() * 120,
      });
    }

    // Roadside billboards — photogenic, no collision
    placeBillboards(HIGHWAY_BILLBOARDS, "#1b3a8a", "#fff");

    // Power-ups sprinkled along the road
    placePowerUps();
  }

  const HIGHWAY_BILLBOARDS = [
    { l1: "Tech Code Cloud", l2: "TC² — Free Hugs!" },
    { l1: "World's Biggest", l2: "Ball of Yarn — 12 mi" },
    { l1: "Welcome to", l2: "Liberty Falls, USA" },
    { l1: "🎆 Parade Tonight", l2: "9pm Sharp" },
    { l1: "Asha's Diner", l2: "Best Pie in 5 States" },
    { l1: "Pick Your Own", l2: "Sparklers ➜" },
    { l1: "Last Gas", l2: "for 50 Miles" },
  ];

  const CITY_BILLBOARDS = [
    { l1: "Times Square", l2: "Studios" },
    { l1: "Broadway", l2: "Showtime 8pm" },
    { l1: "City Diner", l2: "Open 24 Hrs" },
    { l1: "TC² Tower", l2: "Floor 47" },
    { l1: "🎆 Fireworks", l2: "Tonight @ 9" },
    { l1: "Skyline Hotel", l2: "Vacancy ✨" },
  ];

  function placePowerUps() {
    game.powerUps.length = 0;
    let x = 900 + Math.random() * 400;
    while (x < WORLD_LENGTH - 300) {
      const type = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
      game.powerUps.push(makePowerUp(type, x));
      x += POWERUP_SPACING_MIN + Math.random() * (POWERUP_SPACING_MAX - POWERUP_SPACING_MIN);
    }
  }

  function makePowerUp(type, worldX) {
    return {
      type,
      x: worldX,
      y: GROUND_Y - PLAYER_H - 40,
      w: 32,
      h: 32,
      collected: false,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function placeBillboards(pool, bgColor, fgColor) {
    game.billboards.length = 0;
    // Spread billboards evenly with some jitter, skipping the very start/end
    const count = Math.min(pool.length, 5 + Math.floor(Math.random() * 2));
    const spacing = (WORLD_LENGTH - 1400) / count;
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const text = shuffled[i % shuffled.length];
      game.billboards.push({
        x: 800 + i * spacing + Math.random() * 120,
        l1: text.l1,
        l2: text.l2,
        bg: bgColor,
        fg: fgColor,
      });
    }
  }

  // ----- Level 2 setup -----
  function startLevel2() {
    game.level = 2;
    game.worldX = 0;
    game.timeLeft = Math.min(game.timeLeft + CITY_TIME_BONUS, COUNTDOWN_SECONDS + CITY_TIME_BONUS);
    game.player.x = PLAYER_X_SCREEN;
    game.player.y = GROUND_Y - PLAYER_H;
    game.player.vy = 0;
    game.player.onGround = true;
    game.player.facing = 1;
    game.player.iFrames = 0;
    game.frame = 0;
    game.shake = { frames: 0, intensity: 0 };
    game.particles = [];
    game.transition = { active: true, frames: 160 };
    game.selfie = { active: false, frame: 0, snapped: false };
    // Note: selfiesLeft, combo, and activePowerUps all persist across the
    // level break — they're run-wide. New pickups will be spawned by
    // generateCityWorld() below via placePowerUps().
    generateCityWorld();
    updateHud();
    sfxWin();
  }

  function generateCityWorld() {
    game.obstacles.length = 0;
    game.collectibles.length = 0;
    game.clouds.length = 0;
    game.mountains.length = 0;
    game.buildings = [];
    game.streetlights = [];
    game.stars = [];

    // City-specific obstacles (denser, tighter spacing)
    const cityObstacleTypes = ["manhole", "taxi", "hydrant", "barrier"];
    const cityScale = DIFFICULTIES[game.difficulty].obstacleSpacing;
    let x = 500;
    while (x < WORLD_LENGTH - 400) {
      const type = cityObstacleTypes[Math.floor(Math.random() * cityObstacleTypes.length)];
      game.obstacles.push(makeCityObstacle(type, x));
      x += Math.floor((180 + Math.floor(Math.random() * 200)) * cityScale);
    }

    // Collectibles — same structure, city-themed
    const collectibleTypes = ["souvenir", "snack", "postcard", "camera"];
    let cx = 400;
    while (cx < WORLD_LENGTH - 300) {
      const type = collectibleTypes[Math.floor(Math.random() * collectibleTypes.length)];
      const high = Math.random() < 0.35;
      game.collectibles.push(makeCollectible(type, cx, high));
      cx += 160 + Math.floor(Math.random() * 180);
    }

    // City skyline buildings
    let bx = 0;
    while (bx < WORLD_LENGTH + 400) {
      const w = 55 + Math.floor(Math.random() * 90);
      const h = 80 + Math.floor(Math.random() * 200);
      const color = ["#1a2340", "#1e2a3a", "#151f35", "#0e1a2e"][Math.floor(Math.random() * 4)];
      const windows = [];
      for (let wy = h - 20; wy > 10; wy -= 18) {
        for (let wx = 8; wx < w - 8; wx += 16) {
          if (Math.random() < 0.55) windows.push({ wx, wy });
        }
      }
      game.buildings.push({ x: bx, w, h, color, windows });
      bx += w + 2 + Math.floor(Math.random() * 12);
    }

    // Streetlights
    for (let lx = 200; lx < WORLD_LENGTH; lx += 220 + Math.floor(Math.random() * 80)) {
      game.streetlights.push({ x: lx });
    }

    // Stars
    for (let i = 0; i < 120; i++) {
      game.stars.push({
        x: Math.random() * WORLD_LENGTH,
        y: 10 + Math.random() * 140,
        r: Math.random() < 0.15 ? 1.5 : 0.8,
      });
    }

    // Neon-styled billboards for the city
    placeBillboards(CITY_BILLBOARDS, "#220a3a", "#ffd60a");

    // Power-ups in city level too
    placePowerUps();
  }

  function makeCityObstacle(type, worldX) {
    const sizes = {
      manhole: { w: 44, h: 14, yOffset: -10 },
      taxi:    { w: 72, h: 40, yOffset: -40 },
      hydrant: { w: 22, h: 34, yOffset: -34 },
      barrier: { w: 60, h: 26, yOffset: -26 },
    };
    const s = sizes[type];
    return { type, x: worldX, y: GROUND_Y + s.yOffset, w: s.w, h: s.h, hit: false };
  }

  function drawTransitionBanner() {
    const alpha = Math.min(1, game.transition.frames / 40);
    ctx.save();
    ctx.globalAlpha = alpha * 0.82;
    ctx.fillStyle = "#0a0a2e";
    ctx.fillRect(0, CANVAS_H / 2 - 70, CANVAS_W, 140);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffd60a";
    ctx.font = "bold 38px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏙  Level 2: City Rush!", CANVAS_W / 2, CANVAS_H / 2 - 18);
    ctx.fillStyle = "#fff";
    ctx.font = "18px sans-serif";
    ctx.fillText(`+${CITY_TIME_BONUS}s time bonus — navigate the city streets!`, CANVAS_W / 2, CANVAS_H / 2 + 24);
    ctx.restore();
  }

  // ----- Highway rendering (Level 1) -----
  function renderHighwayBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, "#87ceeb");
    sky.addColorStop(0.7, "#b9e3f7");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Sun (sinking as you approach destination)
    const progress = game.worldX / WORLD_LENGTH;
    const sunX = CANVAS_W - 110;
    const sunY = 70 + progress * 160;
    const sunColor = progress < 0.75 ? "#ffd60a" : "#ff7b00";
    ctx.fillStyle = sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = sunColor;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sunX + Math.cos(a) * 42, sunY + Math.sin(a) * 42);
      ctx.lineTo(sunX + Math.cos(a) * 54, sunY + Math.sin(a) * 54);
      ctx.stroke();
    }

    // Mountains (parallax slow)
    for (const m of game.mountains) {
      const sx = m.x - game.worldX * 0.3;
      if (sx + m.w < 0 || sx > CANVAS_W) continue;
      ctx.fillStyle = "#6e8aa6";
      ctx.beginPath();
      ctx.moveTo(sx, GROUND_Y - 84);
      ctx.lineTo(sx + m.w / 2, GROUND_Y - 84 - m.h);
      ctx.lineTo(sx + m.w, GROUND_Y - 84);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(sx + m.w / 2 - 16, GROUND_Y - 84 - m.h + 22);
      ctx.lineTo(sx + m.w / 2, GROUND_Y - 84 - m.h);
      ctx.lineTo(sx + m.w / 2 + 16, GROUND_Y - 84 - m.h + 22);
      ctx.closePath();
      ctx.fill();
    }

    // Clouds (parallax medium)
    ctx.fillStyle = "#fff";
    for (const c of game.clouds) {
      const sx = c.x - game.worldX * 0.5;
      if (sx + c.r * 3 < 0 || sx > CANVAS_W + 60) continue;
      ctx.beginPath();
      ctx.arc(sx, c.y, c.r, 0, Math.PI * 2);
      ctx.arc(sx + c.r * 0.9, c.y - c.r * 0.3, c.r * 0.9, 0, Math.PI * 2);
      ctx.arc(sx + c.r * 1.8, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Grass band
    ctx.fillStyle = "#4ca64c";
    ctx.fillRect(0, GROUND_Y - 84, CANVAS_W, 84);

    drawRoadsideSign(2400, "🏖 BEACH");
    drawRoadsideSign(4400, "🍔 DINER");
    drawRoadsideSign(6200, "🎆 PARADE");

    // Road
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);

    // Road dashes
    ctx.fillStyle = "#ffd60a";
    const dashSpacing = 80;
    const dashOffset = game.worldX % dashSpacing;
    for (let i = -1; i * dashSpacing - dashOffset < CANVAS_W; i++) {
      ctx.fillRect(i * dashSpacing - dashOffset, GROUND_Y + 36, 40, 6);
    }
  }

  // ----- City rendering (Level 2) -----
  function renderCityBackground() {
    // Night sky
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, "#04040f");
    sky.addColorStop(0.55, "#0d1130");
    sky.addColorStop(1, "#1a1040");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Stars (parallax very slow)
    for (const s of game.stars) {
      const sx = s.x - game.worldX * 0.05;
      const wrapped = ((sx % CANVAS_W) + CANVAS_W) % CANVAS_W;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(wrapped, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Moon
    const moonX = CANVAS_W - 100;
    const moonY = 55;
    ctx.fillStyle = "#fffde0";
    ctx.beginPath();
    ctx.arc(moonX, moonY, 28, 0, Math.PI * 2);
    ctx.fill();
    // Crescent shadow
    ctx.fillStyle = "#0d1130";
    ctx.beginPath();
    ctx.arc(moonX + 10, moonY - 4, 23, 0, Math.PI * 2);
    ctx.fill();

    // City buildings (parallax 0.75)
    for (const b of game.buildings) {
      const sx = b.x - game.worldX * 0.75;
      if (sx + b.w < 0 || sx > CANVAS_W) continue;
      const by = GROUND_Y - 84 - b.h;
      ctx.fillStyle = b.color;
      ctx.fillRect(sx, by, b.w, b.h + 84);
      // Lit windows
      for (const w of b.windows) {
        ctx.fillStyle = Math.random() < 0.003
          ? "rgba(255,100,100,0.9)"   // rare red window
          : "rgba(255,230,120,0.85)";
        ctx.fillRect(sx + w.wx, by + w.wy, 8, 10);
      }
    }

    // Sidewalk strip above road
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(0, GROUND_Y - 84, CANVAS_W, 84);
    // Curb line
    ctx.fillStyle = "#888";
    ctx.fillRect(0, GROUND_Y - 4, CANVAS_W, 4);

    // City signs
    drawRoadsideSign(1800, "🏙 UPTOWN");
    drawRoadsideSign(3800, "🌉 BRIDGE");
    drawRoadsideSign(5800, "🎆 FIREWORKS");

    // Road
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);

    // Road dashes (white in city)
    ctx.fillStyle = "#e0e0e0";
    const dashSpacing = 80;
    const dashOffset = game.worldX % dashSpacing;
    for (let i = -1; i * dashSpacing - dashOffset < CANVAS_W; i++) {
      ctx.fillRect(i * dashSpacing - dashOffset, GROUND_Y + 36, 40, 5);
    }

    // Streetlights
    for (const sl of game.streetlights) {
      const sx = sl.x - game.worldX;
      if (sx < -40 || sx > CANVAS_W + 40) continue;
      drawStreetlight(sx);
    }
  }

  function drawStreetlight(x) {
    // Pole
    ctx.fillStyle = "#555";
    ctx.fillRect(x - 3, GROUND_Y - 110, 6, 110);
    // Arm
    ctx.fillStyle = "#555";
    ctx.fillRect(x - 3, GROUND_Y - 110, 26, 5);
    // Lamp head
    ctx.fillStyle = "#333";
    ctx.fillRect(x + 18, GROUND_Y - 116, 18, 10);
    // Glow
    const glow = ctx.createRadialGradient(x + 27, GROUND_Y - 111, 2, x + 27, GROUND_Y - 111, 40);
    glow.addColorStop(0, "rgba(255,230,100,0.35)");
    glow.addColorStop(1, "rgba(255,230,100,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x + 27, GROUND_Y - 111, 40, 0, Math.PI * 2);
    ctx.fill();
    // Lamp bright spot
    ctx.fillStyle = "#ffe876";
    ctx.fillRect(x + 20, GROUND_Y - 114, 14, 6);
  }

  function makeObstacle(type, worldX) {
    const sizes = {
      pothole:   { w: 56, h: 14, yOffset: -10 },   // sits on road
      cone:      { w: 26, h: 38, yOffset: -38 },
      roadblock: { w: 70, h: 32, yOffset: -32 },
      fuel:      { w: 36, h: 46, yOffset: -46 },   // low-fuel hazard sign
    };
    const s = sizes[type];
    return {
      type,
      x: worldX,
      y: GROUND_Y + s.yOffset,
      w: s.w,
      h: s.h,
      hit: false,
    };
  }

  function makeCollectible(type, worldX, high) {
    const pts = { souvenir: 50, snack: 20, postcard: 35, camera: 75 };
    const y = high ? GROUND_Y - PLAYER_H - 60 : GROUND_Y - PLAYER_H - 10;
    return {
      type,
      x: worldX,
      y,
      w: 28,
      h: 28,
      points: pts[type],
      collected: false,
      phase: Math.random() * Math.PI * 2,
    };
  }

  const PICKUP_NAMES = { souvenir: "Souvenir", snack: "Snack", postcard: "Postcard", camera: "Camera" };
  const PICKUP_EMOJI = { souvenir: "🗽", snack: "🍿", postcard: "💌", camera: "📸" };
  const PICKUP_LABEL_TTL = 110;

  function spawnPickupLabel(type, points, screenX, screenY) {
    game.pickupLabels.push({
      base: `${PICKUP_EMOJI[type]} ${PICKUP_NAMES[type]} `,
      pts: `+${points}`,
      x: screenX,
      y: screenY,
      ttl: PICKUP_LABEL_TTL,
      maxTtl: PICKUP_LABEL_TTL,
    });
  }

  // ----- Game lifecycle -----
  function startGame() {
    game.worldX = 0;
    game.player.x = PLAYER_X_SCREEN;
    game.player.y = GROUND_Y - PLAYER_H;
    game.player.vy = 0;
    game.player.onGround = true;
    game.player.facing = 1;
    game.player.iFrames = 0;
    game.level = 1;
    game.health = MAX_HEALTH;
    game.score = 0;
    game.difficulty = loadDifficulty();
    game.timeLeft = DIFFICULTIES[game.difficulty].timer;
    game.lastTimestamp = null;
    game.frame = 0;
    game.shake = { frames: 0, intensity: 0 };
    game.particles = [];
    game.transition = { active: false, frames: 0 };
    game.buildings = [];
    game.streetlights = [];
    game.stars = [];
    game.billboards = [];
    game.powerUps = [];
    game.activePowerUps = [];
    game.confetti = [];
    game.shield = false;
    game.combo = { count: 0, multiplier: 1 };
    game.honk = { ttl: 0 };
    game.selfiesLeft = SELFIES_PER_RUN;
    game.selfie = { active: false, frame: 0, snapped: false };
    game.paused = false;
    game.running = true;
    game.pickupLabels.length = 0;

    generateWorld();
    updateHud();
    els.pauseOverlay.classList.add("hidden");
    els.gameoverOverlay.classList.add("hidden");
    els.initialsSection.classList.add("hidden");

    showScreen("game");
    cancelAnimationFrame(game.rafId);
    game.rafId = requestAnimationFrame(loop);
  }

  function endGame(reachedDestination, timedOut = false) {
    game.running = false;
    cancelAnimationFrame(game.rafId);

    if (reachedDestination) {
      game.score += Math.round(game.health * 5);
      sfxWin();
      spawnWinConfetti();
    } else {
      sfxLose();
    }

    els.gameoverTitle.textContent = reachedDestination
      ? "City Conquered! 🏙🎉"
      : timedOut ? "Out of Time! ⏰" : "Out of Gas!";
    els.gameoverMessage.textContent = reachedDestination
      ? "Asha navigated the city streets and reached the fireworks show. Happy 4th!"
      : timedOut
      ? "The city lights faded before Asha reached her destination!"
      : "Asha's city drive ended early. Better luck next weekend!";
    els.finalScore.textContent = game.score;

    const qualifies = scoreQualifies(game.score);
    if (qualifies) {
      els.initialsSection.classList.remove("hidden");
      const inputs = document.querySelectorAll(".initial");
      inputs.forEach((i) => (i.value = ""));
      inputs[0].focus();
    } else {
      els.initialsSection.classList.add("hidden");
    }

    els.gameoverOverlay.classList.remove("hidden");
  }

  // ----- Selfie / Scrapbook -----
  function tryStartSelfie() {
    if (!game.running || game.paused) return;
    if (game.selfie.active) return;
    if (game.transition.active) return;
    if (game.selfiesLeft <= 0) return;
    game.selfiesLeft--;
    game.selfie = { active: true, frame: 0, snapped: false };
    sfxSelfieReady();
    updateHud();
  }

  function captureSelfie() {
    // Capture the canvas BEFORE drawing the polaroid frame so the photo
    // is a clean shot of the scene.
    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL("image/jpeg", SNAP_JPEG_QUALITY);
    } catch (err) {
      // Some browsers may refuse toDataURL on a tainted canvas — extremely
      // unlikely here since everything is drawn in-process, but be safe.
      dataUrl = "";
    }

    // Compute bonus from what's visible on screen right now
    const visible = scanVisibleFrame();
    let bonus = 0;
    bonus += visible.collectibles.length * SELFIE_PTS.collectible;
    bonus += visible.obstacles * SELFIE_PTS.obstacle;
    bonus += visible.signs * SELFIE_PTS.sign;
    bonus += visible.billboards.length * SELFIE_PTS.billboard;
    if (visible.finishFlag) bonus += SELFIE_PTS.finishFlag;
    // Variety multiplier — at least 3 distinct things in the photo
    const variety = visible.collectibles.length
                  + (visible.obstacles > 0 ? 1 : 0)
                  + (visible.signs > 0 ? 1 : 0)
                  + visible.billboards.length
                  + (visible.finishFlag ? 1 : 0);
    let multiplier = 1;
    if (variety >= 5) multiplier = 2;
    else if (variety >= 3) multiplier = 1.5;
    bonus = Math.round(bonus * multiplier);

    game.score += bonus;
    sfxShutter();

    // Floating "+bonus" label so the score change is visible
    spawnPickupLabel(
      "camera",
      bonus,
      game.player.x + PLAYER_W / 2,
      game.player.y - 24
    );

    // Save to scrapbook
    if (dataUrl) {
      const entry = {
        dataUrl,
        bonus,
        multiplier,
        level: game.level,
        date: new Date().toISOString().slice(0, 10), // yyyy-MM-dd
        items: {
          collectibles: visible.collectibles,
          obstacles: visible.obstacles,
          signs: visible.signs,
          billboards: visible.billboards,
          finishFlag: visible.finishFlag,
        },
      };
      addScrapbookEntry(entry);
    }
  }

  function scanVisibleFrame() {
    // What's currently in the camera's view (0..CANVAS_W)?
    const onScreen = (x, w) => x + (w || 0) > 0 && x < CANVAS_W;
    const collectibles = [];
    for (const co of game.collectibles) {
      if (co.collected) continue;
      const sx = co.x - game.worldX;
      if (onScreen(sx, co.w)) collectibles.push(co.type);
    }
    let obstacles = 0;
    for (const ob of game.obstacles) {
      if (ob.hit) continue;
      const sx = ob.x - game.worldX;
      if (onScreen(sx, ob.w)) obstacles++;
    }
    const signsX = game.level === 2
      ? [1800, 3800, 5800]
      : [2400, 4400, 6200];
    let signs = 0;
    for (const wx of signsX) {
      const sx = wx - game.worldX;
      if (onScreen(sx, 60)) signs++;
    }
    const billboards = [];
    for (const b of game.billboards) {
      const sx = b.x - game.worldX;
      if (onScreen(sx, 140)) billboards.push(b.l1);
    }
    const flagWorldX = WORLD_LENGTH - 80;
    const flagScreenX = flagWorldX - game.worldX;
    const finishFlag = onScreen(flagScreenX, 64);
    return { collectibles, obstacles, signs, billboards, finishFlag };
  }

  function loadScrapbook() {
    try {
      const raw = localStorage.getItem(SCRAPBOOK_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveScrapbook(list) {
    try {
      localStorage.setItem(SCRAPBOOK_KEY, JSON.stringify(list));
    } catch (err) {
      // QuotaExceeded — drop the oldest and try again
      if (list.length > 1) {
        saveScrapbook(list.slice(0, list.length - 1));
      }
    }
  }

  function addScrapbookEntry(entry) {
    const list = loadScrapbook();
    list.unshift(entry); // newest first
    if (list.length > MAX_SCRAPBOOK) list.length = MAX_SCRAPBOOK;
    saveScrapbook(list);
  }

  function renderScrapbook() {
    const list = loadScrapbook();
    els.scrapbookGrid.innerHTML = "";
    if (list.length === 0) {
      els.noScrapbook.classList.remove("hidden");
      return;
    }
    els.noScrapbook.classList.add("hidden");
    for (const entry of list) {
      const card = document.createElement("div");
      card.className = "polaroid";

      const img = document.createElement("img");
      img.src = entry.dataUrl;
      img.alt = `Selfie — Level ${entry.level}`;
      card.appendChild(img);

      const meta = document.createElement("div");
      meta.className = "polaroid-meta";

      const bonus = document.createElement("div");
      bonus.className = "polaroid-bonus";
      bonus.textContent = `+${entry.bonus} pts${entry.multiplier > 1 ? ` (×${entry.multiplier})` : ""}`;
      meta.appendChild(bonus);

      const itemEmojis = [];
      const emojiMap = { souvenir: "🗽", snack: "🍿", postcard: "💌", camera: "📸" };
      for (const c of (entry.items.collectibles || [])) {
        itemEmojis.push(emojiMap[c] || "❔");
      }
      if (entry.items.obstacles) itemEmojis.push(`⚠×${entry.items.obstacles}`);
      if (entry.items.signs)     itemEmojis.push(`🪧×${entry.items.signs}`);
      if (entry.items.billboards && entry.items.billboards.length) {
        itemEmojis.push(`📋×${entry.items.billboards.length}`);
      }
      if (entry.items.finishFlag) itemEmojis.push("🏁");

      const items = document.createElement("div");
      items.className = "polaroid-items";
      items.textContent = itemEmojis.join(" ");
      meta.appendChild(items);

      const footer = document.createElement("div");
      footer.className = "polaroid-footer";
      footer.textContent = `Lvl ${entry.level} · ${entry.date}`;
      meta.appendChild(footer);

      card.appendChild(meta);
      els.scrapbookGrid.appendChild(card);
    }
  }

  // ----- Main loop -----
  function loop(timestamp) {
    if (!game.running) return;
    if (game.transition.active) {
      game.transition.frames--;
      if (game.transition.frames <= 0) {
        game.transition.active = false;
        game.lastTimestamp = null;
      }
      render();
      drawTransitionBanner();
      game.rafId = requestAnimationFrame(loop);
      return;
    }
    if (!game.paused) {
      if (game.selfie.active) {
        // World freezes during the selfie — timer + physics paused.
        // Reset lastTimestamp so paused time isn't counted when selfie ends.
        game.lastTimestamp = null;
        tickSelfie();
        render();
      } else {
        tickTimer(timestamp);
        update();
        render();
      }
    }
    game.rafId = requestAnimationFrame(loop);
  }

  function tickSelfie() {
    game.selfie.frame++;
    // The actual snap (toDataURL) happens inside render(), AFTER the scene
    // is drawn but BEFORE the polaroid overlay — so the photo is clean.
    if (game.selfie.frame >= SELFIE_TOTAL_FRAMES) {
      game.selfie.active = false;
    }
  }

  function tickTimer(timestamp) {
    if (game.lastTimestamp === null) {
      game.lastTimestamp = timestamp;
      return;
    }
    let delta = (timestamp - game.lastTimestamp) / 1000;
    game.lastTimestamp = timestamp;

    // GPS power-up halves the rate the timer drains.
    if (hasActivePowerUp("gps")) delta *= 0.5;

    const prevFloor = Math.ceil(game.timeLeft);
    game.timeLeft = Math.max(0, game.timeLeft - delta);
    const newFloor = Math.ceil(game.timeLeft);

    // Play a warning beep each time the integer second ticks down in the last 10s
    if (newFloor < prevFloor && game.timeLeft > 0 && newFloor <= 10) {
      sfxWarningBeep();
    }

    updateTimerDisplay();

    if (game.timeLeft <= 0) {
      endGame(false, true);
    }
  }

  function updateTimerDisplay() {
    const secs = Math.ceil(game.timeLeft);
    els.timerDisplay.textContent = secs;
    if (secs <= 10) {
      els.timerDisplay.style.color = "#d7263d";
      els.timerDisplay.style.fontWeight = "bold";
    } else {
      els.timerDisplay.style.color = "";
      els.timerDisplay.style.fontWeight = "";
    }
  }

  function update() {
    game.frame++;
    if (game.shake.frames > 0) game.shake.frames--;
    updateParticles();

    // Tick active power-up timers and apply effects
    tickActivePowerUps();

    // Effective move speed = base × difficulty scroll × coffee bonus
    let speedMult = DIFFICULTIES[game.difficulty].scrollMult;
    if (hasActivePowerUp("coffee")) speedMult *= 1.35;
    const effectiveSpeed = MOVE_SPEED * speedMult;

    // Horizontal movement — world scrolls when moving right past anchor
    const leftDown = game.keys["ArrowLeft"] || game.keys["a"] || game.keys["A"];
    const rightDown = game.keys["ArrowRight"] || game.keys["d"] || game.keys["D"];

    if (rightDown) {
      game.worldX += effectiveSpeed;
      game.player.facing = 1;
    }
    if (leftDown) {
      game.worldX = Math.max(0, game.worldX - effectiveSpeed * 0.85);
      game.player.facing = -1;
    }

    // Jump
    const jumpDown = game.keys["ArrowUp"] || game.keys["w"] || game.keys["W"] || game.keys[" "];
    if (jumpDown && game.player.onGround) {
      game.player.vy = JUMP_VELOCITY;
      game.player.onGround = false;
      sfxJump();
    }

    // Gravity
    game.player.vy += GRAVITY;
    game.player.y += game.player.vy;
    if (game.player.y >= GROUND_Y - PLAYER_H) {
      game.player.y = GROUND_Y - PLAYER_H;
      game.player.vy = 0;
      game.player.onGround = true;
    }

    if (game.player.iFrames > 0) game.player.iFrames--;

    // Collisions
    const playerRect = {
      x: game.player.x,
      y: game.player.y,
      w: PLAYER_W,
      h: PLAYER_H,
    };

    // Obstacles
    for (const ob of game.obstacles) {
      if (ob.hit) continue;
      const screenX = ob.x - game.worldX;
      if (screenX < -200 || screenX > CANVAS_W + 200) continue;
      const obRect = { x: screenX, y: ob.y, w: ob.w, h: ob.h };
      if (rectsOverlap(playerRect, obRect) && game.player.iFrames === 0) {
        ob.hit = true;

        // Invincibility (star-spangled) absorbs damage entirely
        if (hasActivePowerUp("star")) {
          spawnParticles(game.player.x + PLAYER_W / 2, game.player.y + PLAYER_H / 2, "collect");
          continue;
        }

        // Spare-tire shield absorbs one hit, then breaks
        if (game.shield) {
          game.shield = false;
          spawnParticles(game.player.x + PLAYER_W / 2, game.player.y + PLAYER_H / 2, "hit");
          game.player.iFrames = 30;
          spawnPickupLabel("camera", 0, game.player.x + PLAYER_W / 2, game.player.y - 12);
          continue;
        }

        game.health -= DIFFICULTIES[game.difficulty].damage;
        game.player.iFrames = 60;
        sfxHit();
        game.shake = { frames: 18, intensity: 7 };
        spawnParticles(game.player.x + PLAYER_W / 2, game.player.y + PLAYER_H / 2, "hit");

        // Hits break the combo streak
        if (game.combo.count > 0) {
          game.combo.count = 0;
          game.combo.multiplier = 1;
        }

        if (game.health <= 0) {
          game.health = 0;
          updateHud();
          endGame(false);
          return;
        }
      }
    }

    // Collectibles
    for (const co of game.collectibles) {
      if (co.collected) continue;
      const screenX = co.x - game.worldX;
      if (screenX < -200 || screenX > CANVAS_W + 200) continue;
      const coRect = { x: screenX, y: co.y, w: co.w, h: co.h };
      if (rectsOverlap(playerRect, coRect)) {
        co.collected = true;
        // Combo: bump streak, recalc multiplier, ding if we crossed a tier
        const prevMult = game.combo.multiplier;
        game.combo.count++;
        game.combo.multiplier = comboMultiplierFor(game.combo.count);
        if (game.combo.multiplier > prevMult) {
          sfxCombo(game.combo.multiplier);
        }
        const earned = co.points * game.combo.multiplier;
        game.score += earned;
        sfxCollect();
        spawnParticles(screenX + co.w / 2, co.y + co.h / 2, "collect");
        spawnPickupLabel(co.type, earned, screenX + co.w / 2, co.y);
      }
    }

    // Power-up pickups
    for (const pu of game.powerUps) {
      if (pu.collected) continue;
      const screenX = pu.x - game.worldX;
      if (screenX < -200 || screenX > CANVAS_W + 200) continue;
      const puRect = { x: screenX, y: pu.y, w: pu.w, h: pu.h };
      if (rectsOverlap(playerRect, puRect)) {
        pu.collected = true;
        applyPowerUp(pu.type);
        spawnParticles(screenX + pu.w / 2, pu.y + pu.h / 2, "collect");
      }
    }

    // Tick pickup labels — drop expired ones
    for (let i = game.pickupLabels.length - 1; i >= 0; i--) {
      if (--game.pickupLabels[i].ttl <= 0) game.pickupLabels.splice(i, 1);
    }

    updateHud();

    // Win / level-advance condition
    if (game.worldX >= WORLD_LENGTH) {
      if (game.level === 1) {
        startLevel2();
      } else {
        endGame(true);
      }
    }
  }

  // ----- Power-up effects -----
  function hasActivePowerUp(type) {
    return game.activePowerUps.some((p) => p.type === type && p.framesLeft > 0);
  }

  function tickActivePowerUps() {
    for (let i = game.activePowerUps.length - 1; i >= 0; i--) {
      game.activePowerUps[i].framesLeft--;
      if (game.activePowerUps[i].framesLeft <= 0) {
        game.activePowerUps.splice(i, 1);
      }
    }
    if (game.honk.ttl > 0) game.honk.ttl--;
  }

  function applyPowerUp(type) {
    const def = POWERUP_DEFS[type];
    sfxPowerUp();
    spawnPickupLabel("camera", 0, game.player.x + PLAYER_W / 2, game.player.y - 20);
    // Use a tiny floating label that says the power-up name
    game.pickupLabels.push({
      base: `${def.emoji} ${def.label} `,
      pts: "",
      x: game.player.x + PLAYER_W / 2,
      y: game.player.y - 28,
      ttl: 120,
      maxTtl: 120,
    });

    switch (type) {
      case "gas":
        game.health = Math.min(MAX_HEALTH, game.health + 30);
        updateHud();
        return;
      case "tire":
        game.shield = true;
        return;
      default:
        // Replace any existing instance of same type so duration refreshes
        const idx = game.activePowerUps.findIndex((p) => p.type === type);
        if (idx >= 0) game.activePowerUps.splice(idx, 1);
        game.activePowerUps.push({
          type,
          framesLeft: def.duration,
          maxFrames: def.duration,
        });
        return;
    }
  }

  function honk() {
    if (!game.running) return;
    sfxHonk();
    game.honk.ttl = 28;
  }

  // ----- Particles -----
  function spawnParticles(x, y, kind) {
    const count = kind === "hit" ? 14 : 10;
    const colors = kind === "hit"
      ? ["#ff4444", "#ff7b00", "#ffcc00", "#fff"]
      : ["#ffd60a", "#fff", "#fffacd", "#ffd700", "#ffec8b"];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = kind === "hit" ? 2 + Math.random() * 3.5 : 1.5 + Math.random() * 3;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (kind === "collect" ? 1.5 : 0),
        life: 1,
        decay: kind === "hit" ? 0.045 + Math.random() * 0.03 : 0.055 + Math.random() * 0.03,
        r: kind === "hit" ? 3 + Math.random() * 3 : 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: kind === "collect" ? "star" : "circle",
      });
    }
  }

  function updateParticles() {
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // light gravity on particles
      p.life -= p.decay;
      if (p.life <= 0) game.particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.shape === "star") {
        ctx.translate(p.x, p.y);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const ia = a + Math.PI / 5;
          i === 0
            ? ctx.moveTo(Math.cos(a) * p.r, Math.sin(a) * p.r)
            : ctx.lineTo(Math.cos(a) * p.r, Math.sin(a) * p.r);
          ctx.lineTo(Math.cos(ia) * (p.r * 0.45), Math.sin(ia) * (p.r * 0.45));
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  // ----- Rendering -----
  function render() {
    ctx.save();
    if (game.shake.frames > 0) {
      const s = game.shake.intensity * (game.shake.frames / 18);
      ctx.translate(
        (Math.random() - 0.5) * 2 * s,
        (Math.random() - 0.5) * 2 * s
      );
    }

    if (game.level === 2) {
      renderCityBackground();
    } else {
      renderHighwayBackground();
    }

    // Billboards (scenery layer, drawn behind obstacles/collectibles)
    drawBillboards();

    // Obstacles
    for (const ob of game.obstacles) {
      if (ob.hit) continue;
      const sx = ob.x - game.worldX;
      if (sx < -80 || sx > CANVAS_W + 80) continue;
      drawObstacle(ob.type, sx, ob.y, ob.w, ob.h);
    }

    // Collectibles (with bob)
    for (const co of game.collectibles) {
      if (co.collected) continue;
      const sx = co.x - game.worldX;
      if (sx < -80 || sx > CANVAS_W + 80) continue;
      const bobY = co.y + Math.sin(game.frame * 0.07 + co.phase) * 5;
      drawCollectible(co.type, sx, bobY);
    }

    // Power-ups (with bob and a soft halo)
    for (const pu of game.powerUps) {
      if (pu.collected) continue;
      const sx = pu.x - game.worldX;
      if (sx < -80 || sx > CANVAS_W + 80) continue;
      const bobY = pu.y + Math.sin(game.frame * 0.07 + pu.phase) * 5;
      drawPowerUp(pu.type, sx, bobY);
    }

    // Star-spangled invincibility aura behind the car
    if (hasActivePowerUp("star")) {
      drawStarAura();
    }

    // Player
    drawPlayer();

    // Spare-tire shield indicator
    if (game.shield) drawShieldRing();

    // Honk speech bubble (briefly)
    if (game.honk.ttl > 0) drawHonkBubble();

    // Particles drawn on top of everything
    drawParticles();

    // Win-screen confetti (only after destination reached)
    drawConfetti();

    // Destination flag near the end
    const flagWorldX = WORLD_LENGTH - 80;
    const flagScreenX = flagWorldX - game.worldX;
    if (flagScreenX < CANVAS_W + 60) {
      drawFinishFlag(flagScreenX);
    }

    ctx.restore();

    // ===== Selfie snap point =====
    // The toDataURL must happen NOW — after the scene is drawn but before
    // any selfie overlay (polaroid frame, flash, text). That way the
    // captured photo is a clean shot of the road-trip moment.
    if (game.selfie.active && !game.selfie.snapped && game.selfie.frame >= SNAP_FRAME) {
      game.selfie.snapped = true;
      captureSelfie();
    }

    // Pickup labels render outside the screen-shake transform so the
    // floating "+points" text stays steady and legible even on hit.
    drawPickupLabels();

    // Polaroid frame + flash overlay during selfie (drawn LAST so it
    // sits on top of everything, including pickup labels).
    if (game.selfie.active) {
      drawSelfieOverlay();
    }
  }

  function drawPlayer() {
    const p = game.player;
    const blink = p.iFrames > 0 && Math.floor(p.iFrames / 6) % 2 === 0;
    if (blink) return;

    const x = p.x;
    const y = p.y;
    const w = PLAYER_W;
    const h = PLAYER_H;

    // Shadow on road (only when grounded)
    if (p.onGround) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, GROUND_Y + 6, w / 2 + 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Suitcase on roof rack (4th of July star)
    ctx.fillStyle = "#1b3a8a";
    ctx.fillRect(x + w / 2 - 12, y - 8, 24, 8);
    ctx.fillStyle = "#ffd60a";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", x + w / 2, y - 4);

    // Roof rack rails
    ctx.fillStyle = "#222";
    ctx.fillRect(x + 16, y - 1, w - 32, 2);

    // Cabin / roof (rounded trapezoid)
    ctx.fillStyle = "#d7263d";
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 14);
    ctx.lineTo(x + 22, y);
    ctx.lineTo(x + w - 22, y);
    ctx.lineTo(x + w - 14, y + 14);
    ctx.closePath();
    ctx.fill();

    // Windshield (front depends on facing)
    ctx.fillStyle = "#9fd6ff";
    if (p.facing === 1) {
      // front to the right
      ctx.beginPath();
      ctx.moveTo(x + w / 2 + 1, y + 2);
      ctx.lineTo(x + w - 24, y + 2);
      ctx.lineTo(x + w - 16, y + 14);
      ctx.lineTo(x + w / 2 + 1, y + 14);
      ctx.closePath();
      ctx.fill();
      // rear window
      ctx.fillStyle = "#7fb8e6";
      ctx.beginPath();
      ctx.moveTo(x + 24, y + 2);
      ctx.lineTo(x + w / 2 - 1, y + 2);
      ctx.lineTo(x + w / 2 - 1, y + 14);
      ctx.lineTo(x + 16, y + 14);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + 24, y + 2);
      ctx.lineTo(x + w / 2 - 1, y + 2);
      ctx.lineTo(x + w / 2 - 1, y + 14);
      ctx.lineTo(x + 16, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7fb8e6";
      ctx.beginPath();
      ctx.moveTo(x + w / 2 + 1, y + 2);
      ctx.lineTo(x + w - 24, y + 2);
      ctx.lineTo(x + w - 16, y + 14);
      ctx.lineTo(x + w / 2 + 1, y + 14);
      ctx.closePath();
      ctx.fill();
    }

    // Driver silhouette behind windshield (Asha — sunglasses + hair)
    const driverX = p.facing === 1 ? x + w - 28 : x + 20;
    ctx.fillStyle = "#3a2316"; // hair
    ctx.fillRect(driverX, y + 4, 10, 5);
    ctx.fillStyle = "#f4c69b"; // face
    ctx.fillRect(driverX + 1, y + 8, 8, 4);
    ctx.fillStyle = "#1b3a8a"; // sunglasses
    ctx.fillRect(driverX + 1, y + 9, 8, 2);

    // Lower body of car
    ctx.fillStyle = "#d7263d";
    ctx.fillRect(x + 4, y + 14, w - 8, 18);

    // White 4th-of-July stripe
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 4, y + 22, w - 8, 4);

    // Door line
    ctx.strokeStyle = "#8a0f23";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 14);
    ctx.lineTo(x + w / 2, y + 30);
    ctx.stroke();

    // Headlight (front) / taillight (rear)
    if (p.facing === 1) {
      ctx.fillStyle = "#ffd60a";
      ctx.fillRect(x + w - 6, y + 18, 4, 6);
      ctx.fillStyle = "#b00020";
      ctx.fillRect(x + 2, y + 18, 4, 6);
    } else {
      ctx.fillStyle = "#ffd60a";
      ctx.fillRect(x + 2, y + 18, 4, 6);
      ctx.fillStyle = "#b00020";
      ctx.fillRect(x + w - 6, y + 18, 4, 6);
    }

    // Wheel wells
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(x + 18, y + 34, 10, 0, Math.PI * 2);
    ctx.arc(x + w - 18, y + 34, 10, 0, Math.PI * 2);
    ctx.fill();

    // Wheels — rotate based on world position so they look like they're rolling
    const wheelAngle = (game.worldX / 14) * p.facing;
    drawWheel(x + 18, y + 34, 8, wheelAngle);
    drawWheel(x + w - 18, y + 34, 8, wheelAngle);
  }

  function drawWheel(cx, cy, r, angle) {
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Hubcap spokes
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = angle + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
      ctx.stroke();
    }
    ctx.fillStyle = "#bbb";
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawObstacle(type, x, y, w, h) {
    switch (type) {
      case "pothole":
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2 + 4, w / 2, h, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#444";
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2 + 2, w / 2 - 4, h - 3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "cone":
        ctx.fillStyle = "#ff7b00";
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(x + 4, y + h * 0.45, w - 8, 4);
        ctx.fillStyle = "#444";
        ctx.fillRect(x - 2, y + h - 4, w + 4, 4);
        break;
      case "roadblock":
        // Striped barrier
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#d7263d";
        for (let i = 0; i < w; i += 14) {
          ctx.fillRect(x + i, y, 7, h);
        }
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        break;
      case "fuel":
        // Low-fuel warning sign on a post
        ctx.fillStyle = "#8b5a2b";
        ctx.fillRect(x + w / 2 - 2, y + 24, 4, h - 24);
        ctx.fillStyle = "#ffd60a";
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + 24);
        ctx.lineTo(x + w / 2, y + 48);
        ctx.lineTo(x, y + 24);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#000";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⛽", x + w / 2, y + 30);
        break;

      // ----- City obstacles -----
      case "manhole":
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2 + 4, w / 2, h, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Grate lines
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(x + w / 2 + i * 10, y + 2);
          ctx.lineTo(x + w / 2 + i * 10, y + h + 4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 4, y + h / 2 + i * 4);
          ctx.lineTo(x + w - 4, y + h / 2 + i * 4);
          ctx.stroke();
        }
        break;

      case "taxi":
        // Taxi body
        ctx.fillStyle = "#f5c518";
        ctx.fillRect(x + 4, y + 14, w - 8, 18);
        // Roof/cabin
        ctx.fillStyle = "#e0b010";
        ctx.beginPath();
        ctx.moveTo(x + 14, y + 14);
        ctx.lineTo(x + 20, y);
        ctx.lineTo(x + w - 20, y);
        ctx.lineTo(x + w - 14, y + 14);
        ctx.closePath();
        ctx.fill();
        // Taxi sign on roof
        ctx.fillStyle = "#333";
        ctx.fillRect(x + w / 2 - 10, y - 8, 20, 7);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 6px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("TAXI", x + w / 2, y - 4);
        // Windows
        ctx.fillStyle = "#9fd6ff";
        ctx.fillRect(x + 22, y + 2, 14, 11);
        ctx.fillRect(x + w - 36, y + 2, 14, 11);
        // Wheels
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(x + 16, y + h - 2, 9, 0, Math.PI * 2);
        ctx.arc(x + w - 16, y + h - 2, 9, 0, Math.PI * 2);
        ctx.fill();
        // Lights
        ctx.fillStyle = "#ff4444";
        ctx.fillRect(x + 2, y + 18, 4, 5);
        ctx.fillStyle = "#ffd60a";
        ctx.fillRect(x + w - 6, y + 18, 4, 5);
        break;

      case "hydrant":
        // Base
        ctx.fillStyle = "#c00";
        ctx.fillRect(x + 2, y + h - 10, w - 4, 10);
        // Body
        ctx.fillStyle = "#e00";
        ctx.fillRect(x + 4, y + 10, w - 8, h - 18);
        // Top cap
        ctx.fillStyle = "#b00";
        ctx.fillRect(x + 6, y + 4, w - 12, 8);
        ctx.fillRect(x + 8, y, w - 16, 6);
        // Side nozzles
        ctx.fillStyle = "#900";
        ctx.fillRect(x - 2, y + 16, 6, 7);
        ctx.fillRect(x + w - 4, y + 16, 6, 7);
        break;

      case "barrier":
        // Orange jersey barrier
        ctx.fillStyle = "#ff6a00";
        ctx.beginPath();
        ctx.moveTo(x + 6, y);
        ctx.lineTo(x + w - 6, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
        // White stripes
        ctx.fillStyle = "#fff";
        for (let i = 0; i < w - 8; i += 18) {
          ctx.fillRect(x + 6 + i, y + 4, 8, h - 8);
        }
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        break;
    }
  }

  function drawCollectible(type, x, y) {
    // Soft glow background
    ctx.fillStyle = "rgba(255, 214, 10, 0.45)";
    ctx.beginPath();
    ctx.arc(x + 14, y + 14, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const emojis = game.level === 2
      ? { souvenir: "🗽", snack: "🌭", postcard: "🎭", camera: "📸" }
      : { souvenir: "🗽", snack: "🍿", postcard: "💌", camera: "📸" };
    ctx.fillText(emojis[type], x + 14, y + 16);
  }

  function drawPowerUp(type, x, y) {
    const def = POWERUP_DEFS[type];
    // Soft pulsing aura
    const pulse = 0.5 + Math.sin(game.frame * 0.15) * 0.15;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(x + 16, y + 16, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // White medallion behind
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + 16, y + 16, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Emoji icon
    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.emoji, x + 16, y + 18);
  }

  function drawStarAura() {
    const p = game.player;
    ctx.save();
    const pulse = 0.4 + Math.sin(game.frame * 0.25) * 0.2;
    ctx.globalAlpha = pulse;
    const grad = ctx.createRadialGradient(
      p.x + PLAYER_W / 2, p.y + PLAYER_H / 2, 8,
      p.x + PLAYER_W / 2, p.y + PLAYER_H / 2, 70
    );
    grad.addColorStop(0, "#ffd60a");
    grad.addColorStop(0.5, "rgba(255, 80, 80, 0.6)");
    grad.addColorStop(1, "rgba(27, 58, 138, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x + PLAYER_W / 2, p.y + PLAYER_H / 2, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Random sparkles
    if (Math.random() < 0.5) {
      game.particles.push({
        x: p.x + Math.random() * PLAYER_W,
        y: p.y + Math.random() * PLAYER_H,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -1 - Math.random() * 1.5,
        life: 1, decay: 0.07,
        r: 2 + Math.random() * 2,
        color: ["#ffd60a", "#fff", "#ff7b7b"][Math.floor(Math.random() * 3)],
        shape: "star",
      });
    }
  }

  function drawShieldRing() {
    const p = game.player;
    ctx.save();
    ctx.globalAlpha = 0.45 + Math.sin(game.frame * 0.2) * 0.15;
    ctx.strokeStyle = "#9fd6ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x + PLAYER_W / 2, p.y + PLAYER_H / 2, PLAYER_W / 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHonkBubble() {
    const p = game.player;
    const x = p.x + PLAYER_W + 4;
    const y = p.y - 20;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 50, y);
    ctx.lineTo(x + 50, y + 22);
    ctx.lineTo(x + 14, y + 22);
    ctx.lineTo(x + 8, y + 30);
    ctx.lineTo(x + 10, y + 22);
    ctx.lineTo(x, y + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#222";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("HONK!", x + 25, y + 11);
  }

  function spawnWinConfetti() {
    const colors = ["#d7263d", "#fff", "#1b3a8a", "#ffd60a", "#ff7b00"];
    for (let i = 0; i < 90; i++) {
      game.confetti.push({
        x: Math.random() * CANVAS_W,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 3,
        vy: 1 + Math.random() * 3,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 5,
        h: 3 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1, decay: 0.005,
      });
    }
  }

  function drawConfetti() {
    if (game.confetti.length === 0) return;
    for (let i = game.confetti.length - 1; i >= 0; i--) {
      const c = game.confetti[i];
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.07;
      c.rot += c.spin;
      c.life -= c.decay;
      if (c.life <= 0 || c.y > CANVAS_H + 20) {
        game.confetti.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  }

  function drawBillboards() {
    for (const b of game.billboards) {
      const sx = b.x - game.worldX;
      if (sx < -180 || sx > CANVAS_W + 40) continue;
      const w = 140;
      const h = 80;
      const baseY = GROUND_Y - 130;
      // Twin posts
      ctx.fillStyle = "#5a3a1f";
      ctx.fillRect(sx + 14, baseY + h, 6, 50);
      ctx.fillRect(sx + w - 20, baseY + h, 6, 50);
      // Sign backdrop
      ctx.fillStyle = b.bg;
      ctx.fillRect(sx, baseY, w, h);
      // Frame
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.strokeRect(sx, baseY, w, h);
      // Decorative star in corner
      ctx.fillStyle = b.fg;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("★", sx + 6, baseY + 4);
      // Text
      ctx.fillStyle = b.fg;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.l1, sx + w / 2, baseY + 28);
      ctx.font = "12px sans-serif";
      ctx.fillText(b.l2, sx + w / 2, baseY + 52);
    }
  }

  function drawSelfieOverlay() {
    const f = game.selfie.frame;
    const total = SELFIE_TOTAL_FRAMES;

    // 1) Vignette + polaroid frame around the canvas
    // Ease-in for the first 12 frames, hold, ease-out for the last 12
    const inAlpha  = Math.min(1, f / 12);
    const outAlpha = Math.min(1, (total - f) / 12);
    const alpha = Math.min(inAlpha, outAlpha);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Polaroid border (thick white edges, extra-thick at the bottom)
    const top = 18, side = 18, bottom = 56;
    ctx.fillStyle = "#fefefe";
    ctx.fillRect(0, 0, CANVAS_W, top);
    ctx.fillRect(0, CANVAS_H - bottom, CANVAS_W, bottom);
    ctx.fillRect(0, 0, side, CANVAS_H);
    ctx.fillRect(CANVAS_W - side, 0, side, CANVAS_H);

    // Tape strips at the corners for charm
    ctx.fillStyle = "rgba(255, 214, 10, 0.75)";
    ctx.fillRect(8, 4, 60, 12);
    ctx.fillRect(CANVAS_W - 68, 4, 60, 12);

    // Polaroid caption (handwritten-feel)
    ctx.fillStyle = "#222";
    ctx.font = "italic bold 20px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      game.selfie.snapped
        ? `📸 Road Trip Memory!`
        : `📸 Smile, Asha!`,
      CANVAS_W / 2,
      CANVAS_H - bottom / 2
    );
    ctx.restore();

    // 2) Quick white flash AT the snap frame (3-frame window)
    if (f >= SNAP_FRAME && f <= SNAP_FRAME + 3) {
      const flashAlpha = 1 - (f - SNAP_FRAME) / 4;
      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.85;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }
  }

  function drawRoadsideSign(worldX, label) {
    const sx = worldX - game.worldX;
    if (sx < -200 || sx > CANVAS_W + 80) return;
    // Post
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(sx + 26, GROUND_Y - 30, 6, 30);
    // Sign
    ctx.fillStyle = "#1b3a8a";
    ctx.fillRect(sx, GROUND_Y - 80, 60, 40);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, GROUND_Y - 80, 60, 40);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, sx + 30, GROUND_Y - 60);
  }

  function drawPickupLabels() {
    if (game.pickupLabels.length === 0) return;
    ctx.save();
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";

    for (const lbl of game.pickupLabels) {
      const t = 1 - lbl.ttl / lbl.maxTtl;       // 0 → 1 over lifetime
      const dy = -30 * t;
      // Hold at full opacity for the first ~65% of life, then fade out.
      ctx.globalAlpha = Math.max(0, Math.min(1, (1 - t) / 0.35));

      const baseW = ctx.measureText(lbl.base).width;
      const ptsW = ctx.measureText(lbl.pts).width;
      const startX = lbl.x - (baseW + ptsW) / 2;
      const baseCenter = startX + baseW / 2;
      const ptsCenter = startX + baseW + ptsW / 2;
      const y = lbl.y + dy;

      ctx.fillStyle = "#fff";
      ctx.strokeText(lbl.base, baseCenter, y);
      ctx.fillText(lbl.base, baseCenter, y);

      ctx.fillStyle = "#ffd60a";
      ctx.strokeText(lbl.pts, ptsCenter, y);
      ctx.fillText(lbl.pts, ptsCenter, y);
    }

    ctx.restore();
  }

  function drawFinishFlag(x) {
    // Pole
    ctx.fillStyle = "#222";
    ctx.fillRect(x, GROUND_Y - 110, 4, 110);
    // Checkered flag
    const flagW = 60;
    const flagH = 36;
    const cell = 6;
    for (let r = 0; r < flagH / cell; r++) {
      for (let c = 0; c < flagW / cell; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#000" : "#fff";
        ctx.fillRect(x + 4 + c * cell, GROUND_Y - 110 + r * cell, cell, cell);
      }
    }
    // "FINISH" label
    ctx.fillStyle = "#d7263d";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("FINISH", x + 4, GROUND_Y - 116);
  }

  // ----- HUD -----
  function updateHud() {
    els.healthFill.style.width = `${(game.health / MAX_HEALTH) * 100}%`;
    els.distanceFill.style.width = `${Math.min(100, (game.worldX / WORLD_LENGTH) * 100)}%`;
    els.score.textContent = game.score;
    els.levelDisplay.textContent = game.level;
    if (els.selfiesLeft) els.selfiesLeft.textContent = game.selfiesLeft;
    updateComboBadge();
    updateActivePowerUpsHud();
  }

  function updateComboBadge() {
    if (!els.comboBadge) return;
    if (game.combo.multiplier > 1) {
      els.comboBadge.textContent = `×${game.combo.multiplier}  (${game.combo.count})`;
      els.comboBadge.classList.remove("hidden");
      els.comboBadge.dataset.tier = game.combo.multiplier;
    } else {
      els.comboBadge.classList.add("hidden");
    }
  }

  function updateActivePowerUpsHud() {
    if (!els.activePowerups) return;
    els.activePowerups.innerHTML = "";
    if (game.shield) {
      const pill = document.createElement("span");
      pill.className = "pu-pill pu-shield";
      pill.textContent = `🛞 Shield`;
      els.activePowerups.appendChild(pill);
    }
    for (const p of game.activePowerUps) {
      const def = POWERUP_DEFS[p.type];
      const pct = Math.max(0, (p.framesLeft / p.maxFrames) * 100);
      const pill = document.createElement("span");
      pill.className = "pu-pill";
      pill.innerHTML = `<span class="pu-icon">${def.emoji}</span>` +
                       `<span class="pu-bar"><span style="width:${pct}%"></span></span>`;
      pill.title = def.label;
      els.activePowerups.appendChild(pill);
    }
  }

  // ----- High Scores -----
  function loadHighScores() {
    try {
      const raw = localStorage.getItem(HIGH_SCORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((e) => typeof e.score === "number" && typeof e.initials === "string")
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_HIGH_SCORES);
    } catch {
      return [];
    }
  }

  function saveHighScores(list) {
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(list));
  }

  function scoreQualifies(score) {
    if (score <= 0) return false;
    const scores = loadHighScores();
    if (scores.length < MAX_HIGH_SCORES) return true;
    return score > scores[scores.length - 1].score;
  }

  function addHighScore(initials, score) {
    const scores = loadHighScores();
    scores.push({ initials: initials.toUpperCase().slice(0, 3).padEnd(3, "_"), score });
    scores.sort((a, b) => b.score - a.score);
    saveHighScores(scores.slice(0, MAX_HIGH_SCORES));
  }

  function renderHighScores() {
    const scores = loadHighScores();
    els.scoresList.innerHTML = "";
    if (scores.length === 0) {
      els.noScores.classList.remove("hidden");
      return;
    }
    els.noScores.classList.add("hidden");
    for (const entry of scores) {
      const li = document.createElement("li");
      const ini = document.createElement("span");
      ini.className = "initials";
      ini.textContent = entry.initials;
      const pts = document.createElement("span");
      pts.className = "points";
      pts.textContent = entry.score;
      li.appendChild(ini);
      li.appendChild(pts);
      els.scoresList.appendChild(li);
    }
  }

  // ----- Initials input wiring -----
  function setupInitialsInputs() {
    const inputs = document.querySelectorAll(".initial");
    inputs.forEach((input, idx) => {
      input.addEventListener("input", () => {
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (input.value && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !input.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      });
    });
  }

  // ----- Input -----
  window.addEventListener("keydown", (e) => {
    // Block page scroll on space/arrows during gameplay
    if (screens.game.classList.contains("active")) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    }
    if (e.key === "p" || e.key === "P") {
      if (game.running) togglePause();
      return;
    }
    if (e.key === "c" || e.key === "C") {
      tryStartSelfie();
      return;
    }
    if (e.key === "h" || e.key === "H") {
      honk();
      return;
    }
    game.keys[e.key] = true;
  });
  window.addEventListener("keyup", (e) => {
    game.keys[e.key] = false;
  });

  function togglePause() {
    game.paused = !game.paused;
    if (!game.paused) game.lastTimestamp = null; // reset so paused time isn't counted
    els.pauseOverlay.classList.toggle("hidden", !game.paused);
  }

  // ----- Button wiring -----
  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-view-scores").addEventListener("click", () => {
    renderHighScores();
    showScreen("scores");
  });
  document.getElementById("btn-back-title").addEventListener("click", () => showScreen("title"));
  document.getElementById("btn-reset-scores").addEventListener("click", () => {
    if (confirm("Reset all high scores? This cannot be undone.")) {
      localStorage.removeItem(HIGH_SCORE_KEY);
      renderHighScores();
    }
  });
  document.getElementById("btn-pause").addEventListener("click", togglePause);
  document.getElementById("btn-resume").addEventListener("click", togglePause);
  document.getElementById("btn-quit").addEventListener("click", () => {
    game.running = false;
    game.paused = false;
    cancelAnimationFrame(game.rafId);
    els.pauseOverlay.classList.add("hidden");
    showScreen("title");
  });
  document.getElementById("btn-play-again").addEventListener("click", startGame);
  document.getElementById("btn-go-title").addEventListener("click", () => {
    els.gameoverOverlay.classList.add("hidden");
    showScreen("title");
  });
  document.getElementById("btn-save-score").addEventListener("click", () => {
    const inputs = document.querySelectorAll(".initial");
    let initials = "";
    inputs.forEach((i) => (initials += i.value || "_"));
    initials = initials.slice(0, 3).toUpperCase();
    addHighScore(initials, game.score);
    els.initialsSection.classList.add("hidden");
    renderHighScores();
    showScreen("scores");
    els.gameoverOverlay.classList.add("hidden");
  });

  // ----- Scrapbook screen wiring -----
  document.getElementById("btn-view-scrapbook").addEventListener("click", () => {
    renderScrapbook();
    showScreen("scrapbook");
  });
  document.getElementById("btn-back-from-scrapbook").addEventListener("click", () => {
    showScreen("title");
  });
  document.getElementById("btn-reset-scrapbook").addEventListener("click", () => {
    if (confirm("Clear the scrapbook? All saved selfies will be deleted.")) {
      localStorage.removeItem(SCRAPBOOK_KEY);
      renderScrapbook();
    }
  });
  document.getElementById("btn-view-scrapbook-from-gameover").addEventListener("click", () => {
    els.gameoverOverlay.classList.add("hidden");
    renderScrapbook();
    showScreen("scrapbook");
  });

  // ----- Difficulty selector wiring -----
  function refreshDifficultyButtons() {
    const current = loadDifficulty();
    for (const btn of els.difficultyButtons()) {
      const key = btn.dataset.difficulty;
      btn.classList.toggle("selected", key === current);
    }
  }
  for (const btn of els.difficultyButtons()) {
    btn.addEventListener("click", () => {
      saveDifficulty(btn.dataset.difficulty);
      refreshDifficultyButtons();
    });
  }
  refreshDifficultyButtons();

  // ----- Bootstrap -----
  setupInitialsInputs();
  showScreen("title");
})();
