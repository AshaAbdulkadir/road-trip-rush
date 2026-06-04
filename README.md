# Road Trip Rush

A single-player, 2D side-scrolling browser game with an American 4th of July
weekend vacation theme. You drive Asha's red road-trip car down the highway
toward the vacation destination. Built with vanilla HTML, CSS, and
JavaScript — no build step, no internet required, no cloud storage.

## Game Description

Meet **Asha TC²**, a hardworking student and tech professional who has been
grinding through certifications, sprints, and on-call shifts. The 4th of July
weekend has finally arrived, and she hits the open American highway for a
much-needed road trip.

Your job: drive Asha's car and **reach the vacation destination before
sunset**. Along the way, scoop up souvenirs, snacks, postcards, and
cameras for points — and steer or hop over potholes, traffic cones,
roadblocks, and low-fuel hazards that drain the car's health.

The vehicle is a cheerful red hatchback with a star-spangled suitcase on
the roof rack, headlights, taillights, a white 4th-of-July stripe, and
wheels that spin as you drive.

## Controls

| Key                                 | Action          |
| ----------------------------------- | --------------- |
| `←` or `A`                          | Reverse / drive left   |
| `→` or `D`                          | Drive right            |
| `↑`, `W`, or `Space`                | Hop over obstacles     |
| `C`                                 | 📸 Take a selfie       |
| `H`                                 | 🔊 Honk                |
| `P`                                 | Pause / Resume         |

## Features

- **Three screens:** Title, Gameplay, and High Scores
- **Side-scrolling world** with parallax mountains, clouds, and a sinking sun
  that tracks your progress toward sunset
- **Player moves:** left, right, jump (with gravity & ground collision)
- **Health system:** start at 100, lose 18 per obstacle hit (brief
  invulnerability after each hit)
- **Score system:** different collectibles award different point values
  - 🗽 Souvenir — 50 pts
  - 🍿 Snack — 20 pts
  - 💌 Postcard — 35 pts
  - 📸 Camera — 75 pts
- **Obstacles:** potholes, traffic cones, striped roadblocks, low-fuel signs
- **Roadside landmarks:** beach sign, diner sign, parade sign — and a
  checkered finish flag at the destination
- **Endgame conditions:**
  - Health reaches 0 → "Out of Gas!"
  - Player reaches the destination → "You Made It!" with a health bonus
    (remaining HP × 5)
- **High scores** persisted in `localStorage` (top 5)
- **Editable three-character initials** prompt when you qualify
- **Reset high scores** button on the High Scores screen
- **Pause overlay** with Resume / Quit-to-Title

## How to Run Locally

This is a static site — no build step required.

**Option 1: Open the file directly**

```bash
open index.html
```

**Option 2: Serve it (recommended, avoids any browser file:// quirks)**

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server will work (`npx serve`, VS Code Live Server, etc.).

## Files

```
road-trip-rush/
├── index.html      # Three screens: title, game, high scores
├── style.css       # 4th of July themed styling
├── script.js       # Game loop, physics, collisions, persistence
└── README.md       # This file
```

## Selfie Mode & Scrapbook

Press `C` mid-game to take a selfie. The world freezes for ~0.8s while a
polaroid frame swings over the canvas, a shutter clicks, and a quick
flash captures the scene. **3 selfies per run**, shown in the HUD as
`📸 ×3`.

**Bonus scoring** is awarded for whatever's visible in the photo:

| In frame                         | Points each |
| -------------------------------- | ----------- |
| Uncollected collectible (🗽🍿💌📸) | +10 |
| Surviving obstacle (⚠)            | +5  |
| Roadside sign (🪧)                | +25 |
| Billboard (📋)                    | +30 |
| Finish flag (🏁)                  | +75 |

Variety multiplier: capture **3+ distinct things** → ×1.5, **5+** → ×2.

Photos are saved to a **persistent scrapbook** (4th screen, accessible
from the title and game-over screens) — newest first, capped at 15
photos. Each polaroid card shows the photo, the bonus earned, the level,
the captured items, and the date. There's a **Clear Scrapbook** button
on the scrapbook screen.

Storage: ~70 KB per JPEG × 15 = ~1 MB of localStorage.

## Difficulty modes

Pick on the title screen — your choice is remembered for next time.

| Mode             | Timer | Damage per hit | Obstacle density | Scroll |
| ---------------- | ----- | -------------- | ---------------- | ------ |
| 🌴 Easy           | 80s   | 12             | sparser          | 0.9×   |
| 🚗 Road-Trip     | 60s   | 18             | normal           | 1.0×   |
| 🌅 Sunset Sprint | 45s   | 24             | denser           | 1.1×   |

## Combos and Power-ups

**Combo multiplier.** Each collectible pickup bumps the streak counter
shown in the HUD. Streak ≥3 → ×2 scoring, ≥7 → ×3. Hitting an obstacle
breaks the streak. A bright ding plays whenever you cross a tier.

**Power-ups** spawn along the road every 1200–1800 px. Pick them up by
driving (or hopping) through them. Active effects show as pills below
the HUD with shrinking timer bars.

| Power-up        | Effect                           | Duration |
| --------------- | -------------------------------- | -------- |
| ☕ Coffee        | +35% scroll speed                | 5s       |
| 🗺️ GPS           | Timer drains at half speed       | 4s       |
| 🛞 Spare Tire   | Absorbs the next obstacle hit    | until used |
| 🎆 Star-Spangled | Full invincibility + sparkle aura | 3s       |
| ⛽ Gas Can       | Instant +30 HP                   | instant  |

## Honk

Press `H` for a quick two-tone car honk and a "HONK!" speech bubble.
Pure charm, no gameplay effect.

## Confetti finish

Cross the finish flag at full health and a red/white/blue confetti
explosion rains down across the screen.

## Requirements Coverage

| Requirement                                                                 | Where it lives                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Single-player, 2D side-scrolling                                            | `script.js` — world-scrolling render loop                   |
| American Weekend Vacation theme (4th of July)                               | Red/white/blue UI, highway, sunshine, sunset, parade sign   |
| Protagonist with backstory & motivation                                     | Asha TC² intro on title screen                              |
| Moves & actions (jump, left, right)                                         | `update()` input handling                                   |
| Scoring system                                                              | Collectibles award points; health bonus on win              |
| Health system                                                               | `game.health`, HUD bar, damage on obstacle hit              |
| Way to lose points/health                                                   | Obstacle collisions deduct health                           |
| Endgame condition                                                           | Health = 0 OR distance reached                              |
| At least one level                                                          | Full procedurally-laid road from start to FINISH flag       |
| Title / Gameplay / High Scores / Scrapbook screens                          | `#title-screen`, `#game-screen`, `#scores-screen`, `#scrapbook-screen` |
| Selfie / camera build phase                                                 | Press `C` → polaroid snap → saved to scrapbook (4th screen) |
| Editable 3-character initials for high scores                               | `.initial` inputs in `#initials-section`                    |
| Persistent high scores via localStorage                                     | `loadHighScores` / `saveHighScores` in `script.js`          |
| No cloud / no internet required                                             | All assets generated via Canvas + CSS + emoji               |
| Reset high scores button                                                    | `#btn-reset-scores` on High Scores screen                   |
| HTML + CSS + JavaScript                                                     | `index.html`, `style.css`, `script.js`                      |

Happy 4th, and safe travels!
