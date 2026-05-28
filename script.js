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
  const GRAVITY = 0.55;
  const JUMP_VELOCITY = -11.5;     // car "hop" over potholes
  const MOVE_SPEED = 3.6;
  const WORLD_LENGTH = 7200;       // pixels to reach destination
  const MAX_HEALTH = 100;
  const OBSTACLE_DAMAGE = 18;
  const HIGH_SCORE_KEY = "roadTripRush.highScores.v1";
  const MAX_HIGH_SCORES = 5;

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
    obstacles: [],
    collectibles: [],
    clouds: [],
    mountains: [],
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
    game.health = MAX_HEALTH;
    game.score = 0;
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

  function endGame(reachedDestination) {
    game.running = false;
    cancelAnimationFrame(game.rafId);

    // Bonus for reaching destination with health remaining
    if (reachedDestination) {
      game.score += Math.round(game.health * 5);
    }

    els.gameoverTitle.textContent = reachedDestination
      ? "You Made It! 🎉"
      : "Out of Gas!";
    els.gameoverMessage.textContent = reachedDestination
      ? "Asha rolled into the vacation spot before sunset. Happy 4th!"
      : "Asha's road trip ended early. Better luck next weekend!";
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
  function loop() {
    if (!game.running) return;
    if (!game.paused) {
      update();
      render();
    }
    game.rafId = requestAnimationFrame(loop);
  }

  function update() {
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
      }
    }

    updateHud();

    // Win condition
    if (game.worldX >= WORLD_LENGTH) {
      endGame(true);
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
    // Sky already painted via CSS background — but canvas needs its own.
    // Clear and draw sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, "#87ceeb");
    sky.addColorStop(0.7, "#b9e3f7");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Sun (sinking as you approach destination)
    const progress = game.worldX / WORLD_LENGTH;
    const sunX = CANVAS_W - 110;
    const sunY = 70 + progress * 160; // sinks
    const sunColor = progress < 0.75 ? "#ffd60a" : "#ff7b00";
    ctx.fillStyle = sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
    // Sun rays
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
      // snow cap
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

    // Beach sign (decorative, mid-trip)
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

    // Obstacles
    for (const ob of game.obstacles) {
      if (ob.hit) continue;
      const sx = ob.x - game.worldX;
      if (sx < -80 || sx > CANVAS_W + 80) continue;
      drawObstacle(ob.type, sx, ob.y, ob.w, ob.h);
    }

    // Collectibles
    for (const co of game.collectibles) {
      if (co.collected) continue;
      const sx = co.x - game.worldX;
      if (sx < -80 || sx > CANVAS_W + 80) continue;
      drawCollectible(co.type, sx, co.y);
    }

    // Player
    drawPlayer();

    // Destination flag near the end
    const flagWorldX = WORLD_LENGTH - 80;
    const flagScreenX = flagWorldX - game.worldX;
    if (flagScreenX < CANVAS_W + 60) {
      drawFinishFlag(flagScreenX);
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
    const emojis = {
      souvenir: "🗽",
      snack: "🍿",
      postcard: "💌",
      camera: "📸",
    };
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
