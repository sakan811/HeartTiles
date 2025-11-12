// Integration tests for checkAndExpireShields function
import { describe, it, expect, vi } from "vitest";

// Import database utility functions from server-test-utils.js
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
} from "../utils/server-test-utils.js";

// Import the actual checkAndExpireShields function from server
import { checkAndExpireShields } from "../../server.js";

// Import helper functions from setup.js
import { createMockRoom } from "./setup.js";

describe("checkAndExpireShields Integration Tests", () => {
  beforeAll(async () => {
    // Connect to test database for integration tests
    await connectToDatabase();
  }, 30000);

  afterAll(async () => {
    // Disconnect from test database
    await disconnectDatabase();
  }, 30000);

  beforeEach(async () => {
    // Clear database before each test
    await clearDatabase();
  });

  test("should expire shield when remainingTurns reaches 0", () => {
    // Create a mock room with a shield that has 1 remaining turn
    const room = createMockRoom("SHIELD1");
    room.gameState.shields = {
      user1: { remainingTurns: 1, activatedOnTurn: 1 },
    };

    // Call checkAndExpireShields
    checkAndExpireShields(room);

    // Shield should be removed after reaching 0
    expect(room.gameState.shields.user1).toBeUndefined();
  });

  test("should decrement shield remainingTurns but keep shield if > 0", () => {
    const room = createMockRoom("SHIELD1");
    room.gameState.shields = {
      user1: { remainingTurns: 3, activatedOnTurn: 1 },
    };

    checkAndExpireShields(room);

    // Shield should have 2 remaining turns and still exist
    expect(room.gameState.shields.user1).toBeDefined();
    expect(room.gameState.shields.user1.remainingTurns).toBe(2);
  });

  test("should remove shields with remainingTurns <= 0", () => {
    const room = createMockRoom("SHIELD1");
    room.gameState.shields = {
      user1: { remainingTurns: 0, activatedOnTurn: 1 }, // Already at 0
      user2: { remainingTurns: -1, activatedOnTurn: 1 }, // Negative
      user3: { remainingTurns: 2, activatedOnTurn: 1 }, // Valid shield
    };

    checkAndExpireShields(room);

    // Shields with <= 0 should be removed, valid shield should remain with 1 turn
    expect(room.gameState.shields.user1).toBeUndefined();
    expect(room.gameState.shields.user2).toBeUndefined();
    expect(room.gameState.shields.user3).toBeDefined();
    expect(room.gameState.shields.user3.remainingTurns).toBe(1);
  });

  test("should remove invalid shield objects", () => {
    const room = createMockRoom("SHIELD1");
    room.gameState.shields = {
      user1: null, // null shield
      user2: undefined, // undefined shield
      user3: "invalid", // string instead of object
      user4: { activatedOnTurn: 1 }, // missing remainingTurns
      user5: { remainingTurns: "invalid" }, // non-numeric remainingTurns
      user6: { remainingTurns: 2, activatedOnTurn: 1 }, // Valid shield
    };

    checkAndExpireShields(room);

    // All invalid shields should be removed, only valid shield should remain
    expect(room.gameState.shields.user1).toBeUndefined();
    expect(room.gameState.shields.user2).toBeUndefined();
    expect(room.gameState.shields.user3).toBeUndefined();
    expect(room.gameState.shields.user4).toBeUndefined();
    expect(room.gameState.shields.user5).toBeUndefined();
    expect(room.gameState.shields.user6).toBeDefined();
    expect(room.gameState.shields.user6.remainingTurns).toBe(1);
  });

  test("should handle empty shields object gracefully", () => {
    const room = createMockRoom("SHIELD1");
    room.gameState.shields = {};

    // Should not throw error
    expect(() => {
      checkAndExpireShields(room);
    }).not.toThrow();

    // Shields should remain empty
    expect(Object.keys(room.gameState.shields)).toHaveLength(0);
  });

  test("should handle missing gameState.shields gracefully", () => {
    const room = createMockRoom("SHIELD1");
    delete room.gameState.shields;

    // Should not throw error
    expect(() => {
      checkAndExpireShields(room);
    }).not.toThrow();
  });

  test("should handle missing gameState gracefully", () => {
    const room = createMockRoom("SHIELD1");
    delete room.gameState;

    // Should not throw error
    expect(() => {
      checkAndExpireShields(room);
    }).not.toThrow();
  });

  test("should handle null room gracefully", () => {
    // Should not throw error
    expect(() => {
      checkAndExpireShields(null);
    }).not.toThrow();

    expect(() => {
      checkAndExpireShields(undefined);
    }).not.toThrow();
  });

  test("should handle non-object shields gracefully", () => {
    const room = createMockRoom("SHIELD1");

    // Set shields to non-object types
    room.gameState.shields = null;

    // Should not throw error
    expect(() => {
      checkAndExpireShields(room);
    }).not.toThrow();

    // Set shields to string
    room.gameState.shields = "invalid";

    expect(() => {
      checkAndExpireShields(room);
    }).not.toThrow();
  });

  test("should call markModified when available (Mongoose document)", () => {
    const room = createMockRoom("SHIELD1");

    // Mock a Mongoose document with markModified method
    room.markModified = vi.fn();

    room.gameState.shields = {
      user1: { remainingTurns: 0, activatedOnTurn: 1 },
    };

    checkAndExpireShields(room);

    // Should call markModified for the shields path
    expect(room.markModified).toHaveBeenCalledWith("gameState.shields");
  });

  test("should not call markModified when not available", () => {
    const room = createMockRoom("SHIELD1");

    // Ensure markModified is not a function
    delete room.markModified;

    room.gameState.shields = {
      user1: { remainingTurns: 0, activatedOnTurn: 1 },
    };

    // Should not throw error when markModified is not available
    expect(() => {
      checkAndExpireShields(room);
    }).not.toThrow();
  });

  test("should handle complex scenario with multiple shields of different states", () => {
    const room = createMockRoom("COMPLEX");
    room.gameState.shields = {
      activePlayer1: { remainingTurns: 5, activatedOnTurn: 10 },
      activePlayer2: { remainingTurns: 1, activatedOnTurn: 15 },
      expiringPlayer1: { remainingTurns: 0, activatedOnTurn: 8 },
      expiredPlayer2: { remainingTurns: -2, activatedOnTurn: 5 },
      invalidPlayer1: { remainingTurns: "3", activatedOnTurn: 12 }, // String number
      invalidPlayer2: { activatedOnTurn: 7 }, // Missing remainingTurns
      validPlayer3: { remainingTurns: 3, activatedOnTurn: 20 },
    };

    checkAndExpireShields(room);

    // Check results
    expect(room.gameState.shields.activePlayer1).toBeDefined();
    expect(room.gameState.shields.activePlayer1.remainingTurns).toBe(4);

    expect(room.gameState.shields.activePlayer2).toBeUndefined(); // Removed (0 turns)

    expect(room.gameState.shields.expiringPlayer1).toBeUndefined(); // Removed (0 turns)
    expect(room.gameState.shields.expiredPlayer2).toBeUndefined(); // Removed (negative)
    expect(room.gameState.shields.invalidPlayer1).toBeUndefined(); // Removed (invalid type)
    expect(room.gameState.shields.invalidPlayer2).toBeUndefined(); // Removed (missing field)

    expect(room.gameState.shields.validPlayer3).toBeDefined();
    expect(room.gameState.shields.validPlayer3.remainingTurns).toBe(2);
  });
});
