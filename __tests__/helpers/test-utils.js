import { vi } from "vitest";
import { io as ClientIO } from "socket.io-client";
import {
  createInitialHand,
  generateRandomHeartCard,
  generateRandomMagicCard,
} from "../factories/card-factories.js";
import {
  createGameReadyRoom,
  createActiveGameRoom,
  generateRoomCode,
} from "../factories/game-factories.js";

/**
 * Helper utility for waiting for events with better error handling and debugging
 */
export const waitFor = (socket, event, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error(`Socket is not connected for event: ${event}`));
      return;
    }

    let timer = null;
    let resolved = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (socket && typeof socket.off === "function" && !resolved) {
        socket.off(event, listener);
      }
    };

    timer = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(
          new Error(`Timeout waiting for event: ${event} after ${timeout}ms`),
        );
      }
    }, timeout);

    const listener = (data) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        console.log(`Test helper: Received event '${event}' with data:`, data);
        resolve(data);
      }
    };

    // Check if event already emitted (race condition)
    const eventListeners = socket._events?.[event];
    if (eventListeners && typeof eventListeners === "function") {
      // Event already has a listener, add ours
      socket.on(event, listener);
    } else {
      socket.on(event, listener);
    }

    console.log(
      `Test helper: Waiting for event '${event}' with timeout ${timeout}ms`,
    );
  });
};

/**
 * Helper to wait for connection
 */
export const waitForConnection = (client, timeout = 20000) => {
  return new Promise((resolve, reject) => {
    console.log(
      `Test helper: Waiting for connection with timeout ${timeout}ms`,
    );

    const timer = setTimeout(() => {
      console.log(`Test helper: Connection timeout after ${timeout}ms`);
      // Add more detailed debugging info
      console.log(
        `Test helper: Client readyState: ${client.io?.engine?.readyState}`,
      );
      console.log(
        `Test helper: Client transport: ${client.io?.engine?.transport?.name}`,
      );
      console.log(`Test helper: Client connected: ${client.connected}`);
      console.log(`Test helper: Client disconnected: ${client.disconnected}`);
      reject(new Error(`Connection timeout after ${timeout}ms`));
    }, timeout);

    // Check if already connected
    if (client.connected) {
      console.log("Test helper: Client already connected");
      clearTimeout(timer);
      resolve();
      return;
    }

    let connected = false;
    let errorOccurred = false;

    // Connection event handlers
    const onConnect = () => {
      if (connected || errorOccurred) return; // Prevent multiple calls
      connected = true;
      console.log("Test helper: Client connected successfully");
      console.log(
        `Test helper: Socket ID: ${client.id}, Transport: ${client.io?.engine?.transport?.name}`,
      );
      clearTimeout(timer);
      cleanup();
      resolve();
    };

    const onConnectError = (error) => {
      if (errorOccurred || connected) return; // Prevent multiple calls
      errorOccurred = true;
      console.log(`Test helper: Connection error: ${error.message}`);
      console.log(`Test helper: Error details:`, error);
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Connection failed: ${error.message}`));
    };

    const onDisconnect = (reason) => {
      console.log(
        `Test helper: Client disconnected during connection attempt: ${reason}`,
      );
      if (!connected && !errorOccurred) {
        errorOccurred = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error(`Disconnected during connection: ${reason}`));
      }
    };

    const cleanup = () => {
      client.off("connect", onConnect);
      client.off("connect_error", onConnectError);
      client.off("disconnect", onDisconnect);
    };

    client.on("connect", onConnect);
    client.on("connect_error", onConnectError);
    client.on("disconnect", onDisconnect);

    // If client has an engine and it's already trying to connect, log its state
    if (client.io?.engine) {
      console.log(
        `Test helper: Engine readyState: ${client.io.engine.readyState}`,
      );
    }
  });
};

/**
 * Helper to create authenticated client with URL string
 */
export const createAuthenticatedClient = (port, userId = "user1") => {
  console.log(
    `Test helper: Creating client for user ${userId} on port ${port}`,
  );

  const client = ClientIO(`http://127.0.0.1:${port}`, {
    transports: ["websocket"], // Use websocket for better test performance
    forceNew: true,
    reconnection: false,
    timeout: 10000, // Reduce timeout for faster test failures
    // Add debugging options
    forceJSONP: false,
    rememberUpgrade: false,
    // Ensure path matches server default
    path: "/socket.io/",
    // Add connection retry options
    upgrade: false, // Disable upgrade for more stable test connections
    rememberTransport: false,
    // Add more robust connection options
    autoConnect: true,
    multiplex: false,
    // Add additional connection settings for test stability
    transports: ["websocket", "polling"], // Try websocket first, fallback to polling
    auth: {
      token: {
        id: userId,
        jti: `session-${userId}`,
        email: `${userId}@example.com`,
        name: `User ${userId}`,
      },
    },
  });

  // Add debugging event listeners
  client.on("connect", () => {
    console.log(
      `Test helper: Client ${userId} connected successfully with socket ID: ${client.id}`,
    );
  });

  client.on("connect_error", (error) => {
    console.error(
      `Test helper: Client ${userId} connection error:`,
      error.message,
    );
    console.error(`Test helper: Full error:`, error);
  });

  client.on("disconnect", (reason) => {
    console.log(
      `Test helper: Client ${userId} disconnected, reason: ${reason}`,
    );
  });

  return client;
};

/**
 * Helper to wait for multiple events
 */
export const waitForMultipleEvents = (socket, events, timeout = 5000) => {
  const promises = events.map((event) => waitFor(socket, event, timeout));
  return Promise.all(promises);
};

/**
 * Helper to wait for any of multiple events
 */
export const waitForAnyEvent = (socket, events, timeout = 5000) => {
  return Promise.race(events.map((event) => waitFor(socket, event, timeout)));
};

/**
 * Helper to create and connect multiple authenticated clients
 */
export const createTestClients = async (port, count = 2, baseId = "user") => {
  const clients = [];

  for (let i = 0; i < count; i++) {
    const userId = `${baseId}${i + 1}`;
    const client = createAuthenticatedClient(port, userId);
    await waitForConnection(client);
    clients.push(client);
  }

  return clients;
};

/**
 * Complete game setup helper
 */
export const setupGame = async (port, roomCode = null, playerCount = 2) => {
  // Generate room code if not provided
  const finalRoomCode = roomCode || generateRoomCode();

  // Create clients
  const clients = await createTestClients(port, playerCount);

  // First client joins and creates room
  clients[0].emit("join-room", { roomCode: finalRoomCode });
  const joinResponse1 = await waitFor(clients[0], "room-joined");

  // Other clients join
  for (let i = 1; i < clients.length; i++) {
    clients[i].emit("join-room", { roomCode: finalRoomCode });
    await waitFor(clients[i], "room-joined");
  }

  // All players ready up
  for (const client of clients) {
    client.emit("player-ready", { roomCode: finalRoomCode });
    await waitFor(client, "player-ready");
  }

  // Wait for game to start
  const gameData = await waitFor(clients[0], "game-start", 5000);

  // Find current player and client
  const currentPlayer = gameData.players.find(
    (p) => p.userId === gameData.currentPlayer.userId,
  );
  const currentClientIndex = clients.findIndex((client) => {
    // Match client to player by userId (client auth token id matches player userId)
    const clientUserId = client.auth?.token?.id || client.data?.userId;
    return clientUserId === currentPlayer?.userId;
  });

  // If we can't match by userId, fall back to position-based matching
  const finalCurrentClientIndex =
    currentClientIndex >= 0 ? currentClientIndex : 0;
  const currentClient = clients[finalCurrentClientIndex];
  const otherClient =
    clients.length > 1 ? clients[1 - finalCurrentClientIndex] : null;

  return {
    clients,
    roomCode: finalRoomCode,
    gameData,
    currentPlayer,
    currentClient,
    otherClient,
  };
};

/**
 * Helper to get current player and client from game setup
 */
export const getCurrentPlayerAndClient = (gameData, clients) => {
  const currentPlayer = gameData.players.find(
    (p) => p.userId === gameData.currentPlayer.userId,
  );
  const currentClient = clients.find((c) => {
    // This is a simplified way to match client to player
    // In practice, you might need to track which client belongs to which player
    return true; // Would need proper client-player mapping
  });

  return { currentPlayer, currentClient };
};

/**
 * Helper to assert game state consistency
 */
export const assertGameState = (gameState, expectations = {}) => {
  const {
    playerCount = 2,
    tileCount = 8,
    gameStarted = true,
    hasCurrentPlayer = true,
    hasTurnCount = true,
  } = expectations;

  if (playerCount !== undefined) {
    expect(gameState.players).toHaveLength(playerCount);
  }

  if (tileCount !== undefined) {
    expect(gameState.tiles).toHaveLength(tileCount);
  }

  if (gameStarted !== undefined) {
    expect(gameState.gameStarted).toBe(gameStarted);
  }

  if (hasCurrentPlayer !== undefined) {
    if (hasCurrentPlayer) {
      expect(gameState.currentPlayer).toBeDefined();
      expect(gameState.currentPlayer.userId).toBeDefined();
    } else {
      expect(gameState.currentPlayer).toBeUndefined();
    }
  }

  if (hasTurnCount !== undefined) {
    if (hasTurnCount) {
      expect(gameState.turnCount).toBeDefined();
      expect(gameState.turnCount).toBeGreaterThan(0);
    }
  }
};

/**
 * Helper to assert player state consistency
 */
export const assertPlayerState = (player, expectations = {}) => {
  const {
    hasUserId = true,
    hasName = true,
    hasHand = false,
    hasScore = true,
    isReady = null,
  } = expectations;

  if (hasUserId) {
    expect(player.userId).toBeDefined();
    expect(typeof player.userId).toBe("string");
  }

  if (hasName) {
    expect(player.name).toBeDefined();
    expect(typeof player.name).toBe("string");
  }

  if (hasHand) {
    expect(player.hand).toBeDefined();
    expect(Array.isArray(player.hand)).toBe(true);
    expect(player.hand.length).toBeGreaterThan(0);
  }

  if (hasScore) {
    expect(player.score).toBeDefined();
    expect(typeof player.score).toBe("number");
    expect(player.score).toBeGreaterThanOrEqual(0);
  }

  if (isReady !== null) {
    expect(player.isReady).toBe(isReady);
  }
};

/**
 * Helper to create test room code with counter
 */
export const createRoomCodeGenerator = () => {
  let counter = 0;
  return () => {
    counter++;
    return generateRoomCode(counter);
  };
};

/**
 * Helper to clean up test clients
 */
export const cleanupClients = (clients) => {
  clients.forEach((client) => {
    if (client && client.connected) {
      client.disconnect();
    }
  });
};

/**
 * Helper to simulate player actions sequence
 */
export const simulatePlayerTurn = async (client, roomCode, actions = []) => {
  const results = [];

  for (const action of actions) {
    const { type, data, expectError = false } = action;

    client.emit(type, { roomCode, ...data });

    if (expectError) {
      const error = await waitFor(client, "room-error");
      results.push({ type: "error", data: error });
    } else {
      // Determine expected event based on action type
      const expectedEvent = getExpectedEventForAction(type);
      const response = await waitFor(client, expectedEvent);
      results.push({ type: "success", data: response });
    }
  }

  return results;
};

/**
 * Helper to determine expected event for action type
 */
const getExpectedEventForAction = (actionType) => {
  const eventMap = {
    "place-heart": "heart-placed",
    "draw-heart": "heart-drawn",
    "draw-magic-card": "magic-card-drawn",
    "use-magic-card": "magic-card-used",
    "end-turn": "turn-changed",
    "player-ready": "player-ready",
  };

  return eventMap[actionType] || "unknown";
};

/**
 * Helper to create test data for different scenarios
 */
export const createTestScenario = (scenarioType, overrides = {}) => {
  const scenarios = {
    "basic-game": () => ({
      playerCount: 2,
      tiles: 8,
      initialHearts: 3,
      initialMagicCards: 2,
    }),
    "single-player": () => ({
      playerCount: 1,
      tiles: 8,
      initialHearts: 3,
      initialMagicCards: 2,
    }),
    "full-game": () => ({
      playerCount: 2,
      tiles: 8,
      initialHearts: 3,
      initialMagicCards: 2,
      startGame: true,
    }),
  };

  const baseScenario = scenarios[scenarioType]?.() || scenarios["basic-game"]();
  return { ...baseScenario, ...overrides };
};

/**
 * Helper to validate event data structure
 */
export const validateEventData = (eventData, expectedFields = []) => {
  expect(eventData).toBeDefined();
  expect(typeof eventData).toBe("object");

  expectedFields.forEach((field) => {
    expect(eventData).toHaveProperty(field);
  });

  return true;
};

/**
 * Helper to create mock card generation functions
 */
export const createMockCardGenerators = () => {
  return {
    HeartCard: {
      generateRandom: vi.fn().mockImplementation(generateRandomHeartCard),
    },
    generateRandomMagicCard: vi
      .fn()
      .mockImplementation(generateRandomMagicCard),
    isHeartCard: vi.fn(
      (card) =>
        card?.type === "heart" || (card?.color && card?.value !== undefined),
    ),
    isMagicCard: vi.fn(
      (card) => card?.type && ["wind", "recycle", "shield"].includes(card.type),
    ),
    createCardFromData: vi.fn((cardData) => cardData),
  };
};
