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

Visit <http://localhost:3000> to start playing!

## Game Rules and Mechanics

Please refer to the [Game Rules](docs/game-rules.md) document for detailed rules and mechanics of Heart Tiles.

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
