import { vi } from 'vitest'
import React from 'react'
import { ShieldCard } from '../src/lib/cards.js'
import '@testing-library/jest-dom'

// Mock mongoose before any imports that might use it
const mockSchemaTypes = {
  ObjectId: vi.fn(),
  Mixed: vi.fn(),
  String: vi.fn(),
  Number: vi.fn(),
  Boolean: vi.fn(),
  Date: vi.fn(),
  Buffer: vi.fn(),
  Array: vi.fn(),
  Decimal128: vi.fn(),
  Map: vi.fn(),
  UUID: vi.fn()
}

const mockMongoose = {
  connect: vi.fn().mockResolvedValue(),
  disconnect: vi.fn().mockResolvedValue(),
  Schema: vi.fn().mockImplementation(() => {
    const schema = {
      pre: vi.fn(),
      post: vi.fn(),
      methods: {},
      statics: {},
      virtual: vi.fn().mockReturnThis(),
      get: vi.fn(),
      set: vi.fn(),
      index: vi.fn(),
      plugin: vi.fn(),
      add: vi.fn(),
      loadClass: vi.fn(),
      Types: mockSchemaTypes
    }
    return schema
  }),
  model: vi.fn(),
  Types: mockSchemaTypes,
  models: {}, // Add the models property to prevent the error
  Connection: vi.fn(),
  connection: {
    readyState: 1,
    on: vi.fn(),
    once: vi.fn(),
    close: vi.fn()
  }
}

// Make sure models is not undefined
Object.defineProperty(mockMongoose, 'models', {
  value: {},
  writable: true,
  enumerable: true,
  configurable: true
})

// Also make sure the Schema constructor has the Types property
mockMongoose.Schema.Types = mockSchemaTypes

vi.mock('mongoose', () => ({
  default: mockMongoose,
  ...mockMongoose
}))

// Note: Removed global models mock to allow actual models.js execution for coverage
// Individual tests will mock models as needed

// Make React available globally for all tests
vi.stubGlobal('React', React)

// Set up environment variables for testing
process.env.NODE_ENV = 'test'
process.env.NEXTAUTH_SECRET = 'test-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.MONGODB_URI = 'mongodb://localhost:27017/test'

// Mock Next.js modules before any imports
vi.mock('next/server', () => ({
  NextRequest: vi.fn().mockImplementation((url, init) => ({
    url,
    method: init?.method || 'GET',
    headers: new Map(),
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(''),
    body: init?.body,
  })),
  NextResponse: {
    json: vi.fn().mockImplementation((data, options = {}) => ({
      status: options.status || 200,
      json: vi.fn().mockResolvedValue(data),
      headers: new Map(),
    })),
    redirect: vi.fn().mockImplementation((url, options = {}) => ({
      status: options.status || 302,
      headers: new Map([['Location', url]]),
    })),
    next: vi.fn().mockImplementation(() => ({
      status: 200,
      headers: new Map(),
    })),
  },
}))

// Mock NextAuth core modules
vi.mock('next-auth', () => ({
  default: vi.fn().mockImplementation((config) => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn().mockImplementation((config) => ({
    type: 'credentials',
    name: 'credentials',
    ...config,
  })),
}))

// Mock window object for React components using vi.stubGlobal for proper cleanup
vi.stubGlobal('window', {
  location: {
    reload: vi.fn(),
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    hostname: 'localhost',
    pathname: '/',
    search: '',
    hash: ''
  },
  // Add other common window properties that components might use
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  navigator: {
    userAgent: 'test-user-agent',
    platform: 'test-platform',
    language: 'en-US'
  },
  document: {
    createElement: vi.fn(() => ({ style: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
    getElementById: vi.fn(),
    querySelector: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  },
  localStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  sessionStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
  cancelAnimationFrame: vi.fn(),
  // Ensure window object checks work correctly
  self: {},
  performance: {
    now: vi.fn(() => Date.now())
  }
})

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// Mock Date.now for consistent testing
const mockDate = new Date('2024-01-01T00:00:00.000Z')
global.Date.now = vi.fn(() => mockDate.getTime())

// Store original timer functions before mocking
const originalSetTimeout = global.setTimeout
const originalSetInterval = global.setInterval
const originalClearTimeout = global.clearTimeout
const originalClearInterval = global.clearInterval

// Mock setTimeout/setInterval for consistent testing
global.setTimeout = vi.fn((fn, delay) => {
  return originalSetTimeout(fn, delay)
})

global.setInterval = vi.fn((fn, interval) => {
  return originalSetInterval(fn, interval)
})

global.clearTimeout = vi.fn((id) => {
  return originalClearTimeout(id)
})

global.clearInterval = vi.fn((id) => {
  return originalClearInterval(id)
})

// Mock cards library for all tests
vi.mock('../src/lib/cards.js', () => {
  // Mock BaseCard class
  class MockBaseCard {
    constructor(id, type, emoji, name, description) {
      this.id = id;
      this.type = type;
      this.emoji = emoji;
      this.name = name;
      this.description = description;
    }

    canTargetTile() {
      return true;
    }

    executeEffect() {
      return { success: true };
    }
  }

  // Mock HeartCard class
  class MockHeartCard extends MockBaseCard {
    constructor(id, color, value, emoji) {
      super(id, 'heart', emoji, `${color} heart`, `A ${color} heart card worth ${value} points`);
      this.color = color;
      this.value = value;
    }

    canTargetTile(tile) {
      return !tile?.placedHeart;
    }

    calculateScore(tile) {
      if (tile?.color === 'white') return this.value;
      return this.color === tile?.color ? this.value * 2 : 0;
    }

    static generateRandom() {
      const colors = ['red', 'yellow', 'green'];
      const emojis = ['❤️', '💛', '💚'];
      const randomIndex = Math.floor(Math.random() * colors.length);
      const randomValue = Math.floor(Math.random() * 3) + 1;
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 9);
      const cardId = `${timestamp}-${randomSuffix}`;

      return new MockHeartCard(
        cardId,
        colors[randomIndex],
        randomValue,
        emojis[randomIndex]
      );
    }

    static getAvailableColors() {
      return ["red", "yellow", "green"];
    }

    static getColorEmojis() {
      return ["❤️", "💛", "💚"];
    }
  }

  // Mock MagicCard class
  class MockMagicCard extends MockBaseCard {
    constructor(id, type, emoji, name, description) {
      super(id, type, emoji, name, description);
    }
  }

  // Mock WindCard class
  class MockWindCard extends MockMagicCard {
    constructor(id) {
      super(id, 'wind', '💨', 'Wind Card', 'Remove opponent heart from a tile');
    }

    canTargetTile(tile, playerId) {
      return tile?.placedHeart && tile.placedHeart.placedBy !== playerId;
    }

    executeEffect(gameState, targetTileId, playerId) {
      return { success: true, type: 'wind', targetTileId, playerId };
    }
  }

  // Mock RecycleCard class
  class MockRecycleCard extends MockMagicCard {
    constructor(id) {
      super(id, 'recycle', '♻️', 'Recycle Card', 'Change colored tile to white');
    }

    canTargetTile(tile, playerId) {
      return !tile?.placedHeart && tile?.color !== 'white';
    }

    executeEffect(gameState, targetTileId, playerId) {
      return { success: true, type: 'recycle', targetTileId, playerId };
    }
  }

  // Mock ShieldCard class
  class MockShieldCard extends MockMagicCard {
    constructor(id) {
      super(id, 'shield', '🛡️', 'Shield Card', 'Protection for 2 turns');
    }

    canTargetTile(tile, playerId) {
      return true; // Shield can be used without target
    }

    executeEffect(gameState, targetTileId, playerId) {
      return { success: true, type: 'shield', playerId };
    }

    static isTileProtected(gameState, tile, turnCount) {
      if (!gameState?.shields || !tile?.placedHeart) return false;

      const playerShield = gameState.shields[tile.placedHeart.placedBy];
      if (!playerShield?.active) return false;

      return playerShield.remainingTurns > 0;
    }
  }

  // Mock generateRandomMagicCard function with spy support
  let mockMagicCardImpl = () => {
    const cardTypes = ['wind', 'recycle', 'shield'];
    const weights = [0.4, 0.35, 0.25]; // Probabilities for each type
    const random = Math.random();
    let accumulated = 0;
    let selectedType = 'wind';

    for (let i = 0; i < cardTypes.length; i++) {
      accumulated += weights[i];
      if (random < accumulated) {
        selectedType = cardTypes[i];
        break;
      }
    }

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const cardId = `${timestamp}-${randomSuffix}`;

    switch (selectedType) {
      case 'wind':
        return new MockWindCard(cardId);
      case 'recycle':
        return new MockRecycleCard(cardId);
      case 'shield':
        return new MockShieldCard(cardId);
      default:
        return new MockWindCard(cardId);
    }
  };

  const mockGenerateRandomMagicCard = vi.fn(mockMagicCardImpl);

  // Mock utility functions
  const mockIsHeartCard = vi.fn((card) => card?.type === 'heart');
  const mockIsMagicCard = vi.fn((card) => ['wind', 'recycle', 'shield'].includes(card?.type));
  const mockCreateCardFromData = vi.fn((data) => {
    if (data.type === 'heart') {
      return new MockHeartCard(data.id, data.color, data.value, data.emoji);
    } else if (data.type === 'wind') {
      return new MockWindCard(data.id);
    } else if (data.type === 'recycle') {
      return new MockRecycleCard(data.id);
    } else if (data.type === 'shield') {
      return new MockShieldCard(data.id);
    }
    return null;
  });

  // Wrap the static method with vi.fn for spy support
  MockHeartCard.generateRandom = vi.fn(MockHeartCard.generateRandom);

  return {
    BaseCard: MockBaseCard,
    HeartCard: MockHeartCard,
    MagicCard: MockMagicCard,
    WindCard: MockWindCard,
    RecycleCard: MockRecycleCard,
    ShieldCard: MockShieldCard,
    generateRandomMagicCard: mockGenerateRandomMagicCard,
    isHeartCard: mockIsHeartCard,
    isMagicCard: mockIsMagicCard,
    createCardFromData: mockCreateCardFromData
  };
});

// Custom matchers for Shield card testing
expect.extend({
  toBeShieldCard(received) {
    const isShieldCard = received &&
      received.type === 'shield' &&
      received.emoji === '🛡️' &&
      typeof received.executeEffect === 'function'

    if (isShieldCard) {
      return {
        message: () => `expected ${received} not to be a Shield card`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received} to be a Shield card`,
        pass: false,
      }
    }
  },

  toBeProtectedTile(received, gameState, turnCount) {
    // Import ShieldCard from the mock for this test
    const { ShieldCard } = require('../src/lib/cards.js');
    const isProtectedTile = received &&
      typeof received === 'object' &&
      gameState &&
      ShieldCard.isTileProtected(gameState, received, turnCount)

    if (isProtectedTile) {
      return {
        message: () => `expected tile not to be protected`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected tile to be protected`,
        pass: false,
      }
    }
  }
})

// Global setup and teardown hooks
afterEach(() => {
  // Clean up any global mocks after each test
  vi.clearAllMocks()

  // Re-establish comprehensive window object mock to ensure consistency across tests
  // This includes all properties that React DOM might need during rendering and cleanup
  vi.stubGlobal('window', {
    location: {
      reload: vi.fn(),
      href: 'http://localhost:3000',
      origin: 'http://localhost:3000',
      hostname: 'localhost',
      pathname: '/',
      search: '',
      hash: ''
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    navigator: {
      userAgent: 'test-user-agent',
      platform: 'test-platform',
      language: 'en-US'
    },
    document: {
      createElement: vi.fn(() => ({ style: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    },
    localStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    },
    sessionStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    },
    requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
    cancelAnimationFrame: vi.fn(),
    self: {},
    performance: {
      now: vi.fn(() => Date.now())
    },
    // Additional properties that React DOM might access
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    // Mock timers that React DOM might use
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    // Mock Event constructor
    Event: class Event {
      constructor(type, options) {
        this.type = type
        this.bubbles = options?.bubbles || false
        this.cancelable = options?.cancelable || false
      }
    },
    // Mock CustomEvent constructor
    CustomEvent: class CustomEvent extends Event {
      constructor(type, options) {
        super(type, options)
        this.detail = options?.detail || null
      }
    }
  })
})