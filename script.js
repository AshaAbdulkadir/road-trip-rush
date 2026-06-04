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

  // ----- DOM -----
  const screens = {
    title: document.getElementById("title-screen"),
    game: document.getElementById("game-screen"),
    scores: document.getElementById("scores-screen"),
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
    keys: {},
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
    const obstacleTypes = ["pothole", "cone", "roadblock", "fuel"];
    let x = 600;
    while (x < WORLD_LENGTH - 400) {
      const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
      game.obstacles.push(makeObstacle(type, x));
      x += 220 + Math.floor(Math.random() * 220);
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
    let x = 500;
    while (x < WORLD_LENGTH - 400) {
      const type = cityObstacleTypes[Math.floor(Math.random() * cityObstacleTypes.length)];
      game.obstacles.push(makeCityObstacle(type, x));
      x += 180 + Math.floor(Math.random() * 200);
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
    game.timeLeft = COUNTDOWN_SECONDS;
    game.lastTimestamp = null;
    game.frame = 0;
    game.shake = { frames: 0, intensity: 0 };
    game.particles = [];
    game.transition = { active: false, frames: 0 };
    game.buildings = [];
    game.streetlights = [];
    game.stars = [];
    game.paused = false;
    game.running = true;

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
      tickTimer(timestamp);
      update();
      render();
    }
    game.rafId = requestAnimationFrame(loop);
  }

  function tickTimer(timestamp) {
    if (game.lastTimestamp === null) {
      game.lastTimestamp = timestamp;
      return;
    }
    const delta = (timestamp - game.lastTimestamp) / 1000;
    game.lastTimestamp = timestamp;

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

    // Horizontal movement — world scrolls when moving right past anchor
    const leftDown = game.keys["ArrowLeft"] || game.keys["a"] || game.keys["A"];
    const rightDown = game.keys["ArrowRight"] || game.keys["d"] || game.keys["D"];

    if (rightDown) {
      game.worldX += MOVE_SPEED;
      game.player.facing = 1;
    }
    if (leftDown) {
      game.worldX = Math.max(0, game.worldX - MOVE_SPEED * 0.85);
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
        game.health -= OBSTACLE_DAMAGE;
        game.player.iFrames = 60;
        sfxHit();
        game.shake = { frames: 18, intensity: 7 };
        spawnParticles(game.player.x + PLAYER_W / 2, game.player.y + PLAYER_H / 2, "hit");
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
        game.score += co.points;
        sfxCollect();
        spawnParticles(screenX + co.w / 2, co.y + co.h / 2, "collect");
      }
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

    // Player
    drawPlayer();

    // Particles drawn on top of everything
    drawParticles();

    // Destination flag near the end
    const flagWorldX = WORLD_LENGTH - 80;
    const flagScreenX = flagWorldX - game.worldX;
    if (flagScreenX < CANVAS_W + 60) {
      drawFinishFlag(flagScreenX);
    }

    ctx.restore();
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

  // ----- Bootstrap -----
  setupInitialsInputs();
  showScreen("title");
})();
