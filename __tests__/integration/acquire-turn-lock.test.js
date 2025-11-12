import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  acquireTurnLock,
  releaseTurnLock,
} from "../utils/server-test-utils.js";

describe("acquireTurnLock Integration Tests", () => {
  beforeEach(() => {
    // Clear any existing global turn locks
    if (global.turnLocks) {
      global.turnLocks.clear();
    } else {
      global.turnLocks = new Map();
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (global.turnLocks) {
      global.turnLocks.clear();
    }
  });

  describe("Basic Lock Functionality", () => {
    it("should acquire lock for first request", () => {
      const roomCode = "TEST123";
      const socketId = "socket-1";

      const result = acquireTurnLock(roomCode, socketId);

      expect(result).toBe(true);
      expect(global.turnLocks.has(roomCode)).toBe(true);

      const lock = global.turnLocks.get(roomCode);
      expect(lock.socketId).toBe(socketId);
      expect(typeof lock.timestamp).toBe("number");
      expect(lock.timestamp).toBeGreaterThan(0);
    });

    it("should reject second request for same room", () => {
      const roomCode = "TEST123";
      const socket1 = "socket-1";
      const socket2 = "socket-2";

      // First socket should acquire lock
      const firstResult = acquireTurnLock(roomCode, socket1);
      expect(firstResult).toBe(true);

      // Second socket should be rejected
      const secondResult = acquireTurnLock(roomCode, socket2);
      expect(secondResult).toBe(false);

      // Lock should still belong to first socket
      const lock = global.turnLocks.get(roomCode);
      expect(lock.socketId).toBe(socket1);
    });

    it("should allow different rooms to have concurrent locks", () => {
      const room1 = "ROOM1";
      const room2 = "ROOM2";
      const socket1 = "socket-1";
      const socket2 = "socket-2";

      // Both rooms should be able to acquire locks
      const result1 = acquireTurnLock(room1, socket1);
      const result2 = acquireTurnLock(room2, socket2);

      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // Both locks should exist
      expect(global.turnLocks.has(room1)).toBe(true);
      expect(global.turnLocks.has(room2)).toBe(true);
      expect(global.turnLocks.size).toBe(2);

      // Verify each lock belongs to correct socket
      const lock1 = global.turnLocks.get(room1);
      const lock2 = global.turnLocks.get(room2);
      expect(lock1.socketId).toBe(socket1);
      expect(lock2.socketId).toBe(socket2);
    });

    it("should allow same socket to acquire lock for different rooms", () => {
      const room1 = "ROOM1";
      const room2 = "ROOM2";
      const socketId = "socket-1";

      // Same socket should be able to acquire locks for different rooms
      const result1 = acquireTurnLock(room1, socketId);
      const result2 = acquireTurnLock(room2, socketId);

      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // Both locks should exist with same socket
      expect(global.turnLocks.size).toBe(2);
      expect(global.turnLocks.get(room1).socketId).toBe(socketId);
      expect(global.turnLocks.get(room2).socketId).toBe(socketId);
    });
  });

  describe("Lock Expiration", () => {
    it("should expire locks after 30 seconds", () => {
      const roomCode = "TEST123";
      const socket1 = "socket-1";
      const socket2 = "socket-2";

      // First socket acquires lock
      const firstResult = acquireTurnLock(roomCode, socket1);
      expect(firstResult).toBe(true);

      // Verify lock exists
      expect(global.turnLocks.has(roomCode)).toBe(true);
      const originalLock = global.turnLocks.get(roomCode);

      // Manually set lock timestamp to be older than 30 seconds
      const thirtyOneSecondsAgo = Date.now() - 31 * 1000;
      originalLock.timestamp = thirtyOneSecondsAgo;
      global.turnLocks.set(roomCode, originalLock);

      // Second socket should now be able to acquire lock
      const secondResult = acquireTurnLock(roomCode, socket2);
      expect(secondResult).toBe(true);

      // Verify new lock was acquired
      expect(global.turnLocks.has(roomCode)).toBe(true);
      const newLock = global.turnLocks.get(roomCode);
      expect(newLock.socketId).toBe(socket2);
      expect(newLock.timestamp).toBeGreaterThan(thirtyOneSecondsAgo);
    });

    it("should not expire locks that are less than 30 seconds old", () => {
      const roomCode = "TEST123";
      const socket1 = "socket-1";
      const socket2 = "socket-2";

      // First socket acquires lock
      const firstResult = acquireTurnLock(roomCode, socket1);
      expect(firstResult).toBe(true);

      // Verify lock exists
      expect(global.turnLocks.has(roomCode)).toBe(true);
      const originalLock = global.turnLocks.get(roomCode);

      // Set lock timestamp to be 29 seconds ago (should not expire)
      const twentyNineSecondsAgo = Date.now() - 29 * 1000;
      originalLock.timestamp = twentyNineSecondsAgo;
      global.turnLocks.set(roomCode, originalLock);

      // Second socket should still be rejected
      const secondResult = acquireTurnLock(roomCode, socket2);
      expect(secondResult).toBe(false);

      // Verify original lock is still intact
      expect(global.turnLocks.has(roomCode)).toBe(true);
      const currentLock = global.turnLocks.get(roomCode);
      expect(currentLock.socketId).toBe(socket1);
      expect(currentLock.timestamp).toBe(twentyNineSecondsAgo);
    });

    it("should handle exact 30 second boundary", () => {
      const roomCode = "TEST123";
      const socket1 = "socket-1";
      const socket2 = "socket-2";

      // First socket acquires lock
      const firstResult = acquireTurnLock(roomCode, socket1);
      expect(firstResult).toBe(true);

      const originalLock = global.turnLocks.get(roomCode);

      // Set lock timestamp to be exactly 30 seconds ago
      const thirtySecondsAgo = Date.now() - 30 * 1000;
      originalLock.timestamp = thirtySecondsAgo;
      global.turnLocks.set(roomCode, originalLock);

      // At exactly 30 seconds, lock should still be valid (only expires when > 30 seconds)
      const secondResult = acquireTurnLock(roomCode, socket2);
      expect(secondResult).toBe(false);

      // Verify original lock is still intact
      const currentLock = global.turnLocks.get(roomCode);
      expect(currentLock.socketId).toBe(socket1);
      expect(currentLock.timestamp).toBe(thirtySecondsAgo);
    });
  });

  describe("Lock Release and Reacquisition", () => {
    it("should allow lock reacquisition after release", () => {
      const roomCode = "TEST123";
      const socket1 = "socket-1";
      const socket2 = "socket-2";

      // First socket acquires lock
      const firstResult = acquireTurnLock(roomCode, socket1);
      expect(firstResult).toBe(true);

      // Release lock
      releaseTurnLock(roomCode, socket1);

      // Lock should be released
      expect(global.turnLocks.has(roomCode)).toBe(false);

      // Second socket should now be able to acquire lock
      const secondResult = acquireTurnLock(roomCode, socket2);
      expect(secondResult).toBe(true);

      // Verify new lock was acquired
      expect(global.turnLocks.has(roomCode)).toBe(true);
      const newLock = global.turnLocks.get(roomCode);
      expect(newLock.socketId).toBe(socket2);
    });

    it("should not allow wrong socket to release lock", () => {
      const roomCode = "TEST123";
      const socket1 = "socket-1";
      const socket2 = "socket-2";
      const socket3 = "socket-3";

      // First socket acquires lock
      const firstResult = acquireTurnLock(roomCode, socket1);
      expect(firstResult).toBe(true);

      // Wrong socket tries to release lock (should not release)
      releaseTurnLock(roomCode, socket3);

      // Lock should still exist and belong to socket1
      expect(global.turnLocks.has(roomCode)).toBe(true);
      const lock = global.turnLocks.get(roomCode);
      expect(lock.socketId).toBe(socket1);

      // Second socket should still be rejected
      const secondResult = acquireTurnLock(roomCode, socket2);
      expect(secondResult).toBe(false);
    });

    it("should allow same socket to reacquire lock after release", () => {
      const roomCode = "TEST123";
      const socket1 = "socket-1";

      // Socket acquires lock
      const firstResult = acquireTurnLock(roomCode, socket1);
      expect(firstResult).toBe(true);

      // Release lock
      releaseTurnLock(roomCode, socket1);

      // Same socket should be able to acquire lock again
      const secondResult = acquireTurnLock(roomCode, socket1);
      expect(secondResult).toBe(true);

      // Verify lock was reacquired
      expect(global.turnLocks.has(roomCode)).toBe(true);
      const lock = global.turnLocks.get(roomCode);
      expect(lock.socketId).toBe(socket1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty roomCode", () => {
      const socketId = "socket-1";

      // Empty room code should still work
      const result = acquireTurnLock("", socketId);
      expect(result).toBe(true);
      expect(global.turnLocks.has("")).toBe(true);
    });

    // Note: The acquireTurnLock function has specific behavior with null/undefined inputs
    // that may vary based on implementation details. The core functionality is tested above.

    it("should handle empty socketId", () => {
      const roomCode = "TEST123";

      // Empty socket ID should still work
      const result = acquireTurnLock(roomCode, "");
      expect(result).toBe(true);
      expect(global.turnLocks.has(roomCode)).toBe(true);

      const lock = global.turnLocks.get(roomCode);
      expect(lock.socketId).toBe("");
    });

    it("should handle global turnLocks map missing", () => {
      // Temporarily remove global turnLocks
      const originalLocks = global.turnLocks;
      delete global.turnLocks;

      const roomCode = "TEST123";
      const socketId = "socket-1";

      // Should still work by falling back to module-level locks
      const result = acquireTurnLock(roomCode, socketId);
      expect(result).toBe(true);

      // Restore global turnLocks for cleanup
      global.turnLocks = originalLocks;
    });

    it("should handle multiple rapid acquisitions and releases", () => {
      const roomCode = "TEST123";
      const socket1 = "socket-1";
      const socket2 = "socket-2";

      // Rapid cycle of acquire and release
      for (let i = 0; i < 10; i++) {
        const result = acquireTurnLock(roomCode, socket1);
        expect(result).toBe(true);
        releaseTurnLock(roomCode, socket1);
        expect(global.turnLocks.has(roomCode)).toBe(false);
      }

      // Final acquisition should still work
      const finalResult = acquireTurnLock(roomCode, socket2);
      expect(finalResult).toBe(true);
      expect(global.turnLocks.get(roomCode).socketId).toBe(socket2);
    });
  });

  describe("Concurrency Simulation", () => {
    it("should handle concurrent lock requests correctly", async () => {
      const roomCode = "TEST123";
      const socketIds = Array.from({ length: 10 }, (_, i) => `socket-${i}`);

      // Simulate concurrent lock requests
      const promises = socketIds.map(
        (socketId) =>
          new Promise((resolve) => {
            setTimeout(() => {
              const result = acquireTurnLock(roomCode, socketId);
              resolve({ socketId, result });
            }, Math.random() * 10); // Random delay up to 10ms
          }),
      );

      const results = await Promise.all(promises);

      // Only one should succeed
      const successfulResults = results.filter((r) => r.result);
      expect(successfulResults.length).toBe(1);

      // The winner should have the lock
      const winner = successfulResults[0];
      expect(global.turnLocks.has(roomCode)).toBe(true);
      expect(global.turnLocks.get(roomCode).socketId).toBe(winner.socketId);
    });

    it("should handle different rooms concurrently", async () => {
      const roomCodes = ["ROOM1", "ROOM2", "ROOM3"];
      const socketIds = ["socket-1", "socket-2", "socket-3"];

      // Simulate concurrent lock requests for different rooms
      const promises = roomCodes.map(
        (roomCode, index) =>
          new Promise((resolve) => {
            setTimeout(() => {
              const result = acquireTurnLock(roomCode, socketIds[index]);
              resolve({ roomCode, socketId: socketIds[index], result });
            }, Math.random() * 10);
          }),
      );

      const results = await Promise.all(promises);

      // All should succeed since they're different rooms
      results.forEach(({ roomCode, socketId, result }) => {
        expect(result).toBe(true);
        expect(global.turnLocks.has(roomCode)).toBe(true);
        expect(global.turnLocks.get(roomCode).socketId).toBe(socketId);
      });

      expect(global.turnLocks.size).toBe(3);
    });
  });
});
