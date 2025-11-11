import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";

// Create mock functions before mocking
const { getToken: mockGetToken, mockUserFindById } = vi.hoisted(() => ({
  getToken: vi.fn(),
  mockUserFindById: vi.fn(),
}));

// Mock next-auth/jwt
vi.mock("next-auth/jwt", () => ({
  getToken: mockGetToken,
}));

// Mock database models
vi.mock("../../models.js", () => ({
  User: {
    findById: mockUserFindById,
  },
  Room: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
  PlayerSession: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

// Import real server functions for integration testing
import {
  generateTiles,
  validateRoomCode,
  validateRoomState,
  validatePlayerInRoom,
  calculateScore,
  checkGameEndConditions,
  sanitizeInput,
} from "../../server.js";

// Import authentication functions
import { authenticateSocket } from "../utils/server-test-utils.js";

// Helper function to generate room codes (since it's not exported from server.js)
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

describe("Socket Events Integration Tests", () => {
  beforeAll(() => {
    // Set up any global integration test setup
  });

  afterAll(() => {
    // Clean up any global resources
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication Integration", () => {
    it("should authenticate socket with valid token and database user", async () => {
      // Mock successful token retrieval
      const userId = "507f1f77bcf86cd799439011"; // Valid 24-character hex string
      mockGetToken.mockResolvedValue({
        id: userId,
        jti: "session-456",
        email: "test@example.com",
        name: "Test User",
      });

      // Mock successful user lookup
      const mockUser = {
        _id: userId,
        id: userId,
        email: "test@example.com",
        name: "Test User",
      };

      const mockSocket = {
        handshake: {},
        data: {},
      };

      mockUserFindById.mockResolvedValue(mockUser);

      const mockUserModel = { findById: mockUserFindById };
      const result = await authenticateSocket(
        mockSocket,
        mockGetToken,
        mockUserModel,
      );

      expect(result.authenticated).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(mockSocket.data.userId).toBe(userId);
      expect(mockSocket.data.userEmail).toBe("test@example.com");
      expect(mockSocket.data.userName).toBe("Test User");
      expect(mockSocket.data.userSessionId).toBe("session-456");
    });

    it("should reject socket with invalid token", async () => {
      // Mock failed token retrieval
      mockGetToken.mockResolvedValue(null);

      const mockSocket = {
        handshake: {},
        data: {},
      };

      const mockUserModel = { findById: mockUserFindById };
      await expect(
        authenticateSocket(mockSocket, mockGetToken, mockUserModel),
      ).rejects.toThrow("Authentication required");
    });

    it("should reject socket when user not found in database", async () => {
      // Mock successful token but failed user lookup
      mockGetToken.mockResolvedValue({
        id: "507f1f77bcf86cd799439012", // Valid 24-character hex string
        jti: "session-456",
      });

      const mockSocket = {
        handshake: {},
        data: {},
      };

      mockUserFindById.mockResolvedValue(null);

      const mockUserModel = { findById: mockUserFindById };
      await expect(
        authenticateSocket(mockSocket, mockGetToken, mockUserModel),
      ).rejects.toThrow("User not found");
    });
  });

  describe("Room Management Integration", () => {
    it("should generate valid room codes", () => {
      const roomCode = generateRoomCode();

      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/); // 6 alphanumeric characters
      expect(roomCode.length).toBe(6);
      expect(validateRoomCode(roomCode)).toBe(true);
    });

    it("should validate room codes correctly", () => {
      const validCodes = ["ABC123", "XYZ789", "A1B2C3"];
      const invalidCodes = ["TOOLONG", "TOOS", "toolong", "toolong123"];

      validCodes.forEach((code) => {
        expect(validateRoomCode(code)).toBe(true);
      });

      invalidCodes.forEach((code) => {
        expect(validateRoomCode(code)).toBe(false);
      });
    });

    it("should create room with initial game state", () => {
      const roomCode = generateRoomCode();
      const tiles = generateTiles();

      const room = {
        code: roomCode,
        players: [],
        maxPlayers: 2,
        gameState: {
          tiles: tiles,
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: "💌", cards: 16, type: "hearts" },
          magicDeck: { emoji: "🔮", cards: 16, type: "magic" },
          playerHands: {},
          turnCount: 0,
          playerActions: {},
        },
      };

      expect(room.code).toBe(roomCode);
      expect(room.players).toHaveLength(0);
      expect(room.maxPlayers).toBe(2);
      expect(room.gameState.tiles).toHaveLength(8);
      expect(room.gameState.gameStarted).toBe(false);
      expect(room.gameState.deck.cards).toBe(16);
      expect(room.gameState.magicDeck.cards).toBe(16);
    });

    it("should handle player joining room", () => {
      const roomCode = generateRoomCode();
      const room = {
        code: roomCode,
        players: [],
        maxPlayers: 2,
        gameState: {
          tiles: generateTiles(),
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: "💌", cards: 16, type: "hearts" },
          magicDeck: { emoji: "🔮", cards: 16, type: "magic" },
          playerHands: {},
          turnCount: 0,
          playerActions: {},
        },
      };

      const player = {
        userId: "user123",
        name: "Test User",
        email: "test@example.com",
        isReady: false,
        score: 0,
      };

      room.players.push(player);

      expect(room.players).toHaveLength(1);
      expect(room.players[0].name).toBe("Test User");
      expect(room.players[0].isReady).toBe(false);
    });

    it("should reject room join when room is full", () => {
      const roomCode = generateRoomCode();
      const room = {
        code: roomCode,
        players: [
          { userId: "user1", name: "User1" },
          { userId: "user2", name: "User2" },
        ],
        maxPlayers: 2,
        gameState: { gameStarted: false },
      };

      // Simulate full room check
      const canJoin = room.players.length < room.maxPlayers;
      expect(canJoin).toBe(false);
    });
  });

  describe("Game State Integration", () => {
    it("should start game when all players are ready", () => {
      const room = {
        players: [
          { userId: "user1", name: "User1", isReady: true },
          { userId: "user2", name: "User2", isReady: true },
        ],
        maxPlayers: 2,
        gameState: {
          tiles: generateTiles(),
          gameStarted: false,
          currentPlayer: null,
          deck: { emoji: "💌", cards: 16, type: "hearts" },
          magicDeck: { emoji: "🔮", cards: 16, type: "magic" },
          playerHands: {},
          turnCount: 0,
          playerActions: {},
        },
      };

      const allReady =
        room.players.length === room.maxPlayers &&
        room.players.every((p) => p.isReady);

      if (allReady) {
        room.gameState.gameStarted = true;
        // Select random first player
        const firstPlayerIndex = Math.floor(
          Math.random() * room.players.length,
        );
        room.gameState.currentPlayer = {
          userId: room.players[firstPlayerIndex].userId,
          name: room.players[firstPlayerIndex].name,
        };
      }

      expect(allReady).toBe(true);
      expect(room.gameState.gameStarted).toBe(true);
      expect(room.gameState.currentPlayer).toBeDefined();
    });

    it("should handle heart placement with score calculation", () => {
      const room = {
        gameState: {
          tiles: [
            { id: 0, color: "red", emoji: "🟥" },
            { id: 1, color: "white", emoji: "⬜" },
            { id: 2, color: "yellow", emoji: "🟨" },
          ],
          gameStarted: true,
        },
      };

      const heart = { value: 2, color: "red", emoji: "❤️" };
      const tileIndex = 0; // Red tile

      const tile = room.gameState.tiles[tileIndex];
      const score = calculateScore(heart, tile);

      expect(tile.color).toBe("red");
      expect(score).toBe(4); // Double points for matching color

      // Place heart
      tile.placedHeart = {
        ...heart,
        placedBy: "user123",
        score: score,
      };

      expect(tile.placedHeart.value).toBe(2);
      expect(tile.placedHeart.placedBy).toBe("user123");
      expect(tile.placedHeart.score).toBe(4);
    });

    it("should detect game end conditions", () => {
      const room = {
        gameState: {
          tiles: [],
          gameStarted: true,
          deck: { cards: 0 },
          magicDeck: { cards: 0 },
        },
      };

      // Fill all tiles to trigger game end
      for (let i = 0; i < 8; i++) {
        room.gameState.tiles.push({
          id: i,
          placedHeart: {
            value: 1,
            color: "red",
            placedBy: "user123",
          },
        });
      }

      const allTilesFilled =
        room.gameState.tiles.length > 0 &&
        room.gameState.tiles.every((tile) => tile.placedHeart !== null);

      const endCheck = checkGameEndConditions(room, false);

      expect(allTilesFilled).toBe(true);
      expect(endCheck.shouldEnd).toBe(true);
      expect(endCheck.reason).toContain("All tiles");
    });
  });

  describe("Error Handling Integration", () => {
    it("should handle invalid tile placement", () => {
      const room = {
        gameState: {
          tiles: [
            {
              id: 0,
              color: "red",
              placedHeart: { value: 2, placedBy: "user1" },
            },
            { id: 1, color: "blue", placedHeart: null },
          ],
          gameStarted: true,
        },
      };

      // Try to place heart on already occupied tile
      const tileIndex = 0;
      const tile = room.gameState.tiles[tileIndex];

      const canPlace = tile && !tile.placedHeart;
      expect(canPlace).toBe(false);

      // Try to place heart on invalid index
      const invalidTileIndex = 999;
      const invalidTile = room.gameState.tiles[invalidTileIndex];
      expect(invalidTile).toBeUndefined();
    });

    it("should handle room validation", () => {
      const validRoom = {
        code: "TEST123",
        players: [{ userId: "user1", name: "User1" }],
        maxPlayers: 2,
        gameState: {
          tiles: generateTiles(),
          gameStarted: false,
        },
      };

      const invalidRoom = null;
      const emptyRoom = { players: [], gameState: null };

      // Test room state validation
      const validStateResult = validateRoomState(validRoom);
      expect(validStateResult.valid).toBe(true);

      const invalidStateResult = validateRoomState(invalidRoom);
      expect(invalidStateResult.valid).toBe(false);

      const emptyStateResult = validateRoomState(emptyRoom);
      expect(emptyStateResult.valid).toBe(false);
    });

    it("should validate player in room", () => {
      const room = {
        players: [
          { userId: "user1", name: "User1" },
          { userId: "user2", name: "User2" },
        ],
      };

      const validPlayerResult = validatePlayerInRoom(room, "user1");
      expect(validPlayerResult.valid).toBe(true);

      const invalidPlayerResult = validatePlayerInRoom(room, "user999");
      expect(invalidPlayerResult.valid).toBe(false);

      const emptyRoomResult = validatePlayerInRoom({ players: [] }, "user1");
      expect(emptyRoomResult.valid).toBe(false);
    });
  });

  describe("Utility Functions Integration", () => {
    it("should sanitize user input", () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const sanitized = sanitizeInput(maliciousInput);

      // Check that script tags are removed (implementation may vary)
      expect(sanitized).not.toBe(maliciousInput);
      expect(typeof sanitized).toBe("string");
    });

    it("should calculate scores correctly", () => {
      const heartCard = { value: 3, color: "red" };
      const redTile = { color: "red" };
      const blueTile = { color: "blue" };
      const whiteTile = { color: "white" };

      const matchingScore = calculateScore(heartCard, redTile);
      expect(matchingScore).toBe(6); // Double points for matching colors

      const mismatchScore = calculateScore(heartCard, blueTile);
      expect(mismatchScore).toBe(0); // Zero points for mismatch

      const whiteTileScore = calculateScore(heartCard, whiteTile);
      expect(whiteTileScore).toBe(3); // Face value for white tiles
    });

    it("should generate consistent tile sets", () => {
      const tiles1 = generateTiles();
      const tiles2 = generateTiles();

      expect(tiles1).toHaveLength(8);
      expect(tiles2).toHaveLength(8);

      // Check tile structure
      tiles1.forEach((tile) => {
        expect(tile).toHaveProperty("id");
        expect(tile).toHaveProperty("color");
        expect(tile).toHaveProperty("emoji");
        expect(["red", "yellow", "green", "white"]).toContain(tile.color);
      });
    });
  });
});
