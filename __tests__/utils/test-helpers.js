import { ShieldCard, WindCard, RecycleCard, HeartCard } from '../../src/lib/cards.js'

/**
 * Test helper utilities for Shield card testing
 */

export function createMockGameState(turnCount = 1) {
  return {
    turnCount,
    tiles: [
      { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, placedBy: 'player1' } },
      { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, placedBy: 'player2' } },
      { id: 3, color: 'green', emoji: '🟩', placedHeart: null },
      { id: 4, color: 'white', emoji: '⬜', placedHeart: null },
      { id: 5, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 3, placedBy: 'player1' } }
    ],
    shields: {},
    playerHands: {
      player1: [],
      player2: []
    }
  }
}

export function createMockPlayers() {
  return [
    { id: 'player1', name: 'Player 1', socketId: 'socket1' },
    { id: 'player2', name: 'Player 2', socketId: 'socket2' }
  ]
}

export function setupShieldProtection(
  gameState,
  playerId,
  turnCount = 1
) {
  const shieldCard = new ShieldCard('test-shield')
  shieldCard.executeEffect(gameState, playerId)
  gameState.turnCount = turnCount
}

export function simulateWindCardAttack(
  gameState,
  targetTileId,
  attackerId
) {
  const windCard = new WindCard('test-wind')
  return windCard.executeEffect(gameState, targetTileId, attackerId)
}

export function simulateRecycleCardAttack(
  gameState,
  targetTileId
) {
  const recycleCard = new RecycleCard('test-recycle')
  return recycleCard.executeEffect(gameState, targetTileId)
}

export function advanceTurns(gameState, turns) {
  gameState.turnCount += turns
}

export function isShieldActive(gameState, playerId) {
  return ShieldCard.isPlayerProtected(gameState, playerId, gameState.turnCount)
}

export function getShieldRemainingTurns(gameState, playerId) {
  const shield = gameState.shields[playerId]
  return ShieldCard.getRemainingTurns(shield, gameState.turnCount)
}

export function createComplexGameScenario() {
  const [player1, player2] = createMockPlayers()
  const gameState = createMockGameState()

  // Add some hearts to tiles
  gameState.tiles = [
    { id: 1, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 2, placedBy: player1.id } },
    { id: 2, color: 'yellow', emoji: '🟨', placedHeart: { color: 'yellow', value: 1, placedBy: player2.id } },
    { id: 3, color: 'green', emoji: '🟩', placedHeart: { color: 'green', value: 3, placedBy: player1.id } },
    { id: 4, color: 'white', emoji: '⬜', placedHeart: null },
    { id: 5, color: 'red', emoji: '🟥', placedHeart: { color: 'red', value: 1, placedBy: player2.id } },
    { id: 6, color: 'yellow', emoji: '🟨', placedHeart: null },
    { id: 7, color: 'green', emoji: '🟩', placedHeart: { color: 'green', value: 2, placedBy: player1.id } },
    { id: 8, color: 'white', emoji: '⬜', placedHeart: null }
  ]

  // Setup player hands with various cards
  gameState.playerHands[player1.id] = [
    new ShieldCard('shield-p1-1'),
    new WindCard('wind-p1-1'),
    new RecycleCard('recycle-p1-1'),
    new HeartCard('heart-p1-1', 'blue', 2, '💙')
  ]

  gameState.playerHands[player2.id] = [
    new ShieldCard('shield-p2-1'),
    new WindCard('wind-p2-1'),
    new RecycleCard('recycle-p2-1'),
    new HeartCard('heart-p2-1', 'red', 3, '❤️')
  ]

  return { gameState, player1, player2 }
}

export function expectShieldProtectionError(fn, expectedMessage) {
  expect(fn).toThrow(expectedMessage)
}

export function expectSuccessfulCardAction(result, expectedType) {
  expect(result).toBeDefined()
  expect(result.type).toBe(expectedType)
}

export function cleanupExpiredShields(gameState) {
  for (const [userId, shield] of Object.entries(gameState.shields)) {
    if (!ShieldCard.isActive(shield, gameState.turnCount)) {
      delete gameState.shields[userId]
    }
  }
}

export function serializeGameState(gameState) {
  return JSON.stringify(gameState)
}

export function deserializeGameState(serializedState) {
  return JSON.parse(serializedState)
}