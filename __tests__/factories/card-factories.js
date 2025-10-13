import { vi } from 'vitest';

/**
 * Factory for creating test heart cards
 */
export const createHeartCard = (overrides = {}) => {
  const defaults = {
    id: `heart-${Date.now()}-${Math.random()}`,
    color: 'red',
    value: 2,
    emoji: '❤️',
    type: 'heart',
    canTargetTile: vi.fn((tile) => !tile.placedHeart),
    calculateScore: vi.fn((tile) => {
      if (tile.color === 'white') return overrides.value || 2;
      return tile.color === overrides.color ? (overrides.value || 2) * 2 : 0;
    })
  };

  return { ...defaults, ...overrides };
};

/**
 * Factory for creating test wind cards
 */
export const createWindCard = (overrides = {}) => {
  const defaults = {
    id: `wind-${Date.now()}-${Math.random()}`,
    type: 'wind',
    emoji: '💨',
    name: 'Wind Card',
    canTargetTile: vi.fn((tile, playerId) => tile.placedHeart && tile.placedHeart.placedBy !== playerId),
    executeEffect: vi.fn((gameState, targetTileId, playerId) => {
      const tile = gameState.tiles.find(t => t.id == targetTileId);
      if (!tile || !tile.placedHeart) throw new Error('Invalid target for Wind card');

      const removedHeart = { ...tile.placedHeart };
      const originalColor = tile.placedHeart.originalTileColor || 'white';

      // Apply the effect to the tile state directly
      const tileIndex = gameState.tiles.findIndex(t => t.id == targetTileId);
      if (tileIndex !== -1) {
        gameState.tiles[tileIndex] = {
          id: tile.id,
          color: originalColor,
          emoji: originalColor === 'white' ? '⬜' :
                originalColor === 'red' ? '🟥' :
                originalColor === 'yellow' ? '🟨' : '🟩',
          placedHeart: undefined
        };
      }

      return {
        type: 'wind',
        removedHeart,
        targetedPlayerId: removedHeart.placedBy,
        tileId: tile.id,
        newTileState: {
          id: tile.id,
          color: originalColor,
          emoji: originalColor === 'white' ? '⬜' :
                originalColor === 'red' ? '🟥' :
                originalColor === 'yellow' ? '🟨' : '🟩',
          placedHeart: undefined
        }
      };
    })
  };

  return { ...defaults, ...overrides };
};

/**
 * Factory for creating test recycle cards
 */
export const createRecycleCard = (overrides = {}) => {
  const defaults = {
    id: `recycle-${Date.now()}-${Math.random()}`,
    type: 'recycle',
    emoji: '♻️',
    name: 'Recycle Card',
    canTargetTile: vi.fn((tile) => !tile.placedHeart && tile.color !== 'white'),
    executeEffect: vi.fn((gameState, targetTileId) => {
      const tile = gameState.tiles.find(t => t.id == targetTileId);
      if (!tile || tile.color === 'white' || tile.placedHeart) throw new Error('Invalid target for Recycle card');
      return {
        type: 'recycle',
        previousColor: tile.color,
        newColor: 'white',
        tileId: tile.id,
        newTileState: {
          id: tile.id,
          color: 'white',
          emoji: '⬜',
          placedHeart: tile.placedHeart
        }
      };
    })
  };

  return { ...defaults, ...overrides };
};

/**
 * Factory for creating test shield cards
 */
export const createShieldCard = (overrides = {}) => {
  const defaults = {
    id: `shield-${Date.now()}-${Math.random()}`,
    type: 'shield',
    emoji: '🛡️',
    name: 'Shield Card',
    canTargetTile: vi.fn(() => false),
    executeEffect: vi.fn((gameState, playerId) => {
      if (!gameState.shields) gameState.shields = {};
      gameState.shields[playerId] = {
        active: true,
        remainingTurns: 3,
        activatedAt: Date.now(),
        activatedTurn: gameState.turnCount || 1,
        activatedBy: playerId,
        protectedPlayerId: playerId
      };
      return {
        type: 'shield',
        activatedFor: playerId,
        protectedPlayerId: playerId,
        remainingTurns: 3,
        message: `Shield activated! Your tiles and hearts are protected for 3 turns.`,
        reinforced: false
      };
    }),
    isActive: vi.fn((shield, currentTurnCount) => {
      if (!shield) return false;
      if (shield.remainingTurns === 0) return false;
      if (shield.activatedTurn !== undefined && currentTurnCount !== undefined) {
        const expirationTurn = shield.activatedTurn + 3;
        return currentTurnCount < expirationTurn;
      }
      return shield.remainingTurns > 0;
    }),
    isPlayerProtected: vi.fn((gameState, playerId, currentTurnCount) => {
      if (!gameState.shields || !gameState.shields[playerId]) return false;
      return gameState.shields[playerId].remainingTurns > 0;
    })
  };

  return { ...defaults, ...overrides };
};

/**
 * Create a set of predefined heart cards for testing
 */
export const createTestHeartSet = (playerId) => [
  createHeartCard({
    id: `heart-${playerId}-1`,
    color: 'red',
    value: 2,
    emoji: '❤️'
  }),
  createHeartCard({
    id: `heart-${playerId}-2`,
    color: 'yellow',
    value: 1,
    emoji: '💛'
  }),
  createHeartCard({
    id: `heart-${playerId}-3`,
    color: 'green',
    value: 3,
    emoji: '💚'
  })
];

/**
 * Create a set of predefined magic cards for testing
 */
export const createTestMagicSet = (playerId) => [
  createWindCard({
    id: `magic-${playerId}-1`
  }),
  createRecycleCard({
    id: `magic-${playerId}-2`
  })
];

/**
 * Create a complete initial hand for a player
 */
export const createInitialHand = (playerId) => [
  ...createTestHeartSet(playerId),
  ...createTestMagicSet(playerId)
];

/**
 * Generate random heart card with specified parameters
 */
export const generateRandomHeartCard = (overrides = {}) => {
  const colors = ['red', 'yellow', 'green'];
  const emojis = ['❤️', '💛', '💚'];
  const colorIndex = Math.floor(Math.random() * 3);

  return createHeartCard({
    color: colors[colorIndex],
    value: Math.floor(Math.random() * 3) + 1,
    emoji: emojis[colorIndex],
    ...overrides
  });
};

/**
 * Generate random magic card with weighted distribution
 */
export const generateRandomMagicCard = (overrides = {}) => {
  const types = ['wind', 'recycle', 'shield'];
  const weights = [6, 5, 5]; // Game rule distribution
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  let selectedType = 'wind';

  for (let i = 0; i < types.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      selectedType = types[i];
      break;
    }
  }

  switch (selectedType) {
    case 'wind':
      return createWindCard(overrides);
    case 'recycle':
      return createRecycleCard(overrides);
    case 'shield':
      return createShieldCard(overrides);
    default:
      return createWindCard(overrides);
  }
};

/**
 * Helper functions to check card types
 */
export const isHeartCard = (card) => card?.type === 'heart' || (card?.color && card?.value !== undefined);
export const isMagicCard = (card) => card?.type && ['wind', 'recycle', 'shield'].includes(card.type);
export const isWindCard = (card) => card?.type === 'wind';
export const isRecycleCard = (card) => card?.type === 'recycle';
export const isShieldCard = (card) => card?.type === 'shield';

/**
 * Create card from data (for compatibility with existing code)
 */
export const createCardFromData = (cardData) => {
  if (!cardData) return null;

  if (isHeartCard(cardData)) {
    return createHeartCard(cardData);
  } else if (isWindCard(cardData)) {
    return createWindCard(cardData);
  } else if (isRecycleCard(cardData)) {
    return createRecycleCard(cardData);
  } else if (isShieldCard(cardData)) {
    return createShieldCard(cardData);
  }

  return cardData;
};