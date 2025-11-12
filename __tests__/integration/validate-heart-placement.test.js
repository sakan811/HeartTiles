import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupServer, createTestClient, generateTestUserId } from "./setup.js";

describe("validateHeartPlacement", () => {
  let server;
  let room;
  let userId;
  let socket;

  beforeEach(async () => {
    const result = await setupServer();
    server = result.server;
    socket = result.socket;
    userId = generateTestUserId();

    // Create a test room
    const { client } = createTestClient(server, userId);
    await client.connect();

    const roomCode = "TEST01";
    await client.joinRoom(roomCode, "TestUser", "test@example.com");

    // Get room from server
    room = server.rooms.get(roomCode);

    await client.disconnect();
  });

  afterEach(async () => {
    if (socket) {
      await socket.disconnect();
    }
    if (server) {
      await server.close();
    }
  });

  it("should validate successful heart placement", () => {
    // Add a heart card to player's hand
    const heartCard = { id: "heart_1", type: "heart", value: 2, color: "red", emoji: "❤️" };
    room.gameState.playerHands[userId] = [heartCard];

    // Find a valid empty tile
    const tile = room.gameState.tiles.find(t => !t.placedHeart || t.placedHeart.value === 0);

    const result = server.validateHeartPlacement(room, userId, heartCard.id, tile.id);

    expect(result.valid).toBe(true);
  });

  it("should reject when card not in player's hand", () => {
    const result = server.validateHeartPlacement(room, userId, "nonexistent_card", 0);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Card not in player's hand");
  });

  it("should reject non-heart cards", () => {
    // Add a magic card to player's hand
    const magicCard = { id: "wind_1", type: "wind", emoji: "💨" };
    room.gameState.playerHands[userId] = [magicCard];

    const result = server.validateHeartPlacement(room, userId, magicCard.id, 0);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Only heart cards can be placed on tiles");
  });

  it("should reject when tile not found", () => {
    const heartCard = { id: "heart_1", type: "heart", value: 2, color: "red", emoji: "❤️" };
    room.gameState.playerHands[userId] = [heartCard];

    const result = server.validateHeartPlacement(room, userId, heartCard.id, 999);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Tile not found");
  });

  it("should reject when tile is already occupied", () => {
    const heartCard = { id: "heart_1", type: "heart", value: 2, color: "red", emoji: "❤️" };
    room.gameState.playerHands[userId] = [heartCard];

    // Find a tile and mark it as occupied
    const tile = room.gameState.tiles[0];
    tile.placedHeart = { value: 1, color: "red", placedBy: "other_user" };

    const result = server.validateHeartPlacement(room, userId, heartCard.id, tile.id);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Tile is already occupied");
  });
});