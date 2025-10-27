/**
 * Simple card data factories for testing
 *
 * IMPORTANT: These factories create simple data objects, NOT mock implementations.
 * Tests should import real card classes from src/lib/cards.js for testing behavior.
 */

/**
 * Factory for creating heart card data objects
 */
export const createHeartCardData = (overrides = {}) => {
  const defaults = {
    id: `heart-${Date.now()}-${Math.random()}`,
    color: 'red',
    value: 2,
    emoji: '❤️',
    type: 'heart'
  };

  return { ...defaults, ...overrides };
};

/**
 * Factory for creating wind card data objects
 */
export const createWindCardData = (overrides = {}) => {
  const defaults = {
    id: `wind-${Date.now()}-${Math.random()}`,
    type: 'wind',
    emoji: '💨',
    name: 'Wind Card'
  };

  return { ...defaults, ...overrides };
};

/**
 * Factory for creating recycle card data objects
 */
export const createRecycleCardData = (overrides = {}) => {
  const defaults = {
    id: `recycle-${Date.now()}-${Math.random()}`,
    type: 'recycle',
    emoji: '♻️',
    name: 'Recycle Card'
  };

  return { ...defaults, ...overrides };
};

/**
 * Factory for creating shield card data objects
 */
export const createShieldCardData = (overrides = {}) => {
  const defaults = {
    id: `shield-${Date.now()}-${Math.random()}`,
    type: 'shield',
    emoji: '🛡️',
    name: 'Shield Card'
  };

  return { ...defaults, ...overrides };
};

/**
 * Create a set of predefined heart card data objects for testing
 */
export const createTestHeartDataSet = (playerId) => [
  createHeartCardData({
    id: `heart-${playerId}-1`,
    color: 'red',
    value: 2,
    emoji: '❤️'
  }),
  createHeartCardData({
    id: `heart-${playerId}-2`,
    color: 'yellow',
    value: 1,
    emoji: '💛'
  }),
  createHeartCardData({
    id: `heart-${playerId}-3`,
    color: 'green',
    value: 3,
    emoji: '💚'
  })
];

/**
 * Create a set of predefined magic card data objects for testing
 */
export const createTestMagicDataSet = (playerId) => [
  createWindCardData({
    id: `magic-${playerId}-1`
  }),
  createRecycleCardData({
    id: `magic-${playerId}-2`
  })
];

/**
 * Create a complete initial hand data set for a player
 */
export const createInitialHandData = (playerId) => [
  ...createTestHeartDataSet(playerId),
  ...createTestMagicDataSet(playerId)
];

/**
 * Generate random heart card data with specified parameters
 */
export const generateRandomHeartCardData = (overrides = {}) => {
  const colors = ['red', 'yellow', 'green'];
  const emojis = ['❤️', '💛', '💚'];
  const colorIndex = Math.floor(Math.random() * 3);

  return createHeartCardData({
    color: colors[colorIndex],
    value: Math.floor(Math.random() * 3) + 1,
    emoji: emojis[colorIndex],
    ...overrides
  });
};

/**
 * Generate random magic card data with weighted distribution
 */
export const generateRandomMagicCardData = (overrides = {}) => {
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
      return createWindCardData(overrides);
    case 'recycle':
      return createRecycleCardData(overrides);
    case 'shield':
      return createShieldCardData(overrides);
    default:
      return createWindCardData(overrides);
  }
};

/**
 * Helper functions to check card types from data objects
 */
export const isHeartCardData = (card) => card?.type === 'heart' || (card?.color && card?.value !== undefined);
export const isMagicCardData = (card) => card?.type && ['wind', 'recycle', 'shield'].includes(card.type);
export const isWindCardData = (card) => card?.type === 'wind';
export const isRecycleCardData = (card) => card?.type === 'recycle';
export const isShieldCardData = (card) => card?.type === 'shield';

// Legacy exports for backward compatibility
// TODO: Update test files to use the new naming convention
export const createHeartCard = createHeartCardData;
export const createWindCard = createWindCardData;
export const createRecycleCard = createRecycleCardData;
export const createShieldCard = createShieldCardData;
export const createTestHeartSet = createTestHeartDataSet;
export const createTestMagicSet = createTestMagicDataSet;
export const createInitialHand = createInitialHandData;
export const generateRandomHeartCard = generateRandomHeartCardData;
export const generateRandomMagicCard = generateRandomMagicCardData;
export const isHeartCard = isHeartCardData;
export const isMagicCard = isMagicCardData;
export const isWindCard = isWindCardData;
export const isRecycleCard = isRecycleCardData;
export const isShieldCard = isShieldCardData;

/**
 * Create card data from existing card (for compatibility)
 * Simply returns the card data as-is since we don't create mock instances
 */
export const createCardFromData = (cardData) => {
  if (!cardData) return null;
  return cardData;
};