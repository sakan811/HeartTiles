/**
 * Integration Tests for Win Condition Logic
 * Tests the critical discrepancy between documented and implemented win conditions
 */

import { describe, it, expect } from "vitest";
import { checkGameEndConditions } from "../../server.js";

describe("Win Condition Logic Integration Tests", () => {
  describe("Deck Empty Scenarios", () => {
    it("should NOT end game when ONLY heart deck is empty (corrected behavior)", () => {
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            // Not all tiles filled - only 4 of 8 tiles have hearts
            {
              id: 0,
              color: "red",
              placedHeart: { value: 2, color: "red", placedBy: "player1" },
            },
            {
              id: 1,
              color: "white",
              placedHeart: { value: 1, color: "yellow", placedBy: "player2" },
            },
            {
              id: 2,
              color: "green",
              placedHeart: { value: 3, color: "green", placedBy: "player1" },
            },
            {
              id: 3,
              color: "yellow",
              placedHeart: { value: 2, color: "red", placedBy: "player2" },
            },
            { id: 4, color: "red", placedHeart: null }, // Empty tile
            { id: 5, color: "white", placedHeart: null }, // Empty tile
            { id: 6, color: "green", placedHeart: null }, // Empty tile
            { id: 7, color: "yellow", placedHeart: null }, // Empty tile
          ],
          deck: { cards: 0 }, // Heart deck is empty
          magicDeck: { cards: 5 }, // Magic deck still has cards
        },
      };

      // Called from end-turn with false parameter (no grace period)
      const endCheck = checkGameEndConditions(room, false);

      // Game should continue since only one deck is empty (per documented rules)
      expect(endCheck.shouldEnd).toBe(false);
      expect(endCheck.reason).toBe(null);
    });

    it("should NOT end game when ONLY magic deck is empty (corrected behavior)", () => {
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            // Not all tiles filled - only 4 of 8 tiles have hearts
            {
              id: 0,
              color: "red",
              placedHeart: { value: 2, color: "red", placedBy: "player1" },
            },
            {
              id: 1,
              color: "white",
              placedHeart: { value: 1, color: "yellow", placedBy: "player2" },
            },
            {
              id: 2,
              color: "green",
              placedHeart: { value: 3, color: "green", placedBy: "player1" },
            },
            {
              id: 3,
              color: "yellow",
              placedHeart: { value: 2, color: "red", placedBy: "player2" },
            },
            { id: 4, color: "red", placedHeart: null }, // Empty tile
            { id: 5, color: "white", placedHeart: null }, // Empty tile
            { id: 6, color: "green", placedHeart: null }, // Empty tile
            { id: 7, color: "yellow", placedHeart: null }, // Empty tile
          ],
          deck: { cards: 5 }, // Heart deck still has cards
          magicDeck: { cards: 0 }, // Magic deck is empty
        },
      };

      // Called from end-turn with false parameter (no grace period)
      const endCheck = checkGameEndConditions(room, false);

      // Game should continue since only one deck is empty (per documented rules)
      expect(endCheck.shouldEnd).toBe(false);
      expect(endCheck.reason).toBe(null);
    });

    it("should detect game end when BOTH decks are empty (expected by both docs and implementation)", () => {
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            // Not all tiles filled - only 4 of 8 tiles have hearts
            {
              id: 0,
              color: "red",
              placedHeart: { value: 2, color: "red", placedBy: "player1" },
            },
            {
              id: 1,
              color: "white",
              placedHeart: { value: 1, color: "yellow", placedBy: "player2" },
            },
            {
              id: 2,
              color: "green",
              placedHeart: { value: 3, color: "green", placedBy: "player1" },
            },
            {
              id: 3,
              color: "yellow",
              placedHeart: { value: 2, color: "red", placedBy: "player2" },
            },
            { id: 4, color: "red", placedHeart: null }, // Empty tile
            { id: 5, color: "white", placedHeart: null }, // Empty tile
            { id: 6, color: "green", placedHeart: null }, // Empty tile
            { id: 7, color: "yellow", placedHeart: null }, // Empty tile
          ],
          deck: { cards: 0 }, // Heart deck is empty
          magicDeck: { cards: 0 }, // Magic deck is empty
        },
      };

      // Called from end-turn with false parameter (no grace period)
      const endCheck = checkGameEndConditions(room, false);

      expect(endCheck.shouldEnd).toBe(true);
      expect(endCheck.reason).toBe("Both decks are empty");
    });

    it("should verify the fix: documentation and implementation now match", () => {
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            // Not all tiles filled - only 4 of 8 tiles have hearts
            {
              id: 0,
              color: "red",
              placedHeart: { value: 2, color: "red", placedBy: "player1" },
            },
            {
              id: 1,
              color: "white",
              placedHeart: { value: 1, color: "yellow", placedBy: "player2" },
            },
            {
              id: 2,
              color: "green",
              placedHeart: { value: 3, color: "green", placedBy: "player1" },
            },
            {
              id: 3,
              color: "yellow",
              placedHeart: { value: 2, color: "red", placedBy: "player2" },
            },
            { id: 4, color: "red", placedHeart: null }, // Empty tile
            { id: 5, color: "white", placedHeart: null }, // Empty tile
            { id: 6, color: "green", placedHeart: null }, // Empty tile
            { id: 7, color: "yellow", placedHeart: null }, // Empty tile
          ],
          deck: { cards: 0 }, // Heart deck empty
          magicDeck: { cards: 8 }, // Magic deck still has plenty of cards
        },
      };

      const endCheck = checkGameEndConditions(room, false);

      // DOCUMENTED BEHAVIOR: Game should NOT end (only one deck empty)
      // IMPLEMENTED BEHAVIOR: Game should NOT end (only one deck empty) - NOW FIXED!

      expect(endCheck.shouldEnd).toBe(false);
      expect(endCheck.reason).toBe(null);

      // This test verifies the fix:
      // According to docs, game should continue until BOTH decks are empty
      // Implementation now correctly does the same
      console.log("✅ FIX VERIFIED:");
      console.log("   Documentation says: Game ends when BOTH decks are empty");
      console.log(
        "   Implementation now does: Game ends when BOTH decks are empty",
      );
      console.log("   The discrepancy has been resolved!");
    });
  });

  describe("Grace Period Behavior", () => {
    it("should allow game continuation during turn when deck becomes empty (grace period)", () => {
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            // Not all tiles filled
            {
              id: 0,
              color: "red",
              placedHeart: { value: 2, color: "red", placedBy: "player1" },
            },
            { id: 1, color: "white", placedHeart: null },
            { id: 2, color: "green", placedHeart: null },
            { id: 3, color: "yellow", placedHeart: null },
            { id: 4, color: "red", placedHeart: null },
            { id: 5, color: "white", placedHeart: null },
            { id: 6, color: "green", placedHeart: null },
            { id: 7, color: "yellow", placedHeart: null },
          ],
          deck: { cards: 0 }, // Heart deck empty
          magicDeck: { cards: 8 }, // Magic deck has cards
        },
      };

      // Called during turn with grace period enabled
      const endCheckWithGrace = checkGameEndConditions(room, true);

      // With grace period, game should continue during the turn
      expect(endCheckWithGrace.shouldEnd).toBe(false);
    });

    it("should continue game at turn end when only one deck is empty (no grace period)", () => {
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            // Not all tiles filled
            {
              id: 0,
              color: "red",
              placedHeart: { value: 2, color: "red", placedBy: "player1" },
            },
            { id: 1, color: "white", placedHeart: null },
            { id: 2, color: "green", placedHeart: null },
            { id: 3, color: "yellow", placedHeart: null },
            { id: 4, color: "red", placedHeart: null },
            { id: 5, color: "white", placedHeart: null },
            { id: 6, color: "green", placedHeart: null },
            { id: 7, color: "yellow", placedHeart: null },
          ],
          deck: { cards: 0 }, // Heart deck empty
          magicDeck: { cards: 8 }, // Magic deck has cards
        },
      };

      // Called at turn end with no grace period (this is what actually happens)
      const endCheckNoGrace = checkGameEndConditions(room, false);

      // With corrected logic - game continues when only one deck is empty
      expect(endCheckNoGrace.shouldEnd).toBe(false);
      expect(endCheckNoGrace.reason).toBe(null);
    });
  });

  describe("All Tiles Filled Scenario", () => {
    it("should end game when all tiles are filled regardless of deck state", () => {
      const room = {
        gameState: {
          gameStarted: true,
          tiles: [
            // All tiles filled with hearts
            {
              id: 0,
              color: "red",
              placedHeart: { value: 2, color: "red", placedBy: "player1" },
            },
            {
              id: 1,
              color: "white",
              placedHeart: { value: 1, color: "yellow", placedBy: "player2" },
            },
            {
              id: 2,
              color: "green",
              placedHeart: { value: 3, color: "green", placedBy: "player1" },
            },
            {
              id: 3,
              color: "yellow",
              placedHeart: { value: 2, color: "red", placedBy: "player2" },
            },
            {
              id: 4,
              color: "red",
              placedHeart: { value: 1, color: "yellow", placedBy: "player1" },
            },
            {
              id: 5,
              color: "white",
              placedHeart: { value: 3, color: "green", placedBy: "player2" },
            },
            {
              id: 6,
              color: "green",
              placedHeart: { value: 2, color: "red", placedBy: "player1" },
            },
            {
              id: 7,
              color: "yellow",
              placedHeart: { value: 1, color: "blue", placedBy: "player2" },
            },
          ],
          deck: { cards: 5 }, // Heart deck still has cards
          magicDeck: { cards: 8 }, // Magic deck still has cards
        },
      };

      const endCheck = checkGameEndConditions(room, false);

      expect(endCheck.shouldEnd).toBe(true);
      expect(endCheck.reason).toContain("All tiles are filled");
    });
  });
});
