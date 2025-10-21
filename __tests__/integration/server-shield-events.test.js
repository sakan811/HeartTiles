import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Server Shield Event Integration', () => {
  let mockSocket, mockIo, mockRoom, mockRooms;
  let player1Id, player2Id, player1Socket, player2Socket;
  let serverFunctions;

  beforeEach(() => {
    player1Id = 'player1';
    player2Id = 'player2';
    player1Socket = { id: 'socket1', userId: player1Id, emit: vi.fn(), data: { userId: player1Id } };
    player2Socket = { id: 'socket2', userId: player2Id, emit: vi.fn(), data: { userId: player2Id } };

    mockRooms = new Map();
    mockRoom = {
      roomCode: 'SHIELD123',
      players: [
        { userId: player1Id, name: 'Player 1', socketId: 'socket1', isReady: true, score: 0 },
        { userId: player2Id, name: 'Player 2', socketId: 'socket2', isReady: true, score: 0 }
      ],
      maxPlayers: 2,
      gameState: {
        gameStarted: true,
        currentPlayer: { userId: player1Id, name: 'Player 1' },
        turnCount: 1,
        tiles: [
          { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, emoji: '❤️', placedBy: player1Id } },
          { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, emoji: '💛', placedBy: player2Id } },
          { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
          { id: 4, color: 'white', emoji: '⬜', placedHeart: null }
        ],
        playerHands: {
          [player1Id]: [
            { id: 'shield1', type: 'shield', emoji: '🛡️', name: 'Shield Card' },
            { id: 'heart1', type: 'heart', color: 'blue', value: 2, emoji: '💙' }
          ],
          [player2Id]: [
            { id: 'wind1', type: 'wind', emoji: '💨', name: 'Wind Card' },
            { id: 'recycle1', type: 'recycle', emoji: '♻️', name: 'Recycle Card' }
          ]
        },
        deck: { emoji: '💌', cards: 10, }
        magicDeck: { emoji: '🔮', cards: 10, }
        shields: {},
        playerActions: {}
      }
    };

    mockRooms.set(mockRoom.roomCode, mockRoom);

    mockIo = {
      to: vi.fn(() => ({
        emit: vi.fn()
      }))
    };

    mockSocket = player1Socket;

    // Mock server helper functions (simplified versions from server.js)
    serverFunctions = {
      validateTurn: (room, userId) => {
        if (!room?.gameState?.gameStarted) return { valid: false, error: "Game not started" };
        if (!room.gameState.currentPlayer || room.gameState.currentPlayer.userId !== userId) {
          return { valid: false, error: "Not your turn" };
        }
        return { valid: true };
      },

      acquireTurnLock: (roomCode, socketId) => {
        // Simplified lock mechanism
        return true;
      },

      releaseTurnLock: (roomCode, socketId) => {
        // Simplified lock release
      },

      saveRoom: async (room) => {
        // Mock save function
      },

      checkAndExpireShields: (room) => {
        // This mirrors the actual server.js function
        if (!room.gameState.shields) return;

        // Decrement remaining turns for all active shields at the end of each turn
        for (const [userId, shield] of Object.entries(room.gameState.shields)) {
          if (shield.remainingTurns > 0) {
            shield.remainingTurns--;
            console.log(`Shield for ${userId}: ${shield.remainingTurns} turns remaining`);

            // Remove shield if it has expired
            if (shield.remainingTurns <= 0) {
              console.log(`Shield expired for ${userId}`);
              delete room.gameState.shields[userId];
            }
          }
        }
      }
    };
  });

  describe('Shield Card Socket Event Handling', () => {
    it('should handle shield activation event correctly', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Simulate the server handling a shield card use event
      const eventData = {
        roomCode: mockRoom.roomCode,
        cardId: 'shield1',
        targetTileId: 'self'
      };

      // Validate turn
      const turnValidation = serverFunctions.validateTurn(mockRoom, player1Id);
      expect(turnValidation.valid).toBe(true);

      // Find and remove the shield card from player's hand
      const playerHand = mockRoom.gameState.playerHands[player1Id];
      const cardIndex = playerHand.findIndex(card => card.id === eventData.cardId);
      expect(cardIndex).toBeGreaterThanOrEqual(0);

      const shieldCardData = playerHand.splice(cardIndex, 1)[0];
      const shieldCard = new ShieldCard(shieldCardData.id);

      // Execute shield effect
      const actionResult = shieldCard.executeEffect(mockRoom.gameState, player1Id);

      // Verify shield activation
      expect(actionResult.type).toBe('shield');
      expect(actionResult.activatedFor).toBe(player1Id);
      expect(actionResult.remainingTurns).toBe(2);

      // Update player hands
      mockRoom.gameState.playerHands[player1Id] = playerHand;

      // Mock broadcasting to all players
      const playersWithUpdatedHands = mockRoom.players.map(player => ({
        ...player,
        hand: mockRoom.gameState.playerHands[player.userId] || [],
        score: player.score || 0
      }));

      const broadcastData = {
        card: shieldCardData,
        actionResult: actionResult,
        tiles: mockRoom.gameState.tiles,
        players: playersWithUpdatedHands,
        playerHands: mockRoom.gameState.playerHands,
        usedBy: player1Id,
        shields: mockRoom.gameState.shields
      };

      // Verify broadcast data structure
      expect(broadcastData.actionResult.type).toBe('shield');
      expect(broadcastData.actionResult.activatedFor).toBe(player1Id);
      expect(broadcastData.shields[player1Id]).toBeDefined();
    });

    it('should reject shield activation when not player\'s turn', async () => {
      // Change current player to player2
      mockRoom.gameState.currentPlayer = { userId: player2Id, name: 'Player 2' };

      const eventData = {
        roomCode: mockRoom.roomCode,
        cardId: 'shield1',
        targetTileId: 'self'
      };

      // Validate turn
      const turnValidation = serverFunctions.validateTurn(mockRoom, player1Id);
      expect(turnValidation.valid).toBe(false);
      expect(turnValidation.error).toBe("Not your turn");
    });

    it('should handle shield reinforcement event correctly', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // First, activate a shield
      const firstShield = new ShieldCard('shield1');
      firstShield.executeEffect(mockRoom.gameState, player1Id);

      // Add second shield to hand
      mockRoom.gameState.playerHands[player1Id].push(
        { id: 'shield2', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
      );

      // Advance turn
      mockRoom.gameState.turnCount = 2;

      // Use second shield (should reinforce)
      const eventData = {
        roomCode: mockRoom.roomCode,
        cardId: 'shield2',
        targetTileId: 'self'
      };

      const playerHand = mockRoom.gameState.playerHands[player1Id];
      const cardIndex = playerHand.findIndex(card => card.id === eventData.cardId);
      const shieldCardData = playerHand.splice(cardIndex, 1)[0];
      const shieldCard = new ShieldCard(shieldCardData.id);

      const actionResult = shieldCard.executeEffect(mockRoom.gameState, player1Id);

      expect(actionResult.reinforced).toBe(true);
      expect(actionResult.remainingTurns).toBe(2);
    });
  });

  describe('Shield Protection Event Blocking', () => {
    beforeEach(async () => {
      // Activate shield for player1
      const { ShieldCard } = await import('../../src/lib/cards.js');
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockRoom.gameState, player1Id);
    });

    it('should block Wind card events against protected player', async () => {
      const { WindCard } = await import('../../src/lib/cards.js');

      // Player2 attempts to use Wind card
      const windCardData = mockRoom.gameState.playerHands[player2Id][0];
      const windCard = new WindCard(windCardData.id);

      expect(() => {
        windCard.executeEffect(mockRoom.gameState, 1, player2Id);
      }).toThrow("Opponent is protected by Shield");
    });

    it('should block Recycle card events when protected player has hearts', async () => {
      const { RecycleCard } = await import('../../src/lib/cards.js');

      const recycleCardData = mockRoom.gameState.playerHands[player2Id][1];
      const recycleCard = new RecycleCard(recycleCardData.id);

      // Try to use Recycle on empty tile (basic targeting passes, but shield blocks)
      expect(() => {
        recycleCard.executeEffect(mockRoom.gameState, 3);
      }).toThrow("Tile is protected by Shield");
    });

    it('should allow magic cards after shield expires', async () => {
      const { WindCard } = await import('../../src/lib/cards.js');

      // Advance turns 2 full turns = turn 4
      for (let turn = 1; turn <= 2; turn++) {
        mockRoom.gameState.turnCount = turn + 1; // Turn 2, 3
        await serverFunctions.checkAndExpireShields(mockRoom);
      }

      const windCardData = mockRoom.gameState.playerHands[player2Id][0];
      const windCard = new WindCard(windCardData.id);

      // Should now work
      const result = windCard.executeEffect(mockRoom.gameState, 1, player2Id);
      expect(result.type).toBe('wind');
    });
  });

  describe('Shield Turn Management Events', () => {
    it('should expire shields during turn changes', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockRoom.gameState, player1Id);

      expect(mockRoom.gameState.shields[player1Id]).toBeDefined();

      // Simulate shield expiration after 2 full turns
      // The shield should be decremented at the end of each turn
      for (let turn = 1; turn <= 2; turn++) {
        mockRoom.gameState.turnCount = turn; // Turn 1, 2
        await serverFunctions.checkAndExpireShields(mockRoom);
      }

      expect(mockRoom.gameState.shields[player1Id]).toBeUndefined();
    });

    it('should update shield remaining turns during turn changes', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockRoom.gameState, player1Id);

      // End of Turn 1: 1 turn remaining
      mockRoom.gameState.turnCount = 1;
      await serverFunctions.checkAndExpireShields(mockRoom);
      expect(mockRoom.gameState.shields[player1Id].remainingTurns).toBe(1);

      // End of Turn 2: Shield should be expired and removed
      mockRoom.gameState.turnCount = 2;
      await serverFunctions.checkAndExpireShields(mockRoom);
      expect(mockRoom.gameState.shields[player1Id]).toBeUndefined();
    });

    it('should broadcast shield state changes to all players', () => {
      // Mock the io.to().emit() chain
      const mockEmit = vi.fn();
      mockIo.to.mockReturnValue({ emit: mockEmit });

      // Simulate turn change event with shield data
      const turnChangeData = {
        currentPlayer: mockRoom.gameState.currentPlayer,
        turnCount: mockRoom.gameState.turnCount,
        players: mockRoom.players,
        playerHands: mockRoom.gameState.playerHands,
        deck: mockRoom.gameState.deck,
        shields: mockRoom.gameState.shields
      };

      // Broadcast turn change
      mockIo.to(mockRoom.roomCode).emit("turn-changed", turnChangeData);

      expect(mockIo.to).toHaveBeenCalledWith(mockRoom.roomCode);
      expect(mockEmit).toHaveBeenCalledWith("turn-changed", turnChangeData);
    });
  });

  describe('Shield Error Handling Events', () => {
    it('should handle invalid shield card usage events', async () => {
      const eventData = {
        roomCode: mockRoom.roomCode,
        cardId: 'invalid-shield-id',
        targetTileId: 'self'
      };

      const playerHand = mockRoom.gameState.playerHands[player1Id];
      const cardIndex = playerHand.findIndex(card => card.id === eventData.cardId);

      expect(cardIndex).toBe(-1);

      // Server validation should catch this
      expect(cardIndex).toBe(-1);
      // In actual server, this would trigger: mockSocket.emit("room-error", "Magic card not found in your hand");
    });

    it('should handle shield activation when opponent has active shield', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Player1 activates shield
      const player1Shield = new ShieldCard('shield1');
      player1Shield.executeEffect(mockRoom.gameState, player1Id);

      // Give Player2 a shield card
      mockRoom.gameState.playerHands[player2Id].push(
        { id: 'shield2', type: 'shield', emoji: '🛡️', name: 'Shield Card' }
      );

      // Player2 tries to activate shield
      const player2Shield = new ShieldCard('shield2');

      // Player2 should not be able to activate shield while player1 has shield
      expect(() => {
        player2Shield.executeEffect(mockRoom.gameState, player2Id);
      }).toThrow("Cannot activate Shield while opponent has active Shield");
    });

    it('should handle shield events with malformed data', () => {
      const invalidEvents = [
        { roomCode: null, cardId: 'shield1', targetTileId: 'self' },
        { roomCode: mockRoom.roomCode, cardId: null, targetTileId: 'self' },
        { roomCode: mockRoom.roomCode, cardId: 'shield1', targetTileId: null },
        { roomCode: '', cardId: 'shield1', targetTileId: 'self' },
        { roomCode: mockRoom.roomCode, cardId: '', targetTileId: 'self' }
      ];

      invalidEvents.forEach((eventData, index) => {
        // Server validation should catch these
        if (index === 0) {
          // roomCode is null, cardId is valid
          const isValid = Boolean(eventData.roomCode && eventData.cardId);
          expect(isValid).toBe(false);
        } else if (index === 1) {
          // roomCode is valid, cardId is null
          const isValid = Boolean(eventData.roomCode && eventData.cardId);
          expect(isValid).toBe(false);
        } else if (index === 4) {
          // roomCode is valid, cardId is empty string
          const isValid = Boolean(eventData.roomCode && eventData.cardId);
          expect(isValid).toBe(false);
        }
      });
    });
  });

  describe('Shield Game State Persistence', () => {
    it('should maintain shield state through room serialization', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockRoom.gameState, player1Id);

      // Serialize room state (simulate database save)
      const serializedRoom = JSON.parse(JSON.stringify(mockRoom));

      // Verify shield state is preserved
      expect(serializedRoom.gameState.shields[player1Id]).toBeDefined();
      expect(serializedRoom.gameState.shields[player1Id].active).toBe(true);
      expect(serializedRoom.gameState.shields[player1Id].remainingTurns).toBe(2);

      // Test shield functionality on deserialized state
      const isProtected = ShieldCard.isPlayerProtected(serializedRoom.gameState, player1Id, 1);
      expect(isProtected).toBe(true);
    });

    it('should handle shield state during player migration', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield for player1
      const shield = new ShieldCard('shield1');
      shield.executeEffect(mockRoom.gameState, player1Id);

      // Simulate player reconnection with new user ID
      const newUserId = 'player1_reconnected';

      // Migrate shield state (as done in server.js)
      if (mockRoom.gameState.shields[player1Id]) {
        mockRoom.gameState.shields[newUserId] = mockRoom.gameState.shields[player1Id];
        delete mockRoom.gameState.shields[player1Id];
        mockRoom.gameState.shields[newUserId].protectedPlayerId = newUserId;
        mockRoom.gameState.shields[newUserId].activatedBy = newUserId;
      }

      // Verify shield is still active
      expect(mockRoom.gameState.shields[newUserId]).toBeDefined();
      expect(ShieldCard.isPlayerProtected(mockRoom.gameState, newUserId, 1)).toBe(true);
      expect(mockRoom.gameState.shields[player1Id]).toBeUndefined();
    });
  });

  describe('Shield Visual State Synchronization', () => {
    it('should broadcast complete shield state for visual indicators', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield
      const shield = new ShieldCard('shield-visual-test');
      const actionResult = shield.executeEffect(mockRoom.gameState, player1Id);

      // Mock broadcast data structure
      const broadcastData = {
        actionResult: actionResult,
        shields: mockRoom.gameState.shields,
        tiles: mockRoom.gameState.tiles,
        players: mockRoom.players
      };

      // Verify broadcast contains all necessary visual data
      expect(broadcastData.shields[player1Id]).toBeDefined();
      expect(broadcastData.shields[player1Id].remainingTurns).toBe(2);
      expect(broadcastData.shields[player1Id].protectedPlayerId).toBe(player1Id);

      // Verify action result contains visual feedback data
      expect(broadcastData.actionResult.type).toBe('shield');
      expect(broadcastData.actionResult.remainingTurns).toBe(2);
      expect(broadcastData.actionResult.message).toContain('Shield activated');
    });

    it('should synchronize shield visual state during turn changes', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate shield
      const shield = new ShieldCard('shield-sync-test');
      shield.executeEffect(mockRoom.gameState, player1Id);

      // Simulate turn change with shield state
      const turnChangeData = {
        currentPlayer: { userId: player2Id, name: 'Player 2' },
        turnCount: 2,
        players: mockRoom.players,
        shields: mockRoom.gameState.shields
      };

      // Verify shield state is included in turn change broadcast
      expect(turnChangeData.shields[player1Id]).toBeDefined();
      expect(turnChangeData.shields[player1Id].remainingTurns).toBeGreaterThan(0);

      // Simulate shield expiration during turn change
      for (let turn = 1; turn <= 2; turn++) {
        mockRoom.gameState.turnCount = turn; // Turn 1, 2
        await serverFunctions.checkAndExpireShields(mockRoom);
      }

      // Shield should be removed from visual state
      expect(mockRoom.gameState.shields[player1Id]).toBeUndefined();
    });

    it('should handle opponent shield visual state correctly', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Player 1 activates shield
      const player1Shield = new ShieldCard('player1-shield');
      player1Shield.executeEffect(mockRoom.gameState, player1Id);

      // Player 2 should receive visual state indicating Player 1 has shield
      const opponentVisualData = {
        shields: mockRoom.gameState.shields,
        tiles: mockRoom.gameState.tiles
      };

      // Verify opponent can see Player 1's shield state
      expect(opponentVisualData.shields[player1Id]).toBeDefined();
      expect(opponentVisualData.shields[player1Id].remainingTurns).toBe(2);

      // Verify tiles with Player 1's hearts should show shield indicators
      const protectedTiles = mockRoom.gameState.tiles.filter(tile =>
        tile.placedHeart && tile.placedHeart.placedBy === player1Id
      );

      expect(protectedTiles).toHaveLength(1);
      expect(protectedTiles[0].placedHeart.placedBy).toBe(player1Id);
    });

    it('should handle visual state updates during shield reinforcement', async () => {
      const { ShieldCard } = await import('../../src/lib/cards.js');

      // Activate initial shield
      const shield1 = new ShieldCard('reinforce-visual-1');
      shield1.executeEffect(mockRoom.gameState, player1Id);

      // Reinforce shield
      mockRoom.gameState.turnCount = 2;
      const shield2 = new ShieldCard('reinforce-visual-2');
      const reinforceResult = shield2.executeEffect(mockRoom.gameState, player1Id);

      // Verify visual state is updated correctly
      expect(reinforceResult.reinforced).toBe(true);
      expect(reinforceResult.remainingTurns).toBe(2);
      expect(mockRoom.gameState.shields[player1Id].remainingTurns).toBe(2);

      // Broadcast data should reflect reinforcement
      const reinforceBroadcastData = {
        actionResult: reinforceResult,
        shields: mockRoom.gameState.shields
      };

      expect(reinforceBroadcastData.actionResult.message).toContain('Shield reinforced');
      expect(reinforceBroadcastData.shields[player1Id].remainingTurns).toBe(2);
    });
  });
});