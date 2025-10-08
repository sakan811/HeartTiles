/**
 * Card system classes for better game state management
 * This helps with type safety and game logic organization
 */

// Base card class
export class BaseCard {
  constructor(id, type, emoji, name, description) {
    this.id = id;
    this.type = type;
    this.emoji = emoji;
    this.name = name;
    this.description = description;
  }

  // Method to check if this card can target a specific tile
  canTargetTile() {
    return true; // Base implementation
  }

  // Method to execute card effect
  executeEffect() {
    throw new Error('executeEffect must be implemented by subclass');
  }
}

// Heart card class
export class HeartCard extends BaseCard {
  constructor(id, color, value, emoji) {
    super(id, 'heart', emoji, `${color} heart`, `A ${color} heart card worth ${value} points`);
    this.color = color;
    this.value = value;
  }

  canTargetTile(tile) {
    // Hearts can only be placed on empty tiles
    return !tile.placedHeart;
  }

  calculateScore(tile) {
    if (tile.color === 'white') return this.value;
    return this.color === tile.color ? this.value * 2 : 0;
  }

  // Get heart colors available in the game
  static getAvailableColors() {
    return ["red", "yellow", "green"];
  }

  // Get corresponding emojis for colors
  static getColorEmojis() {
    return ["❤️", "💛", "💚"];
  }

  // Generate a random heart card
  static generateRandom() {
    const colors = this.getAvailableColors();
    const emojis = this.getColorEmojis();
    const randomIndex = Math.floor(Math.random() * colors.length);
    const randomValue = Math.floor(Math.random() * 3) + 1; // 1-3 points

    return new HeartCard(
      Date.now() + Math.random(),
      colors[randomIndex],
      randomValue,
      emojis[randomIndex]
    );
  }
}

// Magic card base class
export class MagicCard extends BaseCard {
  constructor(id, type, emoji, name, description) {
    super(id, type, emoji, name, description);
  }

  // Override for magic-specific targeting rules
  canTargetTile() {
    return true; // Base implementation, subclasses will override
  }
}

// Wind magic card class
export class WindCard extends MagicCard {
  constructor(id) {
    super(id, 'wind', '💨', 'Wind Card', 'Remove opponent heart from a tile');
  }

  canTargetTile(tile, playerId) {
    // Wind can only target tiles with opponent hearts
    return tile.placedHeart && tile.placedHeart.placedBy !== playerId;
  }

  executeEffect(gameState, targetTileId, playerId) {
    const tile = gameState.tiles.find(t => t.id == targetTileId);
    if (!tile || !this.canTargetTile(tile, playerId)) {
      throw new Error('Invalid target for Wind card');
    }

    // Check shield protection using the new ShieldCard protection logic
    const opponentId = tile.placedHeart.placedBy;
    const currentTurnCount = gameState.turnCount || 1;

    if (ShieldCard.isPlayerProtected(gameState, opponentId, currentTurnCount)) {
      const remainingTurns = ShieldCard.getRemainingTurns(gameState.shields[opponentId], currentTurnCount);
      throw new Error(`Opponent is protected by Shield (${remainingTurns} turns remaining)`);
    }

    // CRITICAL RULE: Tile color preservation - the tile color ALWAYS remains unchanged after heart removal
    const originalTileColor = tile.color; // Use current tile color, not stored original
    const colorEmojis = {
      'red': '🟥', 'yellow': '🟨', 'green': '🟩', 'white': '⬜'
    };

    // Return the action result for broadcasting
    return {
      type: 'wind',
      removedHeart: tile.placedHeart,
      targetedPlayerId: opponentId,
      tileId: tile.id,
      newTileState: {
        id: tile.id,
        color: originalTileColor, // Tile color remains unchanged
        emoji: colorEmojis[originalTileColor] || '⬜',
        placedHeart: undefined
      }
    };
  }
}

// Recycle magic card class
export class RecycleCard extends MagicCard {
  constructor(id) {
    super(id, 'recycle', '♻️', 'Recycle Card', 'Change tile color to white');
  }

  canTargetTile(tile) {
    // Recycle can only target empty, non-white tiles
    return !tile.placedHeart && tile.color !== 'white';
  }

  executeEffect(gameState, targetTileId) {
    const tile = gameState.tiles.find(t => t.id == targetTileId);
    if (!tile || !this.canTargetTile(tile)) {
      throw new Error('Invalid target for Recycle card');
    }

    // Check shield protection using the new ShieldCard protection logic
    // Recycle protects tiles from any player who has active hearts on the board
    const currentTurnCount = gameState.turnCount || 1;

    if (gameState.shields) {
      for (const [shieldUserId, shield] of Object.entries(gameState.shields)) {
        if (ShieldCard.isActive(shield, currentTurnCount)) {
          // Check if this shielded player has hearts on the board
          const hasPlayerHearts = gameState.tiles.some(t => t.placedHeart && t.placedHeart.placedBy === shieldUserId);
          if (hasPlayerHearts) {
            const remainingTurns = ShieldCard.getRemainingTurns(shield, currentTurnCount);
            throw new Error(`Tile is protected by Shield (${remainingTurns} turns remaining)`);
          }
        }
      }
    }

    // Return the action result for broadcasting
    return {
      type: 'recycle',
      previousColor: tile.color,
      newColor: 'white',
      tileId: tile.id,
      newTileState: {
        id: tile.id,
        color: 'white',
        emoji: '⬜',
        placedHeart: undefined
      }
    };
  }
}

// Shield magic card class
export class ShieldCard extends MagicCard {
  constructor(id) {
    super(id, 'shield', '🛡️', 'Shield Card', 'Self-activating: Protect your tiles and hearts from opponent\'s magic cards until end of your next turn');
  }

  canTargetTile() {
    // Shield cards don't target tiles, they target self
    return false;
  }

  executeEffect(gameState, playerId) {
    // Shield doesn't need a target tile, it protects the player
    if (!gameState.shields) {
      gameState.shields = {};
    }

    // Check if player can activate shield under current conditions
    const activationCheck = ShieldCard.canActivateShield(gameState, playerId);
    if (!activationCheck.canActivate) {
      throw new Error(activationCheck.reason);
    }

    // Check if player already has an active shield
    const currentTurnCount = gameState.turnCount || 1;
    const existingShield = gameState.shields[playerId];
    if (existingShield && ShieldCard.isActive(existingShield, currentTurnCount)) {
      // Allow reinforcement but reset the duration
      gameState.shields[playerId] = {
        active: true,
        remainingTurns: 2, // Reset to full duration
        activatedAt: Date.now(),
        activatedBy: playerId,
        turnActivated: currentTurnCount,
        protectedPlayerId: playerId
      };

      return {
        type: 'shield',
        activatedFor: playerId,
        protectedPlayerId: playerId,
        remainingTurns: 2,
        message: `Shield reinforced! Protection extended for 2 more turns.`,
        reinforced: true
      };
    }

    // Activate new shield for player (duration: until end of player's next turn)
    // This means the shield protects during opponent's next turn and player's next turn
    gameState.shields[playerId] = {
      active: true,
      remainingTurns: 2, // Opponent's turn + player's next turn
      activatedAt: Date.now(),
      activatedBy: playerId,
      turnActivated: currentTurnCount,
      protectedPlayerId: playerId // Explicitly track which player is protected
    };

    return {
      type: 'shield',
      activatedFor: playerId,
      protectedPlayerId: playerId,
      remainingTurns: 2,
      message: `Shield activated! Your tiles and hearts are protected until end of your next turn.`,
      reinforced: false
    };
  }

  // Check if shield is still active based on game turn count
  static isActive(shield, turnCount) {
    if (!shield || !shield.turnActivated) return false;
    const turnsSinceActivation = turnCount - shield.turnActivated;
    // Shield is active for 2 turns: opponent's next turn + player's next turn
    return turnsSinceActivation < 2;
  }

  // Get remaining turns for UI display
  static getRemainingTurns(shield, turnCount) {
    if (!this.isActive(shield, turnCount)) return 0;
    const turnsSinceActivation = turnCount - shield.turnActivated;
    return Math.max(0, 2 - turnsSinceActivation);
  }

  // Check if a player's tiles are protected by shield
  static isPlayerProtected(gameState, playerId, currentTurnCount) {
    if (!gameState.shields || !gameState.shields[playerId]) return false;
    const shield = gameState.shields[playerId];
    return this.isActive(shield, currentTurnCount);
  }

  // Check if a specific tile is protected (belongs to a shielded player)
  static isTileProtected(gameState, tile, currentTurnCount) {
    if (!tile.placedHeart) return false; // Empty tiles don't need protection
    const playerId = tile.placedHeart.placedBy;
    return this.isPlayerProtected(gameState, playerId, currentTurnCount);
  }

  // Check if shield can be replaced (cannot replace opponent's shield)
  static canReplaceShield(gameState, opponentId) {
    // Cannot replace opponent's active shield
    if (gameState.shields && gameState.shields[opponentId]) {
      const opponentShield = gameState.shields[opponentId];
      if (this.isActive(opponentShield, gameState.turnCount || 1)) {
        return false;
      }
    }
    return true;
  }

  // Check if player can activate a shield under current conditions
  static canActivateShield(gameState, playerId) {
    const currentTurnCount = gameState.turnCount || 1;

    // Check if any opponent has an active shield (prevents activation)
    if (gameState.shields) {
      for (const [otherPlayerId, shield] of Object.entries(gameState.shields)) {
        if (otherPlayerId !== playerId && this.isActive(shield, currentTurnCount)) {
          return {
            canActivate: false,
            reason: `Cannot activate Shield while opponent has active Shield (${this.getRemainingTurns(shield, currentTurnCount)} turns remaining)`
          };
        }
      }
    }

    return { canActivate: true, reason: null };
  }
}

// Card factory functions
export function createHeartCard(id, color, value, emoji) {
  return new HeartCard(id, color, value, emoji);
}

export function createMagicCard(id, type) {
  switch (type) {
    case 'wind':
      return new WindCard(id);
    case 'recycle':
      return new RecycleCard(id);
    case 'shield':
      return new ShieldCard(id);
    default:
      throw new Error(`Unknown magic card type: ${type}`);
  }
}

// Deck generation functions following game rules
export function generateHeartDeck(count = 16) {
  const hearts = [];
  for (let i = 0; i < count; i++) {
    hearts.push(HeartCard.generateRandom());
  }
  return hearts;
}

export function generateMagicDeck() {
  const cards = [];
  const baseTime = Date.now();

  // Game rule: 6 Wind, 5 Recycle, 5 Shield cards (total 16)
  for (let i = 0; i < 16; i++) {
    let cardType;
    if (i < 6) {
      cardType = 'wind'; // 6 Wind cards
    } else if (i < 11) {
      cardType = 'recycle'; // 5 Recycle cards
    } else {
      cardType = 'shield'; // 5 Shield cards
    }

    cards.push(createMagicCard(baseTime + i + 1, cardType));
  }

  return cards;
}

// Weighted random selection for drawing single magic cards
export function generateRandomMagicCard() {
  const cardTypes = [
    { type: 'wind', weight: 6 },
    { type: 'recycle', weight: 5 },
    { type: 'shield', weight: 5 }
  ];

  const totalWeight = cardTypes.reduce((sum, card) => sum + card.weight, 0);
  let random = Math.random() * totalWeight;

  let selectedType = 'wind'; // default
  for (const cardType of cardTypes) {
    random -= cardType.weight;
    if (random <= 0) {
      selectedType = cardType.type;
      break;
    }
  }

  return createMagicCard(Date.now() + Math.random(), selectedType);
}

// Helper function to create card from raw data
export function createCardFromData(cardData) {
  if (cardData.type === 'heart' || (cardData.color && cardData.value !== undefined)) {
    return createHeartCard(cardData.id, cardData.color, cardData.value, cardData.emoji);
  } else if (cardData.type && ['wind', 'recycle', 'shield'].includes(cardData.type)) {
    return createMagicCard(cardData.id, cardData.type);
  }
  throw new Error('Invalid card data');
}

// Card validation helpers
export function isHeartCard(card) {
  return card instanceof HeartCard || (card.color && card.value !== undefined && ['❤️', '💛', '💚'].includes(card.emoji));
}

export function isMagicCard(card) {
  return card instanceof MagicCard || (card.type && ['wind', 'recycle', 'shield'].includes(card.type));
}

export function getCardType(card) {
  if (isHeartCard(card)) return 'heart';
  if (isMagicCard(card)) return 'magic';
  return 'unknown';
}