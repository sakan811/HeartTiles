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
import mongoose from "mongoose";
import { getToken } from "next-auth/jwt";

// Import real server functions for integration testing
import serverModule, { authenticateSocket } from "../../server.js";
import { User } from "../../models.js";

// Import test utilities
import {
  createMockSocket,
  createMockUser,
} from "./setup.js";
import {
  connectToDatabase,
  clearDatabase,
  disconnectDatabase,
} from "../utils/server-test-utils.js";

describe("authenticateSocket Integration Tests", () => {
  let testUser;
  let validObjectId;
  let mockNext;

  beforeAll(async () => {
    await connectToDatabase();
    // Generate a valid ObjectId for testing
    validObjectId = new mongoose.Types.ObjectId().toString();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    // Create a test user in the database
    testUser = await User.create({
      _id: validObjectId,
      name: "Test User",
      email: "test@example.com",
      password: "hashedpassword123",
    });

    // Mock the next function
    mockNext = vi.fn();

    // Reset process.env.AUTH_SECRET for tests
    process.env.AUTH_SECRET = "test-secret-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Valid Authentication Scenarios", () => {
    it("should authenticate socket with valid token and existing user", async () => {
      // Mock successful token retrieval
      vi.mocked(getToken).mockResolvedValue({
        id: validObjectId,
        email: "test@example.com",
        name: "Test User",
        jti: "session-123",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));

      // Verify socket data is set correctly
      expect(mockSocket.data.userId).toBe(validObjectId);
      expect(mockSocket.data.userEmail).toBe("test@example.com");
      expect(mockSocket.data.userName).toBe("Test User");
      expect(mockSocket.data.userSessionId).toBe("session-123");
    });

    it("should work with different valid user data", async () => {
      const anotherUserId = new mongoose.Types.ObjectId().toString();
      await User.create({
        _id: anotherUserId,
        name: "Another User",
        email: "another@example.com",
        password: "hashedpassword456",
      });

      vi.mocked(getToken).mockResolvedValue({
        id: anotherUserId,
        email: "another@example.com",
        name: "Another User",
        jti: "session-456",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.data.userId).toBe(anotherUserId);
      expect(mockSocket.data.userEmail).toBe("another@example.com");
      expect(mockSocket.data.userName).toBe("Another User");
    });
  });

  describe("Invalid Token Scenarios", () => {
    it("should reject authentication when token is null", async () => {
      vi.mocked(getToken).mockResolvedValue(null);

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Authentication required")
      );
    });

    it("should reject authentication when token is undefined", async () => {
      vi.mocked(getToken).mockResolvedValue(undefined);

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Authentication required")
      );
    });

    it("should reject authentication when token has no id", async () => {
      vi.mocked(getToken).mockResolvedValue({
        email: "test@example.com",
        name: "Test User",
        jti: "session-123",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Authentication required")
      );
    });

    it("should reject authentication when token.id is empty string", async () => {
      vi.mocked(getToken).mockResolvedValue({
        id: "",
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Authentication required")
      );
    });
  });

  describe("Invalid User ID Format Scenarios", () => {
    it("should reject authentication with invalid ObjectId format", async () => {
      vi.mocked(getToken).mockResolvedValue({
        id: "invalid-object-id",
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Invalid user ID format")
      );
    });

    it("should reject authentication with non-string user ID", async () => {
      vi.mocked(getToken).mockResolvedValue({
        id: 123,
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      // When non-string ID reaches database lookup, it throws a CastError
      // which is caught and converted to "Authentication failed"
      expect(mockNext).toHaveBeenCalledWith(
        new Error("Authentication failed")
      );
    });

    it("should reject authentication with null user ID", async () => {
      vi.mocked(getToken).mockResolvedValue({
        id: null,
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Authentication required")
      );
    });

    it("should reject authentication with ObjectId-like but invalid string", async () => {
      vi.mocked(getToken).mockResolvedValue({
        id: "507f1f77bcf86cd7994390", // Too short for valid ObjectId
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Invalid user ID format")
      );
    });
  });

  describe("Non-existent User Scenarios", () => {
    it("should reject authentication when user does not exist in database", async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      vi.mocked(getToken).mockResolvedValue({
        id: nonExistentId,
        email: "nonexistent@example.com",
        name: "Non-existent User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("User not found")
      );
    });

    it("should reject authentication when user was deleted", async () => {
      // Delete the user we created in beforeEach
      await User.findByIdAndDelete(validObjectId);

      vi.mocked(getToken).mockResolvedValue({
        id: validObjectId,
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("User not found")
      );
    });
  });

  describe("Error Handling Scenarios", () => {
    it("should handle getToken function throwing an error", async () => {
      vi.mocked(getToken).mockRejectedValue(
        new Error("Token verification failed")
      );

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Authentication failed")
      );
    });

    it("should handle database connection errors", async () => {
      // Mock User.findById to throw a database error
      const originalFindById = User.findById;
      User.findById = vi.fn().mockRejectedValue(
        new Error("Database connection failed")
      );

      vi.mocked(getToken).mockResolvedValue({
        id: validObjectId,
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new Error("Authentication failed")
      );

      // Restore original method
      User.findById = originalFindById;
    });

    it("should handle malformed socket handshake object", async () => {
      vi.mocked(getToken).mockResolvedValue({
        id: validObjectId,
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = {
        data: {},
        handshake: null, // Malformed handshake
      };

      await authenticateSocket(mockSocket, mockNext);

      // The function should handle the malformed handshake gracefully
      // and still complete authentication since getToken succeeded
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("Edge Cases", () => {
    it("should handle authentication when AUTH_SECRET is not set", async () => {
      // Remove AUTH_SECRET
      delete process.env.AUTH_SECRET;

      vi.mocked(getToken).mockResolvedValue({
        id: validObjectId,
        email: "test@example.com",
        name: "Test User",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      // Should still work if getToken doesn't require the secret
      expect(mockNext).toHaveBeenCalled();
    });

    it("should preserve existing socket data while adding auth data", async () => {
      vi.mocked(getToken).mockResolvedValue({
        id: validObjectId,
        email: "test@example.com",
        name: "Test User",
        jti: "session-789",
      });

      const mockSocket = createMockSocket();
      // Add some existing data to the socket
      mockSocket.data.existingProperty = "should-remain";

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.data.existingProperty).toBe("should-remain");
      expect(mockSocket.data.userId).toBe(validObjectId);
      expect(mockSocket.data.userSessionId).toBe("session-789");
    });

    it("should handle token with extra properties gracefully", async () => {
      vi.mocked(getToken).mockResolvedValue({
        id: validObjectId,
        email: "test@example.com",
        name: "Test User",
        jti: "session-extra",
        extraProperty: "ignored",
        anotherExtra: { nested: "data" },
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.data.userId).toBe(validObjectId);
      expect(mockSocket.data.userEmail).toBe("test@example.com");
      expect(mockSocket.data.userName).toBe("Test User");
      expect(mockSocket.data.userSessionId).toBe("session-extra");
      // Extra properties should be ignored
      expect(mockSocket.data.extraProperty).toBeUndefined();
    });
  });

  describe("Real Database Integration", () => {
    it("should work with actual database user lookup", async () => {
      // This test ensures the function works with real database operations
      const realUser = await User.create({
        name: "Real Test User",
        email: "realtest@example.com",
        password: "hashedpassword123",
      });

      vi.mocked(getToken).mockResolvedValue({
        id: realUser._id.toString(),
        email: realUser.email,
        name: realUser.name,
        jti: "real-session-123",
      });

      const mockSocket = createMockSocket();

      await authenticateSocket(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.data.userId).toBe(realUser._id.toString());
      expect(mockSocket.data.userEmail).toBe(realUser.email);
      expect(mockSocket.data.userName).toBe(realUser.name);
    });
  });
});