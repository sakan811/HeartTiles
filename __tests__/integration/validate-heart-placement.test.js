import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { validateHeartPlacement } from "../../server.js";
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
} from "../utils/server-test-utils.js";
import {
  createMockRoom,
  createMockUser,
} from "./setup.js";
import { generateTiles } from "../utils/server-test-utils.js";
import { Room } from "../../models.js";

describe("validateHeartPlacement", () => {
  let room;
  let userId;

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    userId = "test-user-1";

    // Create a test room with tiles
    const roomData = createMockRoom("TEST01");
    roomData.gameState.tiles = generateTiles();

    room = new Room(roomData);
    await room.save();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  it("should validate successful heart placement", () => {
    // Add a heart card to player's hand
    const heartCard = { id: "heart_1", type: "heart", value: 2, color: "red", emoji: "❤️" };
    room.gameState.playerHands[userId] = [heartCard];

    // Find a valid empty tile
    const tile = room.gameState.tiles.find(t => !t.placedHeart || t.placedHeart.value === 0);

    const result = validateHeartPlacement(room, userId, heartCard.id, tile.id);

    expect(result.valid).toBe(true);
  });

  it("should reject when card not in player's hand", () => {
    const result = validateHeartPlacement(room, userId, "nonexistent_card", 0);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Card not in player's hand");
  });

  it("should reject non-heart cards", () => {
    // Add a magic card to player's hand
    const magicCard = { id: "wind_1", type: "wind", emoji: "💨" };
    room.gameState.playerHands[userId] = [magicCard];

    const result = validateHeartPlacement(room, userId, magicCard.id, 0);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Only heart cards can be placed on tiles");
  });

  it("should reject when tile not found", () => {
    const heartCard = { id: "heart_1", type: "heart", value: 2, color: "red", emoji: "❤️" };
    room.gameState.playerHands[userId] = [heartCard];

    const result = validateHeartPlacement(room, userId, heartCard.id, 999);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Tile not found");
  });

  it("should reject when tile is already occupied", () => {
    const heartCard = { id: "heart_1", type: "heart", value: 2, color: "red", emoji: "❤️" };
    room.gameState.playerHands[userId] = [heartCard];

    // Find a tile and mark it as occupied
    const tile = room.gameState.tiles[0];
    tile.placedHeart = { value: 1, color: "red", placedBy: "other_user" };

    const result = validateHeartPlacement(room, userId, heartCard.id, tile.id);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Tile is already occupied");
  });
});