# Heart Tiles

A strategic tile-based card game where players place colored hearts on tiles to score points. Built with Next.js 16, React 19, Socket.IO, and MongoDB for real-time multiplayer gameplay.

Inspired by Kitty Card Game from Love and Deepspace

## Status

[![Vitest Tests](https://github.com/sakan811/HeartTiles/actions/workflows/web-app-test.yml/badge.svg)](https://github.com/sakan811/HeartTiles/actions/workflows/web-app-test.yml)

## Quick Start

### Prerequisites

- Node.js and pnpm
- Docker (for MongoDB development)

### Setup

```bash
# Clone and install dependencies
git clone https://github.com/sakan811/HeartTiles.git
cd HeartTiles
pnpm install

# Start MongoDB with Docker (development)
pnpm docker:start

# Configure environment
cp .env.example .env
# MongoDB runs on localhost:27017 with credentials root/example

# Start development server
pnpm dev
```

Visit <http://localhost:3000> to start playing!

## Game Rules and Mechanics

Please refer to the [Game Rules](docs/GAME_RULES.md) document for detailed rules and mechanics of Heart Tiles.

## Development

### Tech Stack

- **Frontend**: Next.js 16.0.1, React 19.2.0, TypeScript 5.9.3, Tailwind CSS v4.1.16
- **Backend**: Node.js, Socket.IO 4.8.1, MongoDB, Mongoose 8.19.2
- **Auth**: NextAuth 5.0.0-beta.30 with MongoDB user storage and bcryptjs
- **Testing**: Vitest 4.0.5 with comprehensive test suite
- **Docker**: MongoDB with Mongo Express admin UI

### Commands

```bash
# Core Development
pnpm dev          # Development server
pnpm build        # Production build with Turbopack
pnpm start        # Production server
pnpm lint         # Lint and auto-fix code

# Testing
pnpm test:run     # Run tests once
pnpm test:coverage # Coverage report
pnpm test:ui      # Test UI
pnpm test         # Alias for test:run

# Docker
pnpm docker:start # Start MongoDB and Mongo Express
pnpm docker:stop  # Stop services
pnpm docker:logs  # View logs
```

### Architecture

- **Server-first**: All game state lives on server (single source of truth)
- **Real-time**: Socket.IO for multiplayer synchronization
- **Persistent**: MongoDB for rooms, users, sessions, and game data
- **Client-display**: UI only renders server state and captures user input
