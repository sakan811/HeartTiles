import { createInitialHand } from './card-factories.js';

/**
 * Factory for creating test tiles
 */
export const createTile = (overrides = {}) => {
  const defaults = {
    id: 0,
    color: 'white',
    emoji: '⬜',
    placedHeart: null
  };

  return { ...defaults, ...overrides };
};

/**
 * Create a complete set of 8 tiles for testing
 */
export const createTileSet = (overrides = {}) => {
  return Array.from({ length: 8 }, (_, i) => createTile({
    id: i,
    color: i % 3 === 0 ? 'white' : ['red', 'yellow', 'green'][i % 3],
    emoji: i % 3 === 0 ? '⬜' : ['🟥', '🟨', '🟩'][i % 3],
    ...overrides
  }));
};

/**
 * Factory for creating test players
 */
export const createPlayer = (overrides = {}) => {
  const defaults = {
    userId: 'user1',
    name: 'Test User',
    email: 'test@example.com',
    isReady: false,
    score: 0,
    joinedAt: new Date()
  };

  return { ...defaults, ...overrides };
};

/**
 * Create a set of test players for a game
 */
export const createPlayerSet = (count = 2, baseId = 'user') => {
  return Array.from({ length: count }, (_, i) => createPlayer({
    userId: `${baseId}${i + 1}`,
    name: `User ${baseId}${i + 1}`,
    email: `${baseId}${i + 1}@example.com`
  }));
};

/**
 * Factory for creating test rooms
 */
export const createRoom = (overrides = {}) => {
  const defaults = {
    code: 'TEST01',
    players: [],
    maxPlayers: 2,
    gameState: {
      tiles: createTileSet(),
      gameStarted: false,
      currentPlayer: null,
      deck: { emoji: '💌', cards: 16, type: 'hearts' },
      magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
      playerHands: {},
      shields: {},
      turnCount: 0,
      playerActions: {}
    }
  };

  return { ...defaults, ...overrides };
};

/**
 * Create a room with players and initial hands ready for game start
 */
export const createGameReadyRoom = (overrides = {}) => {
  const players = createPlayerSet(2);
  const room = createRoom({
    ...overrides,
    players: players.map(p => ({ ...p, isReady: true }))
  });

  // Set up initial hands for each player
  players.forEach(player => {
    room.gameState.playerHands[player.userId] = createInitialHand(player.userId);
  });

  return room;
};

/**
 * Create a room with an active game in progress
 */
export const createActiveGameRoom = (overrides = {}) => {
  const room = createGameReadyRoom(overrides);
  const players = room.players;

  // Start the game
  room.gameState.gameStarted = true;
  room.gameState.currentPlayer = players[0];
  room.gameState.turnCount = 1;

  return room;
};

/**
 * Create a room with a specific game state scenario
 */
export const createScenarioRoom = (scenario, overrides = {}) => {
  const baseRoom = createActiveGameRoom(overrides);

  switch (scenario) {
    case 'hearts-placed':
      // Place some hearts on tiles
      baseRoom.gameState.tiles[0].placedHeart = {
        ...baseRoom.gameState.playerHands[baseRoom.players[0].userId][0],
        placedBy: baseRoom.players[0].userId,
        originalTileColor: baseRoom.gameState.tiles[0].color
      };
      baseRoom.gameState.tiles[0].emoji = baseRoom.gameState.playerHands[baseRoom.players[0].userId][0].emoji;
      baseRoom.gameState.tiles[0].color = baseRoom.gameState.playerHands[baseRoom.players[0].userId][0].color;
      break;

    case 'shield-active':
      // Activate shield for player 1
      baseRoom.gameState.shields = {
        [baseRoom.players[0].userId]: {
          active: true,
          remainingTurns: 3,
          activatedAt: Date.now(),
          activatedTurn: 1,
          activatedBy: baseRoom.players[0].userId,
          protectedPlayerId: baseRoom.players[0].userId
        }
      };
      break;

    case 'deck-empty':
      // Empty both decks
      baseRoom.gameState.deck.cards = 0;
      baseRoom.gameState.magicDeck.cards = 0;
      break;

    case 'turn-end-required':
      // Set up player actions tracking
      baseRoom.gameState.playerActions = {
        [baseRoom.gameState.currentPlayer.userId]: {
          drawnHeart: false,
          drawnMagic: false
        }
      };
      break;

    default:
      break;
  }

  return baseRoom;
};

/**
 * Factory for creating game state updates
 */
export const createGameStateUpdate = (overrides = {}) => {
  const defaults = {
    tiles: createTileSet(),
    players: [],
    currentPlayer: null,
    playerHands: {},
    deck: { emoji: '💌', cards: 16, type: 'hearts' },
    magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
    turnCount: 1,
    shields: {}
  };

  return { ...defaults, ...overrides };
};

/**
 * Create heart-placed event data
 */
export const createHeartPlacedData = (overrides = {}) => {
  return createGameStateUpdate({
    eventType: 'heart-placed',
    ...overrides
  });
};

/**
 * Create magic-card-used event data
 */
export const createMagicCardUsedData = (overrides = {}) => {
  const defaults = {
    card: null,
    actionResult: null,
    usedBy: 'user1',
    tiles: createTileSet(),
    players: [],
    playerHands: {},
    shields: {}
  };

  return { ...defaults, ...overrides };
};

/**
 * Create turn-changed event data
 */
export const createTurnChangedData = (overrides = {}) => {
  return createGameStateUpdate({
    eventType: 'turn-changed',
    ...overrides
  });
};

/**
 * Create game-start event data
 */
export const createGameStartData = (overrides = {}) => {
  return createGameStateUpdate({
    eventType: 'game-start',
    turnCount: 1,
    ...overrides
  });
};

/**
 * Helper to extract room code for testing
 */
export const generateRoomCode = (counter = 1) => {
  const code = counter.toString().padStart(2, '0');
  return `${code}TEST`;
};

/**
 * Create error event data
 */
export const createErrorData = (message, overrides = {}) => {
  return {
    error: message,
    eventType: 'room-error',
    ...overrides
  };
};