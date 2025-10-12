# Heart Tiles

A strategic tile-based card game where players place colored hearts on tiles to score points. Built with Next.js 15, React 19, Socket.IO, and MongoDB for real-time multiplayer gameplay.

Inspired by Kitty Card Game from Love and Deepspace

## Status

[![Vitest Tests](https://github.com/sakan811/HeartTiles/actions/workflows/web-app-test.yml/badge.svg)](https://github.com/sakan811/HeartTiles/actions/workflows/web-app-test.yml)
## Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- MongoDB (local or cloud)

### Setup
```bash
# Clone and install dependencies
git clone https://github.com/sakan811/HeartTiles.git
cd HeartTiles
pnpm install

# Start MongoDB (for development)
pnpm docker:start

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI and auth secrets

# Start development server
pnpm dev
```

Visit http://localhost:3000 to start playing!

## Game Mechanics

### Room System

Rooms are the heart of multiplayer gameplay, created automatically when players join. Each room gets a unique 6-character code using letters and numbers, making it easy to share with friends. Games are limited to exactly 2 players to keep matches strategic and engaging. When a game ends and players leave, the room cleans itself up automatically to keep the system tidy.

### How to Play

Heart Tiles is a strategic card game where players compete for the highest score by placing colored hearts on matching tiles. The game combines thoughtful planning with tactical magic card usage to create engaging gameplay sessions.

**Starting the Game**: Each player receives 3 heart cards and 2 magic cards to begin. A random player gets the first turn, and then players alternate throughout the match. The game features two decks of 16 cards each—one for hearts and one for magic cards—that players draw from during their turns.

**Winning**: The player with the most points wins! The game ends when either all 8 tiles are filled with hearts or when both card decks run out. If the decks run empty, the current player can finish their turn before the game concludes.

### Taking Your Turn

During your turn, you'll follow a simple but strategic sequence:

1. **Draw Cards**: You must draw 1 heart card and 1 magic card (if available)
2. **Place Hearts**: You can place as many heart cards as you want on empty tiles
3. **Use Magic Cards**: Activate special abilities with your magic cards
4. **End Turn**: Pass control to your opponent

You can end your turn at any time, but make sure you've drawn both cards first (if the decks still have cards available).

### Scoring Points

Hearts come in three colors (red ❤️, yellow 💛, and green 💚) with point values from 1-3. Scoring depends on matching colors between your heart and the tile:

- **White Tiles ⬜**: Place any heart here and earn its face value points
- **Color Match**: Place a matching color heart (like red ❤️ on red 🟥) and earn double points
- **Color Mismatch**: Place a different color heart (like red ❤️ on yellow 🟨) and earn no points

This simple scoring system creates interesting decisions about when to play for maximum points versus when to hold cards for better opportunities.

### Heart Placement Rules

When placing hearts, remember these important rules:

- Hearts can only go on empty tiles (no sharing!)
- You can place multiple hearts during your turn
- Each heart card can only be used once
- You can only place hearts during your own turn

### Magic Cards

Magic cards add exciting strategic depth to the game. Each type has unique effects that can turn the tide of battle:

#### Wind 💨 - The Removal Card

Wind cards let you remove an opponent's heart from any tile, creating openings for your own strategic plays. This powerful card can only target tiles where your opponent has placed hearts, not empty tiles.

**Important Rule**: When Wind removes a heart, the tile returns to its original color. This means if someone places a red heart on a yellow tile, removing that heart reveals the yellow tile again—not a red one.

#### Recycle ♻️ - The Color Changer

Recycle cards transform any colored tile (red 🟥, yellow 🟨, or green 🟩) into a white tile ⬜. This is perfect for setting up easy scoring opportunities or disrupting your opponent's plans. Recycle can only target empty colored tiles, not tiles with hearts already on them.

#### Shield 🛡️ - The Protection Card

Shield cards provide powerful protection for 3 full turns, blocking your opponent's Wind and Recycle cards from affecting your tiles. Here's how shields work:

- **Duration**: Shields last exactly 3 turns (your turn, opponent's turn, your next turn)
- **Protection**: Blocks opponent's Wind and Recycle cards
- **Your Cards**: You can still place hearts and use your own Recycle cards while shielded
- **Visual Indicators**: Green shields show for you, red shields show for your opponent
- **Reinforcement**: You can "reinforce" your shield with another shield card to reset the 3-turn timer

**Shield Strategy**: Only one player can have an active shield at a time. If you have a shield, your opponent can't activate one until yours expires. This creates interesting timing decisions about when to play your shield card.

### Game Elements

**Tiles**: The game features 8 tiles that start with random colors (including white ⬜). Each tile displays colored emoji indicators and shows visual feedback when hearts are placed or shields are active.

**Visual Feedback**: The game provides clear visual cues:
- Green rings highlight your placed hearts
- Red rings show opponent's hearts
- Number badges display points earned on each heart
- Small indicators show original tile colors after hearts are placed
- Shield icons appear with turn counters when active

**Card Distribution**: The magic deck contains exactly 6 Wind cards, 5 Recycle cards, and 5 Shield cards, creating balanced strategic options throughout each game.

### Complete Game Flow

1. **Join & Authenticate**: Players sign in and create or join rooms using 6-character codes
2. **Get Ready**: Both players mark themselves ready to start the game
3. **Game Begins**: The system randomly selects who goes first and deals starting cards
4. **Strategic Play**: Players take turns drawing cards, placing hearts, and using magic cards
5. **Victory**: When all tiles fill or decks empty, the player with the most points wins!

The game's elegant balance of simple rules and strategic depth makes each match engaging and replayable. Whether you're playing defensively with shields or aggressively with Wind cards, every decision matters in the race for the highest score!

## Development

### Tech Stack
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js, Socket.IO, MongoDB, Mongoose
- **Auth**: NextAuth with MongoDB user storage
- **Testing**: Vitest with comprehensive test suite
- **Docker**: MongoDB development environment

### Commands
```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm test         # Run tests
pnpm lint         # Lint and fix code
pnpm docker:start # Start MongoDB
```

### Architecture
- **Server-first**: All game state lives on server
- **Real-time**: Socket.IO for multiplayer synchronization
- **Persistent**: MongoDB for rooms, users, and game data
- **Client-display**: UI only renders server state