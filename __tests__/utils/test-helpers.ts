import { ShieldCard, WindCard, RecycleCard, HeartCard } from '../../src/lib/cards.js'

/**
 * Test helper utilities for Shield card testing
 */

export interface MockGameState {
  turnCount: number
  tiles: Array<{
    id: number
    color: string
    emoji: string
    placedHeart?: {
      color: string
      value: number
      placedBy: string
    }
  }>
  shields: Record<string, any>
  playerHands: Record<string, any[]>
}

export interface MockPlayer {
  id: string
  name: string
  socketId: string
}

export function createMockGameState(turnCount: number = 1): MockGameState {
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

export function createMockPlayers(): [MockPlayer, MockPlayer] {
  return [
    { id: 'player1', name: 'Player 1', socketId: 'socket1' },
    { id: 'player2', name: 'Player 2', socketId: 'socket2' }
  ]
}

export function setupShieldProtection(
  gameState: MockGameState,
  playerId: string,
  turnCount: number = 1
): void {
  const shieldCard = new ShieldCard('test-shield')
  shieldCard.executeEffect(gameState, playerId)
  gameState.turnCount = turnCount
}

export function simulateWindCardAttack(
  gameState: MockGameState,
  targetTileId: number,
  attackerId: string
): any {
  const windCard = new WindCard('test-wind')
  return windCard.executeEffect(gameState, targetTileId, attackerId)
}

export function simulateRecycleCardAttack(
  gameState: MockGameState,
  targetTileId: number
): any {
  const recycleCard = new RecycleCard('test-recycle')
  return recycleCard.executeEffect(gameState, targetTileId)
}

export function advanceTurns(gameState: MockGameState, turns: number): void {
  gameState.turnCount += turns
}

export function isShieldActive(gameState: MockGameState, playerId: string): boolean {
  return ShieldCard.isPlayerProtected(gameState, playerId, gameState.turnCount)
}

export function getShieldRemainingTurns(gameState: MockGameState, playerId: string): number {
  const shield = gameState.shields[playerId]
  return ShieldCard.getRemainingTurns(shield, gameState.turnCount)
}

export function createComplexGameScenario(): {
  gameState: MockGameState
  player1: MockPlayer
  player2: MockPlayer
} {
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

export function expectShieldProtectionError(fn: () => void, expectedMessage: string): void {
  expect(fn).toThrow(expectedMessage)
}

export function expectSuccessfulCardAction(result: any, expectedType: string): void {
  expect(result).toBeDefined()
  expect(result.type).toBe(expectedType)
}

export function cleanupExpiredShields(gameState: MockGameState): void {
  for (const [userId, shield] of Object.entries(gameState.shields)) {
    if (!ShieldCard.isActive(shield, gameState.turnCount)) {
      delete gameState.shields[userId]
    }
  }
}

export function serializeGameState(gameState: MockGameState): string {
  return JSON.stringify(gameState)
}

export function deserializeGameState(serializedState: string): MockGameState {
  return JSON.parse(serializedState)
}