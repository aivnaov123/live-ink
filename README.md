# Live Ink – prototype v0.1

Ball rolls on its own. Draw paths ahead of it. Lines fade after 3 s.

## Run
    npm install
    npm run dev          # open the URL on your PC, or the Network URL on your phone (same Wi-Fi)

## Build
    npm run build        # dist/ -> zip this for CrazyGames
    npm run build:single # dist-single/index.html, one file

## Where to tweak the feel
- src/systems/InkSystem.ts      INK_MAX, INK_REGEN, SOLID_MS, LIFE_MS, THICK
- src/systems/BallController.ts BASE_SPEED, MAX_TARGET, ACCEL
- src/systems/LevelGenerator.ts gap / width / height formulas in spawn()
- src/main.ts                   gravity
