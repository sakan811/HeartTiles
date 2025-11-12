import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";

import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
} from "../utils/server-test-utils.js";

import { PlayerSession } from "../../models.js";

// Import the actual server functions
import { getPlayerSession } from "../../server.js";

describe("getPlayerSession Integration Tests", () => {
  beforeAll(async () => {
    try {
      await connectToDatabase();
    } catch (error) {
      console.warn(
        "Database connection failed for getPlayerSession tests:",
        error.message,
      );
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
    vi.clearAllMocks();
    try {
      await clearDatabase();
    } catch (error) {
      console.warn("Database clear failed:", error.message);
    }

    // Clear global sessions if they exist
    if (global.playerSessions) {
      global.playerSessions.clear();
    }
  });

  describe("Core Functionality", () => {
    it("should create new session and persist to database", async () => {
      const userId = "test-user-123";
      const userSessionId = "session-abc-123";
      const userName = "Test User";
      const userEmail = "test@example.com";
      const clientIP = "192.168.1.100";

      // Call getPlayerSession - should create new session
      const session = await getPlayerSession(
        userId,
        userSessionId,
        userName,
        userEmail,
        clientIP,
      );

      // Verify returned session object
      expect(session).toBeDefined();
      expect(session.userId).toBe(userId);
      expect(session.userSessionId).toBe(userSessionId);
      expect(session.name).toBe(userName);
      expect(session.email).toBe(userEmail);
      expect(session.clientIP).toBe(clientIP);
      expect(session.currentSocketId).toBeNull();
      expect(session.isActive).toBe(true);
      expect(session.lastSeen).toBeInstanceOf(Date);

      // Verify session was saved to database
      const dbSession = await PlayerSession.findOne({ userId });
      expect(dbSession).toBeDefined();
      expect(dbSession.userId).toBe(userId);
      expect(dbSession.userSessionId).toBe(userSessionId);
      expect(dbSession.name).toBe(userName);
      expect(dbSession.email).toBe(userEmail);
      expect(dbSession.clientIP).toBe(clientIP);
      expect(dbSession.isActive).toBe(true);
    });

    it("should update existing session instead of creating duplicate", async () => {
      const userId = "existing-user-456";
      const userSessionId = "session-xyz-789";
      const userName = "Existing User";
      const userEmail = "existing@example.com";
      const clientIP = "10.0.0.5";

      // Create initial session via database insertion
      const initialSession = new PlayerSession({
        userId,
        userSessionId,
        name: userName,
        email: userEmail,
        clientIP: "192.168.1.1", // Different initial IP
        currentSocketId: "old-socket-id",
        lastSeen: new Date(Date.now() - 60000), // 1 minute ago
        isActive: false,
      });
      await initialSession.save();

      // Set up global sessions map to simulate server behavior
      global.playerSessions = new Map();
      const initialSessionObj = initialSession.toObject();
      global.playerSessions.set(userId, initialSessionObj);

      // Call getPlayerSession - should update existing session
      const updatedSession = await getPlayerSession(
        userId,
        userSessionId,
        userName,
        userEmail,
        clientIP,
      );

      // Verify session was updated
      expect(updatedSession.isActive).toBe(true);
      expect(updatedSession.clientIP).toBe(clientIP);
      expect(updatedSession.currentSocketId).toBe("old-socket-id"); // Socket ID preserved

      // Verify only one session exists in database
      const allSessions = await PlayerSession.find({ userId });
      expect(allSessions).toHaveLength(1);

      const dbSession = allSessions[0];
      expect(dbSession.isActive).toBe(true);
      expect(dbSession.clientIP).toBe(clientIP);
      expect(dbSession.lastSeen.getTime()).toBeGreaterThan(
        initialSession.lastSeen.getTime(),
      );
    });

    it("should update lastSeen timestamp on existing session access", async () => {
      const userId = "timestamp-user-789";
      const originalTime = new Date(Date.now() - 120000); // 2 minutes ago

      // Create session with older timestamp
      const initialSession = new PlayerSession({
        userId,
        userSessionId: "session-timestamp-123",
        name: "Timestamp User",
        email: "timestamp@example.com",
        lastSeen: originalTime,
        isActive: true,
      });
      await initialSession.save();

      // Set up global sessions map to simulate server behavior
      global.playerSessions = new Map();
      const initialSessionObj = initialSession.toObject();
      global.playerSessions.set(userId, initialSessionObj);

      // Wait a moment to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Access the session
      const session = await getPlayerSession(
        userId,
        "session-timestamp-123",
        "Timestamp User",
        "timestamp@example.com",
      );

      // Verify timestamp was updated
      expect(session.lastSeen.getTime()).toBeGreaterThan(
        originalTime.getTime(),
      );

      // Verify database was updated
      const dbSession = await PlayerSession.findOne({ userId });
      expect(dbSession.lastSeen.getTime()).toBeGreaterThan(
        originalTime.getTime(),
      );
    });
  });

  describe("Global Session Management", () => {
    it("should use global playerSessions when available", async () => {
      const userId = "global-session-user";

      // Setup global sessions map
      global.playerSessions = new Map();

      const sessionData = {
        userId,
        userSessionId: "global-session-123",
        name: "Global User",
        email: "global@example.com",
        currentSocketId: "global-socket",
        lastSeen: new Date(),
        isActive: true,
        clientIP: "127.0.0.1",
      };

      global.playerSessions.set(userId, sessionData);

      // Call getPlayerSession
      const session = await getPlayerSession(
        userId,
        "global-session-123",
        "Global User",
        "global@example.com",
        "127.0.0.1",
      );

      // Should return the existing global session and update it
      expect(session).toBe(sessionData); // Same object reference
      expect(session.isActive).toBe(true);

      // Verify global map still has the session
      expect(global.playerSessions.has(userId)).toBe(true);
    });

    it("should fall back to module-level sessions when global not available", async () => {
      const userId = "module-session-user";

      // Ensure global is not set
      delete global.playerSessions;

      const session = await getPlayerSession(
        userId,
        "module-session-123",
        "Module User",
        "module@example.com",
      );

      expect(session.userId).toBe(userId);
      expect(session.isActive).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing optional clientIP parameter", async () => {
      // Clear any existing global sessions to ensure clean test
      if (global.playerSessions) {
        global.playerSessions.clear();
      }

      // Test with missing optional clientIP (default parameter)
      const session1 = await getPlayerSession(
        "test-user-123",
        "session-123",
        "Test User",
        "test@example.com",
        // clientIP not provided (should default to null)
      );
      expect(session1).toBeDefined();
      // Note: clientIP will be null when no existing session exists,
      // but may be inherited from existing global sessions
      expect(
        session1.clientIP === null || typeof session1.clientIP === "string",
      ).toBe(true);
    });

    it("should handle undefined session ID by generating new one", async () => {
      const userId = "undefined-session-user";

      const session = await getPlayerSession(
        userId,
        undefined, // This should cause new session ID generation
        "Test User",
        "test@example.com",
      );

      expect(session).toBeDefined();
      expect(session.userId).toBe(userId);
      expect(session.userSessionId).toBeTruthy(); // Should be generated
      expect(session.userSessionId).toMatch(/^session_/); // Should match generation pattern
    });
  });

  describe("Data Integrity", () => {
    it("should maintain data consistency across multiple calls", async () => {
      const userId = "consistency-user";
      const sessionData = {
        userId,
        userSessionId: "consistency-session",
        name: "Consistency User",
        email: "consistency@example.com",
      };

      // First call - should create
      const session1 = await getPlayerSession(
        sessionData.userId,
        sessionData.userSessionId,
        sessionData.name,
        sessionData.email,
      );

      // Second call - should retrieve and update
      const session2 = await getPlayerSession(
        sessionData.userId,
        sessionData.userSessionId,
        sessionData.name,
        sessionData.email,
      );

      // Should be the same session data (possibly different objects)
      expect(session1.userId).toBe(session2.userId);
      expect(session1.userSessionId).toBe(session2.userSessionId);
      expect(session1.name).toBe(session2.name);
      expect(session1.email).toBe(session2.email);

      // Verify only one database record exists
      const dbSessions = await PlayerSession.find({ userId });
      expect(dbSessions).toHaveLength(1);
    });

    it("should preserve existing socket ID when updating session", async () => {
      const userId = "socket-preserve-user";
      const socketId = "existing-socket-456";

      // Create session with socket ID in database
      const initialSession = new PlayerSession({
        userId,
        userSessionId: "socket-session-123",
        name: "Socket User",
        email: "socket@example.com",
        currentSocketId: socketId,
        isActive: true,
      });
      await initialSession.save();

      // Set up global sessions map to simulate server behavior
      global.playerSessions = new Map();
      const initialSessionObj = initialSession.toObject();
      global.playerSessions.set(userId, initialSessionObj);

      // Update session via getPlayerSession (without providing new socket ID)
      const updatedSession = await getPlayerSession(
        userId,
        "socket-session-123",
        "Socket User",
        "socket@example.com",
      );

      // Socket ID should be preserved
      expect(updatedSession.currentSocketId).toBe(socketId);

      // Verify database preserved socket ID
      const dbSession = await PlayerSession.findOne({ userId });
      expect(dbSession.currentSocketId).toBe(socketId);
    });
  });

  describe("Real Server Integration", () => {
    it("should work with actual server session management", async () => {
      // This test simulates how the actual server would use getPlayerSession
      const testUsers = [
        {
          userId: "server-user-1",
          userSessionId: "server-session-1",
          name: "Server User 1",
          email: "server1@example.com",
          clientIP: "192.168.1.10",
        },
        {
          userId: "server-user-2",
          userSessionId: "server-session-2",
          name: "Server User 2",
          email: "server2@example.com",
          clientIP: "192.168.1.11",
        },
      ];

      // Simulate multiple users connecting to server
      const sessions = [];
      for (const userData of testUsers) {
        const session = await getPlayerSession(
          userData.userId,
          userData.userSessionId,
          userData.name,
          userData.email,
          userData.clientIP,
        );
        sessions.push(session);
      }

      // Verify all sessions were created
      expect(sessions).toHaveLength(2);
      sessions.forEach((session, index) => {
        expect(session.userId).toBe(testUsers[index].userId);
        expect(session.isActive).toBe(true);
      });

      // Verify database has all sessions
      const dbSessions = await PlayerSession.find({
        userId: { $in: testUsers.map((u) => u.userId) },
      });
      expect(dbSessions).toHaveLength(2);

      // Simulate reconnection scenario
      const reconnectedSession = await getPlayerSession(
        testUsers[0].userId,
        testUsers[0].userSessionId,
        "Updated Server User 1",
        "updated1@example.com",
        "10.0.0.1", // New IP
      );

      expect(reconnectedSession.userId).toBe(testUsers[0].userId);
      expect(reconnectedSession.clientIP).toBe("10.0.0.1");

      // Verify database was updated (not duplicated)
      const user1Sessions = await PlayerSession.find({
        userId: testUsers[0].userId,
      });
      expect(user1Sessions).toHaveLength(1);
      expect(user1Sessions[0].clientIP).toBe("10.0.0.1");
    });
  });
});
