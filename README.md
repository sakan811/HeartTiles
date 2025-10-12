# Heart Tiles

A strategic tile-based card game where players place colored hearts on tiles to score points. Built with Next.js 15, React 19, Socket.IO, and MongoDB for real-time multiplayer gameplay.

Inspired by Kitty Card Game from Love and Deepspace

## Status

[![Test CI](https://github.com/sakan811/no-kitty-cards-game/actions/workflows/ci.yml/badge.svg)](https://github.com/sakan811/no-kitty-cards-game/actions/workflows/ci.yml)

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

### Objective
Place colored hearts on tiles to score the most points. Match heart colors with tile colors for double points!

### Room System
- **6-character codes** for private rooms
- **2 players maximum** per room
- **Real-time multiplayer** with Socket.IO

### Core Gameplay
- **Start**: 3 heart cards + 2 magic cards each
- **Turns**: Draw cards, place hearts, use magic, end turn
- **Win**: Most points when tiles are filled or deck empty

### Scoring
- ❤️ 💛 💚 hearts worth 1-3 points each
- **⬜ White tiles**: Face value points
- **🟥🟨🟩 Color match**: Double points
- **Color mismatch**: Zero points

### Turn Actions
1. **Draw**: 1 heart + 1 magic card (mandatory)
2. **Place**: Multiple hearts on empty tiles
3. **Magic**: Use ability cards
4. **End**: Pass to next player

### Magic Cards

#### 💨 Wind (6 cards)
Remove opponent's heart from any tile. Tile color stays unchanged.

#### ♻️ Recycle (5 cards)
Change any colored tile (🟥🟨🟩) to white (⬜).

#### 🛡️ Shield (5 cards)
Protect all your tiles for 3 turns. Blocks opponent's Wind and Recycle cards.

### Game Flow
1. **Sign in** → Create or join room
2. **Ready up** → Both players mark ready
3. **Play** → Take turns placing hearts and using magic
4. **Win** → Most points when game ends

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