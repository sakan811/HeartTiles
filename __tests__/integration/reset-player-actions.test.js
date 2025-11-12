/**
 * Integration tests for resetPlayerActions function from server.js
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { Room } from "../../models.js";
import { resetPlayerActions } from "../../server.js";
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
} from "../utils/server-test-utils.js";
import { createMockRoom, createMockUser } from "./setup.js";

let roomCode, userId1, userId2;

beforeAll(async () => {
  await connectToDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

beforeEach(async () => {
  await clearDatabase();

  userId1 = "user-id-1";
  userId2 = "user-id-2";
  roomCode = "TEST123";
});

describe("resetPlayerActions Integration Tests", () => {
  describe("Direct Function Tests", () => {
    it("should create playerActions object when missing", async () => {
      const room = new Room(createMockRoom(roomCode));
      room.gameState.playerActions = undefined;

      resetPlayerActions(room, userId1);

      expect(room.gameState.playerActions).toBeDefined();
      expect(room.gameState.playerActions[userId1]).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0,
      });
    });

    it("should reset existing user actions to defaults", async () => {
      const room = new Room(createMockRoom(roomCode));
      room.gameState.playerActions[userId1] = {
        drawnHeart: true,
        drawnMagic: true,
        heartsPlaced: 3,
        magicCardsUsed: 2,
      };

      resetPlayerActions(room, userId1);

      expect(room.gameState.playerActions[userId1]).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0,
      });
    });

    it("should not affect other users when resetting one user", async () => {
      const room = new Room(createMockRoom(roomCode));
      room.gameState.playerActions[userId1] = {
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 1,
        magicCardsUsed: 0,
      };
      room.gameState.playerActions[userId2] = {
        drawnHeart: false,
        drawnMagic: true,
        heartsPlaced: 2,
        magicCardsUsed: 1,
      };

      resetPlayerActions(room, userId1);

      expect(room.gameState.playerActions[userId1]).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0,
      });
      expect(room.gameState.playerActions[userId2]).toEqual({
        drawnHeart: false,
        drawnMagic: true,
        heartsPlaced: 2,
        magicCardsUsed: 1,
      });
    });

    it("should call markModified on Mongoose documents", async () => {
      const room = new Room(createMockRoom(roomCode));
      await room.save();

      let markModifiedCalled = false;
      let markModifiedPath = null;
      const originalMarkModified = room.markModified.bind(room);
      room.markModified = function (path) {
        markModifiedCalled = true;
        markModifiedPath = path;
        return originalMarkModified(path);
      };

      resetPlayerActions(room, userId1);

      expect(markModifiedCalled).toBe(true);
      expect(markModifiedPath).toBe("gameState.playerActions");
    });

    it("should work with plain objects (no markModified)", async () => {
      const plainRoom = {
        gameState: {
          gameStarted: true,
          playerActions: {
            [userId1]: { drawnHeart: true, drawnMagic: true, heartsPlaced: 2 },
          },
        },
      };

      expect(() => resetPlayerActions(plainRoom, userId1)).not.toThrow();

      expect(plainRoom.gameState.playerActions[userId1]).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0,
      });
    });
  });

  describe("Database Integration Tests", () => {
    it("should reset actions through room join and game flow", async () => {
      // Create room directly without socket complications
      const room = new Room(createMockRoom(roomCode));
      await room.save();

      // Simulate player joining by adding them to the room
      room.players.push({
        userId: userId1,
        name: "Test User 1",
        email: "test1@example.com",
        isReady: false,
        score: 0,
        joinedAt: new Date(),
      });
      await room.save();

      // Get room and verify player joined
      const savedRoom = await Room.findOne({ code: roomCode });
      expect(savedRoom).toBeTruthy();
      expect(savedRoom.players).toHaveLength(1);

      // Call resetPlayerActions directly on the room
      resetPlayerActions(savedRoom, userId1);

      // Verify actions were reset
      expect(savedRoom.gameState.playerActions[userId1]).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0,
      });
    });

    it("should handle multiple users with separate action tracking", async () => {
      // Create room with both users
      const room = new Room(createMockRoom(roomCode));
      room.players.push(
        {
          userId: userId1,
          name: "Test User 1",
          email: "test1@example.com",
          isReady: false,
          score: 0,
          joinedAt: new Date(),
        },
        {
          userId: userId2,
          name: "Test User 2",
          email: "test2@example.com",
          isReady: false,
          score: 0,
          joinedAt: new Date(),
        },
      );
      await room.save();

      // Get room and verify both players joined
      const savedRoom = await Room.findOne({ code: roomCode });
      expect(savedRoom.players).toHaveLength(2);

      // Set different action states for both users
      savedRoom.gameState.playerActions[userId1] = {
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 2,
      };
      savedRoom.gameState.playerActions[userId2] = {
        drawnHeart: false,
        drawnMagic: true,
        heartsPlaced: 1,
      };
      await savedRoom.save();

      // Reset only user1's actions
      resetPlayerActions(savedRoom, userId1);

      // Verify user1 was reset but user2 unchanged
      expect(savedRoom.gameState.playerActions[userId1]).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0,
      });
      expect(savedRoom.gameState.playerActions[userId2]).toEqual({
        drawnHeart: false,
        drawnMagic: true,
        heartsPlaced: 1,
      });
    });

    it("should persist reset actions to database", async () => {
      // Create room
      const room = new Room(createMockRoom(roomCode));
      room.players.push({
        userId: userId1,
        name: "Test User 1",
        email: "test1@example.com",
        isReady: false,
        score: 0,
        joinedAt: new Date(),
      });
      await room.save();

      // Get room from database
      const savedRoom = await Room.findOne({ code: roomCode });
      expect(savedRoom).toBeTruthy();

      // Set some initial actions
      savedRoom.gameState.playerActions[userId1] = {
        drawnHeart: true,
        drawnMagic: true,
        heartsPlaced: 3,
        magicCardsUsed: 1,
      };
      await savedRoom.save();

      // Reset actions
      resetPlayerActions(savedRoom, userId1);
      await savedRoom.save();

      // Fetch fresh from database to verify persistence
      const freshRoom = await Room.findOne({ code: roomCode });
      expect(freshRoom.gameState.playerActions[userId1]).toEqual({
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0,
      });
    });
  });
});
