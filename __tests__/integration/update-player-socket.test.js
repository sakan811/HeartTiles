/**
 * Integration tests for updatePlayerSocket function
 * Tests real server session update functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
} from "../utils/server-test-utils.js";
import { PlayerSession } from "../../models.js";

describe("updatePlayerSocket integration", () => {
  let testUser;

  beforeAll(async () => {
    try {
      await connectToDatabase();
    } catch (error) {
      console.warn("Database connection failed for updatePlayerSocket tests:", error.message);
    }
  });

  afterAll(async () => {
    try {
      await disconnectDatabase();
    } catch (error) {
      console.warn("Database disconnection failed:", error.message);
    }
  });

  beforeEach(async () => {
    try {
      await clearDatabase();
    } catch (error) {
      console.warn("Database clear failed:", error.message);
    }

    // Clear global sessions if they exist
    if (global.playerSessions) {
      global.playerSessions.clear();
    }

    // Reset test user data
    testUser = {
      userId: "socket-test-user-123",
      userSessionId: "session-socket-test-123",
      userName: "SocketTestUser",
      userEmail: "sockettest@example.com",
      clientIP: "127.0.0.1",
    };
  });

  it("should update player socket and return session", async () => {
    const { updatePlayerSocket } = await import("../../server.js");

    const socketId = "new-socket-id-123";
    const session = await updatePlayerSocket(
      testUser.userId,
      socketId,
      testUser.userSessionId,
      testUser.userName,
      testUser.userEmail,
      testUser.clientIP,
    );

    expect(session).toBeDefined();
    expect(session.currentSocketId).toBe(socketId);
    expect(session.userId).toBe(testUser.userId);
    expect(session.isActive).toBe(true);
    expect(session.clientIP).toBe(testUser.clientIP);
    expect(session.lastSeen).toBeInstanceOf(Date);
  });

  it("should create new session if none exists", async () => {
    const { updatePlayerSocket } = await import("../../server.js");

    const newUserId = "new-socket-user-456";
    const socketId = "brand-new-socket-456";

    const session = await updatePlayerSocket(
      newUserId,
      socketId,
      "new-session-456",
      "NewUser",
      "newuser@example.com",
    );

    expect(session.currentSocketId).toBe(socketId);
    expect(session.userId).toBe(newUserId);
    expect(session.isActive).toBe(true);
    expect(session.name).toBe("NewUser");
    expect(session.email).toBe("newuser@example.com");
  });

  it("should update existing session with new socket", async () => {
    const { updatePlayerSocket } = await import("../../server.js");

    // First update to create session
    await updatePlayerSocket(
      testUser.userId,
      "initial-socket",
      testUser.userSessionId,
      testUser.userName,
      testUser.userEmail,
    );

    // Update with new socket
    const newSocketId = "updated-socket-789";
    const session = await updatePlayerSocket(
      testUser.userId,
      newSocketId,
      testUser.userSessionId,
      testUser.userName,
      testUser.userEmail,
    );

    expect(session.currentSocketId).toBe(newSocketId);
    expect(session.isActive).toBe(true);
    expect(session.lastSeen).toBeInstanceOf(Date);
  });

  it("should update clientIP when provided", async () => {
    const { updatePlayerSocket } = await import("../../server.js");

    const newIP = "192.168.1.100";
    const socketId = "socket-with-ip-update";

    const session = await updatePlayerSocket(
      testUser.userId,
      socketId,
      testUser.userSessionId,
      testUser.userName,
      testUser.userEmail,
      newIP,
    );

    expect(session.clientIP).toBe(newIP);
    expect(session.currentSocketId).toBe(socketId);
  });

  it("should persist session to database", async () => {
    const { updatePlayerSocket } = await import("../../server.js");

    const socketId = "persist-socket-test";

    await updatePlayerSocket(
      testUser.userId,
      socketId,
      testUser.userSessionId,
      testUser.userName,
      testUser.userEmail,
    );

    // Verify session was saved to database
    const savedSession = await PlayerSession.findOne({ userId: testUser.userId });
    expect(savedSession).toBeTruthy();
    expect(savedSession.currentSocketId).toBe(socketId);
    expect(savedSession.isActive).toBe(true);
  });

  it("should handle concurrent socket updates correctly", async () => {
    const { updatePlayerSocket } = await import("../../server.js");
    const promises = [];

    // Simulate concurrent updates for DIFFERENT users
    for (let i = 0; i < 5; i++) {
      promises.push(
        updatePlayerSocket(
          `concurrent-user-${i}`, // Different user IDs
          `socket-${i}`,
          `session-${i}`,
          `User${i}`,
          `user${i}@example.com`,
          `127.0.0.${i}`,
        )
      );
    }

    const sessions = await Promise.all(promises);

    // All should succeed and return valid sessions
    sessions.forEach((session, i) => {
      expect(session.currentSocketId).toBe(`socket-${i}`);
      expect(session.isActive).toBe(true);
      expect(session.clientIP).toBe(`127.0.0.${i}`);
      expect(session.userId).toBe(`concurrent-user-${i}`);
    });
  });

  it("should maintain session data across multiple updates", async () => {
    const { updatePlayerSocket } = await import("../../server.js");

    const userId = "maintain-data-user";
    const originalData = {
      userSessionId: "original-session",
      userName: "OriginalUser",
      userEmail: "original@example.com",
      clientIP: "10.0.0.1",
    };

    // Create initial session
    await updatePlayerSocket(userId, "socket-1", ...Object.values(originalData));

    // Update only socket ID
    const updatedSession = await updatePlayerSocket(
      userId,
      "socket-2-updated",
      originalData.userSessionId,
      originalData.userName,
      originalData.userEmail,
    );

    // Should maintain original data except for updated socket
    expect(updatedSession.currentSocketId).toBe("socket-2-updated");
    expect(updatedSession.userId).toBe(userId);
    expect(updatedSession.userSessionId).toBe(originalData.userSessionId);
    expect(updatedSession.name).toBe(originalData.userName);
    expect(updatedSession.email).toBe(originalData.userEmail);
    expect(updatedSession.clientIP).toBe(originalData.clientIP);
    expect(updatedSession.isActive).toBe(true);
  });
});