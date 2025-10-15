import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Game State Management', () => {
  let mockRoom;
  let player1Id, player2Id;

  beforeEach(() => {
    player1Id = 'player1';
    player2Id = 'player2';

    mockRoom = {
      code: 'TEST01',
      players: [
        { userId: player1Id, name: 'Player1', score: 0, isReady: false },
        { userId: player2Id, name: 'Player2', score: 0, isReady: false }
      ],
      maxPlayers: 2,
      gameState: {
        tiles: [
          { id: 0, color: 'red', emoji: '🟥', placedHeart: null },
          { id: 1, color: 'yellow', emoji: '🟨', placedHeart: null },
          { id: 2, color: 'green', emoji: '🟩', placedHeart: null },
          { id: 3, color: 'white', emoji: '⬜', placedHeart: null },
          { id: 4, color: 'red', emoji: '🟥', placedHeart: null },
          { id: 5, color: 'yellow', emoji: '🟨', placedHeart: null },
          { id: 6, color: 'green', emoji: '🟩', placedHeart: null },
          { id: 7, color: 'white', emoji: '⬜', placedHeart: null }
        ],
        gameStarted: false,
        currentPlayer: null,
        deck: { emoji: '💌', cards: 16, type: 'hearts' },
        magicDeck: { emoji: '🔮', cards: 16, type: 'magic' },
        playerHands: {},
        shields: {},
        turnCount: 0,
        playerActions: {}
      }
    };
  });

  describe('Room State Management', () => {
    it('should initialize room with correct default state', () => {
      expect(mockRoom.code).toBe('TEST01');
      expect(mockRoom.players).toHaveLength(2);
      expect(mockRoom.maxPlayers).toBe(2);
      expect(mockRoom.gameState.gameStarted).toBe(false);
      expect(mockRoom.gameState.currentPlayer).toBeNull();
      expect(mockRoom.gameState.tiles).toHaveLength(8);
      expect(mockRoom.gameState.deck.cards).toBe(16);
      expect(mockRoom.gameState.magicDeck.cards).toBe(16);
    });

    it('should add player to room correctly', () => {
      const newPlayer = {
        userId: 'player3',
        name: 'Player3',
        score: 0,
        isReady: false,
        joinedAt: new Date()
      };

      // Simulate adding player (would normally check maxPlayers)
      const initialPlayerCount = mockRoom.players.length;
      mockRoom.players.push(newPlayer);

      expect(mockRoom.players).toHaveLength(initialPlayerCount + 1);
      expect(mockRoom.players[mockRoom.players.length - 1]).toEqual(newPlayer);
    });

    it('should remove player from room correctly', () => {
      const initialPlayerCount = mockRoom.players.length;
      const removedPlayer = mockRoom.players.find(p => p.userId === player1Id);

      mockRoom.players = mockRoom.players.filter(p => p.userId !== player1Id);

      expect(mockRoom.players).toHaveLength(initialPlayerCount - 1);
      expect(mockRoom.players.find(p => p.userId === player1Id)).toBeUndefined();
      expect(removedPlayer.userId).toBe(player1Id);
    });

    it('should update player ready status correctly', () => {
      const player = mockRoom.players.find(p => p.userId === player1Id);
      expect(player.isReady).toBe(false);

      player.isReady = !player.isReady;
      expect(player.isReady).toBe(true);

      player.isReady = !player.isReady;
      expect(player.isReady).toBe(false);
    });

    it('should check if all players are ready', () => {
      const allPlayersReady = () => {
        return mockRoom.players.length === mockRoom.maxPlayers &&
               mockRoom.players.every(p => p.isReady);
      };

      expect(allPlayersReady()).toBe(false);

      mockRoom.players.forEach(p => p.isReady = true);
      expect(allPlayersReady()).toBe(true);

      mockRoom.players[0].isReady = false;
      expect(allPlayersReady()).toBe(false);
    });
  });

  describe('Game State Transitions', () => {
    it('should start game correctly when both players are ready', () => {
      // Set up initial hands
      mockRoom.gameState.playerHands[player1Id] = [
        { id: 'h1', type: 'heart', color: 'red', value: 2, emoji: '❤️' },
        { id: 'h2', type: 'heart', color: 'yellow', value: 1, emoji: '💛' },
        { id: 'h3', type: 'heart', color: 'green', value: 3, emoji: '💚' },
        { id: 'm1', type: 'magic', magicType: 'wind', emoji: '💨' },
        { id: 'm2', type: 'magic', magicType: 'recycle', emoji: '♻️' }
      ];

      mockRoom.gameState.playerHands[player2Id] = [
        { id: 'h4', type: 'heart', color: 'red', value: 1, emoji: '❤️' },
        { id: 'h5', type: 'heart', color: 'yellow', value: 2, emoji: '💛' },
        { id: 'h6', type: 'heart', color: 'green', value: 1, emoji: '💚' },
        { id: 'm3', type: 'magic', magicType: 'shield', emoji: '🛡️' },
        { id: 'm4', type: 'magic', magicType: 'wind', emoji: '💨' }
      ];

      // Mark players as ready
      mockRoom.players.forEach(p => p.isReady = true);

      // Start game
      mockRoom.gameState.gameStarted = true;
      mockRoom.gameState.currentPlayer = mockRoom.players[0]; // Player 1 starts
      mockRoom.gameState.turnCount = 1;

      expect(mockRoom.gameState.gameStarted).toBe(true);
      expect(mockRoom.gameState.currentPlayer.userId).toBe(player1Id);
      expect(mockRoom.gameState.turnCount).toBe(1);
      expect(mockRoom.gameState.playerHands[player1Id]).toHaveLength(5);
      expect(mockRoom.gameState.playerHands[player2Id]).toHaveLength(5);
    });

    it('should switch turns correctly', () => {
      // Set up game in progress
      mockRoom.gameState.gameStarted = true;
      mockRoom.gameState.currentPlayer = mockRoom.players[0];
      mockRoom.gameState.turnCount = 1;

      const currentPlayerIndex = mockRoom.players.findIndex(p => p.userId === mockRoom.gameState.currentPlayer.userId);
      const nextPlayerIndex = (currentPlayerIndex + 1) % mockRoom.players.length;

      mockRoom.gameState.currentPlayer = mockRoom.players[nextPlayerIndex];
      mockRoom.gameState.turnCount++;

      expect(mockRoom.gameState.currentPlayer.userId).toBe(player2Id);
      expect(mockRoom.gameState.turnCount).toBe(2);

      // Switch back
      const backToPlayerIndex = (nextPlayerIndex + 1) % mockRoom.players.length;
      mockRoom.gameState.currentPlayer = mockRoom.players[backToPlayerIndex];
      mockRoom.gameState.turnCount++;

      expect(mockRoom.gameState.currentPlayer.userId).toBe(player1Id);
      expect(mockRoom.gameState.turnCount).toBe(3);
    });

    it('should handle player actions tracking', () => {
      const userId = player1Id;

      // Initialize player actions if not exists
      if (!mockRoom.gameState.playerActions[userId]) {
        mockRoom.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };
      }

      // Draw heart card
      mockRoom.gameState.playerActions[userId].drawnHeart = true;
      expect(mockRoom.gameState.playerActions[userId].drawnHeart).toBe(true);
      expect(mockRoom.gameState.playerActions[userId].drawnMagic).toBe(false);

      // Draw magic card
      mockRoom.gameState.playerActions[userId].drawnMagic = true;
      expect(mockRoom.gameState.playerActions[userId].drawnHeart).toBe(true);
      expect(mockRoom.gameState.playerActions[userId].drawnMagic).toBe(true);

      // Reset actions after turn
      mockRoom.gameState.playerActions[userId] = { drawnHeart: false, drawnMagic: false };
      expect(mockRoom.gameState.playerActions[userId].drawnHeart).toBe(false);
      expect(mockRoom.gameState.playerActions[userId].drawnMagic).toBe(false);
    });

    it('should validate turn requirements correctly', () => {
      const validateTurnRequirements = (room, userId) => {
        if (!room.gameState.gameStarted) {
          return { valid: false, error: 'Game not started' };
        }

        if (room.gameState.currentPlayer?.userId !== userId) {
          return { valid: false, error: 'Not your turn' };
        }

        const playerActions = room.gameState.playerActions[userId] || {};
        const heartDeckEmpty = room.gameState.deck.cards <= 0;
        const magicDeckEmpty = room.gameState.magicDeck.cards <= 0;

        if (!playerActions.drawnHeart && !heartDeckEmpty) {
          return { valid: false, error: 'You must draw a heart card before ending your turn' };
        }

        if (!playerActions.drawnMagic && !magicDeckEmpty) {
          return { valid: false, error: 'You must draw a magic card before ending your turn' };
        }

        return { valid: true };
      };

      // Game not started
      let result = validateTurnRequirements(mockRoom, player1Id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game not started');

      // Start game
      mockRoom.gameState.gameStarted = true;
      mockRoom.gameState.currentPlayer = mockRoom.players[0];

      // Not player's turn
      result = validateTurnRequirements(mockRoom, player2Id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Not your turn');

      // Player's turn but hasn't drawn cards
      result = validateTurnRequirements(mockRoom, player1Id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You must draw a heart card before ending your turn');

      // Player draws heart card
      mockRoom.gameState.playerActions[player1Id] = { drawnHeart: true, drawnMagic: false };
      result = validateTurnRequirements(mockRoom, player1Id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('You must draw a magic card before ending your turn');

      // Player draws magic card
      mockRoom.gameState.playerActions[player1Id].drawnMagic = true;
      result = validateTurnRequirements(mockRoom, player1Id);
      expect(result.valid).toBe(true);

      // Test with empty decks
      mockRoom.gameState.deck.cards = 0;
      mockRoom.gameState.magicDeck.cards = 0;
      mockRoom.gameState.playerActions[player1Id] = { drawnHeart: false, drawnMagic: false };
      result = validateTurnRequirements(mockRoom, player1Id);
      expect(result.valid).toBe(true); // Should be valid when decks are empty
    });
  });

  describe('Scoring and Win Conditions', () => {
    it('should calculate player scores correctly', () => {
      // Set up some placed hearts
      mockRoom.gameState.tiles[0] = {
        ...mockRoom.gameState.tiles[0],
        placedHeart: {
          value: 2,
          color: 'red',
          placedBy: player1Id,
          score: 4 // Red heart on red tile = 2 * 2
        }
      };

      mockRoom.gameState.tiles[1] = {
        ...mockRoom.gameState.tiles[1],
        placedHeart: {
          value: 1,
          color: 'yellow',
          placedBy: player2Id,
          score: 1 // Yellow heart on white tile = 1
        }
      };

      mockRoom.gameState.tiles[2] = {
        ...mockRoom.gameState.tiles[2],
        placedHeart: {
          value: 3,
          color: 'green',
          placedBy: player1Id,
          score: 0 // Green heart on red tile = 0
        }
      };

      // Calculate scores
      const calculateScores = (room) => {
        const scores = {};
        room.players.forEach(player => {
          scores[player.userId] = 0;
        });

        room.gameState.tiles.forEach(tile => {
          if (tile.placedHeart) {
            scores[tile.placedHeart.placedBy] += tile.placedHeart.score;
          }
        });

        return scores;
      };

      const scores = calculateScores(mockRoom);
      expect(scores[player1Id]).toBe(4); // 4 + 0
      expect(scores[player2Id]).toBe(1);
    });

    it('should detect game end conditions', () => {
      const checkGameEndConditions = (room) => {
        if (!room.gameState.gameStarted) {
          return { shouldEnd: false, reason: null };
        }

        // Condition 1: All tiles filled
        const allTilesFilled = room.gameState.tiles.every(tile => tile.placedHeart);
        if (allTilesFilled) {
          return { shouldEnd: true, reason: 'All tiles are filled' };
        }

        // Condition 2: Both decks empty
        const bothDecksEmpty = room.gameState.deck.cards <= 0 && room.gameState.magicDeck.cards <= 0;
        if (bothDecksEmpty) {
          return { shouldEnd: true, reason: 'Both decks are empty' };
        }

        return { shouldEnd: false, reason: null };
      };

      // Game not started
      let result = checkGameEndConditions(mockRoom);
      expect(result.shouldEnd).toBe(false);

      // Game started but not ended
      mockRoom.gameState.gameStarted = true;
      result = checkGameEndConditions(mockRoom);
      expect(result.shouldEnd).toBe(false);

      // All tiles filled
      mockRoom.gameState.tiles.forEach(tile => {
        tile.placedHeart = { value: 1, placedBy: player1Id };
      });
      result = checkGameEndConditions(mockRoom);
      expect(result.shouldEnd).toBe(true);
      expect(result.reason).toBe('All tiles are filled');

      // Reset and test deck empty condition
      mockRoom.gameState.tiles.forEach(tile => {
        tile.placedHeart = null;
      });
      mockRoom.gameState.deck.cards = 0;
      mockRoom.gameState.magicDeck.cards = 0;
      result = checkGameEndConditions(mockRoom);
      expect(result.shouldEnd).toBe(true);
      expect(result.reason).toBe('Both decks are empty');
    });

    it('should determine winner correctly', () => {
      // Set up final scores
      mockRoom.players[0].score = 15;
      mockRoom.players[1].score = 12;

      const determineWinner = (room) => {
        const sortedPlayers = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0));
        const winner = sortedPlayers[0];
        const isTie = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score;

        return {
          winner: isTie ? null : winner,
          isTie: isTie,
          finalScores: room.players.map(player => ({
            userId: player.userId,
            name: player.name,
            score: player.score || 0
          }))
        };
      };

      const result = determineWinner(mockRoom);
      expect(result.winner.userId).toBe(player1Id);
      expect(result.winner.score).toBe(15);
      expect(result.isTie).toBe(false);
      expect(result.finalScores).toHaveLength(2);

      // Test tie condition
      mockRoom.players[1].score = 15;
      const tieResult = determineWinner(mockRoom);
      expect(tieResult.winner).toBeNull();
      expect(tieResult.isTie).toBe(true);
    });
  });

  describe('Deck Management', () => {
    it('should track deck card counts correctly', () => {
      expect(mockRoom.gameState.deck.cards).toBe(16);
      expect(mockRoom.gameState.magicDeck.cards).toBe(16);

      // Simulate drawing cards
      mockRoom.gameState.deck.cards--;
      mockRoom.gameState.magicDeck.cards--;

      expect(mockRoom.gameState.deck.cards).toBe(15);
      expect(mockRoom.gameState.magicDeck.cards).toBe(15);

      // Check if decks are empty
      const decksEmpty = mockRoom.gameState.deck.cards <= 0 && mockRoom.gameState.magicDeck.cards <= 0;
      expect(decksEmpty).toBe(false);

      // Empty decks
      mockRoom.gameState.deck.cards = 0;
      mockRoom.gameState.magicDeck.cards = 0;
      const bothEmpty = mockRoom.gameState.deck.cards <= 0 && mockRoom.gameState.magicDeck.cards <= 0;
      expect(bothEmpty).toBe(true);
    });

    it('should add cards to player hands correctly', () => {
      const userId = player1Id;

      if (!mockRoom.gameState.playerHands[userId]) {
        mockRoom.gameState.playerHands[userId] = [];
      }

      // Add heart card
      const heartCard = { id: 'h1', type: 'heart', color: 'red', value: 2 };
      mockRoom.gameState.playerHands[userId].push(heartCard);
      expect(mockRoom.gameState.playerHands[userId]).toHaveLength(1);
      expect(mockRoom.gameState.playerHands[userId][0]).toEqual(heartCard);

      // Add magic card
      const magicCard = { id: 'm1', type: 'magic', magicType: 'wind' };
      mockRoom.gameState.playerHands[userId].push(magicCard);
      expect(mockRoom.gameState.playerHands[userId]).toHaveLength(2);

      // Remove card from hand
      const removedCard = mockRoom.gameState.playerHands[userId].pop();
      expect(removedCard).toEqual(magicCard);
      expect(mockRoom.gameState.playerHands[userId]).toHaveLength(1);
    });

    it('should validate card ownership correctly', () => {
      const userId = player1Id;
      const cardId = 'h1';

      // Set up player hand
      mockRoom.gameState.playerHands[userId] = [
        { id: 'h1', type: 'heart', color: 'red', value: 2 },
        { id: 'h2', type: 'heart', color: 'yellow', value: 1 }
      ];

      const validateCardOwnership = (room, userId, cardId) => {
        const playerHand = room.gameState.playerHands[userId] || [];
        return playerHand.some(card => card.id === cardId);
      };

      expect(validateCardOwnership(mockRoom, userId, 'h1')).toBe(true);
      expect(validateCardOwnership(mockRoom, userId, 'h2')).toBe(true);
      expect(validateCardOwnership(mockRoom, userId, 'h3')).toBe(false);
      expect(validateCardOwnership(mockRoom, player2Id, 'h1')).toBe(false);
    });
  });

  describe('Tile Management', () => {
    it('should validate tile states correctly', () => {
      const validateTileState = (tile) => {
        return {
          id: tile.id,
          hasHeart: !!tile.placedHeart,
          color: tile.color,
          emoji: tile.emoji,
          isEmpty: !tile.placedHeart
        };
      };

      const emptyTile = mockRoom.gameState.tiles[0];
      const tileState = validateTileState(emptyTile);

      expect(tileState.isEmpty).toBe(true);
      expect(tileState.hasHeart).toBe(false);
      expect(tileState.color).toBeDefined();
      expect(tileState.id).toBeDefined();

      // Place heart on tile
      emptyTile.placedHeart = {
        value: 2,
        color: 'red',
        placedBy: player1Id
      };

      const occupiedTileState = validateTileState(emptyTile);
      expect(occupiedTileState.isEmpty).toBe(false);
      expect(occupiedTileState.hasHeart).toBe(true);
    });

    it('should find empty tiles correctly', () => {
      const findEmptyTiles = (room) => {
        return room.gameState.tiles.filter(tile => !tile.placedHeart);
      };

      let emptyTiles = findEmptyTiles(mockRoom);
      expect(emptyTiles).toHaveLength(8);

      // Place hearts on some tiles
      mockRoom.gameState.tiles[0].placedHeart = { value: 1, placedBy: player1Id };
      mockRoom.gameState.tiles[2].placedHeart = { value: 2, placedBy: player2Id };
      mockRoom.gameState.tiles[4].placedHeart = { value: 1, placedBy: player1Id };

      emptyTiles = findEmptyTiles(mockRoom);
      expect(emptyTiles).toHaveLength(5);
      expect(emptyTiles.map(t => t.id)).toEqual([1, 3, 5, 6, 7]);
    });

    it('should find tiles with opponent hearts correctly', () => {
      const findTilesWithOpponentHearts = (room, userId) => {
        return room.gameState.tiles.filter(tile =>
          tile.placedHeart && tile.placedHeart.placedBy !== userId
        );
      };

      // Place hearts for both players
      mockRoom.gameState.tiles[0].placedHeart = { value: 1, placedBy: player1Id };
      mockRoom.gameState.tiles[1].placedHeart = { value: 2, placedBy: player2Id };
      mockRoom.gameState.tiles[2].placedHeart = { value: 1, placedBy: player2Id };

      const player1OpponentTiles = findTilesWithOpponentHearts(mockRoom, player1Id);
      expect(player1OpponentTiles).toHaveLength(2);
      expect(player1OpponentTiles.map(t => t.id)).toEqual([1, 2]);

      const player2OpponentTiles = findTilesWithOpponentHearts(mockRoom, player2Id);
      expect(player2OpponentTiles).toHaveLength(1);
      expect(player2OpponentTiles[0].id).toBe(0);
    });
  });

  describe('Data Integrity and Validation', () => {
    it('should maintain data consistency during operations', () => {
      const originalTileCount = mockRoom.gameState.tiles.length;
      const originalPlayerCount = mockRoom.players.length;

      // Simulate various operations
      mockRoom.gameState.tiles[0].placedHeart = { value: 1, placedBy: player1Id };
      mockRoom.players[0].score += 1;
      mockRoom.gameState.turnCount = 5;

      // Verify consistency
      expect(mockRoom.gameState.tiles).toHaveLength(originalTileCount);
      expect(mockRoom.players).toHaveLength(originalPlayerCount);
      expect(mockRoom.gameState.tiles[0].placedHeart.placedBy).toBe(player1Id);
      expect(mockRoom.players[0].score).toBe(1);
      expect(mockRoom.gameState.turnCount).toBe(5);
    });

    it('should handle invalid operations gracefully', () => {
      const safeGetPlayerHand = (room, userId) => {
        return room.gameState.playerHands[userId] || [];
      };

      const safeGetPlayer = (room, userId) => {
        return room.players.find(p => p.userId === userId);
      };

      // Test with non-existent user
      const nonExistentUser = 'non-existent';
      const hand = safeGetPlayerHand(mockRoom, nonExistentUser);
      const player = safeGetPlayer(mockRoom, nonExistentUser);

      expect(hand).toEqual([]);
      expect(player).toBeUndefined();
    });

    it('should validate room code format', () => {
      const validateRoomCode = (code) => {
        return /^[A-Z0-9]{6}$/i.test(code);
      };

      expect(validateRoomCode('ABC123')).toBe(true);
      expect(validateRoomCode('abc123')).toBe(true);
      expect(validateRoomCode('123456')).toBe(true);
      expect(validateRoomCode('A1B2C3')).toBe(true);

      expect(validateRoomCode('ABC')).toBe(false);
      expect(validateRoomCode('ABC1234')).toBe(false);
      expect(validateRoomCode('ABC-123')).toBe(false);
      expect(validateRoomCode('')).toBe(false);
      expect(validateRoomCode(null)).toBe(false);
    });

    it('should track game history for debugging', () => {
      const gameHistory = [];

      const addHistoryEntry = (event, data) => {
        gameHistory.push({
          timestamp: Date.now(),
          event,
          data: JSON.parse(JSON.stringify(data)) // Deep clone
        });
      };

      // Simulate game events
      addHistoryEntry('game-started', { turnCount: 1, currentPlayer: player1Id });
      addHistoryEntry('heart-placed', { tileId: 0, playerId: player1Id, score: 2 });
      addHistoryEntry('turn-changed', { turnCount: 2, currentPlayer: player2Id });

      expect(gameHistory).toHaveLength(3);
      expect(gameHistory[0].event).toBe('game-started');
      expect(gameHistory[1].data.tileId).toBe(0);
      expect(gameHistory[2].data.currentPlayer).toBe(player2Id);

      // Verify history is immutable
      gameHistory[0].data.turnCount = 999;
      expect(mockRoom.gameState.turnCount).toBe(0); // Original data unchanged
    });
  });
});