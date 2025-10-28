// Mock Socket.IO Server for Integration Testing
// This provides a simplified mock server for testing Socket.IO events without needing the full server implementation
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import {
  validateRoomCode,
  validatePlayerName,
  generateTiles,
  selectRandomStartingPlayer,
  calculateScore,
  checkGameEndConditions
} from '../../server.js'

export class MockSocketServer {
  constructor() {
    this.httpServer = null
    this.io = null
    this.port = null
    this.rooms = new Map() // Mock room storage
    this.connectedSockets = new Map()
  }

  async start() {
    // Create HTTP server
    this.httpServer = createServer()

    // Create Socket.IO server
    this.io = new Server(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['polling', 'websocket']
    })

    // Set up authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token
        console.log('Mock server: Auth token:', token)

        if (!token) {
          console.log('Mock server: No token provided, rejecting connection')
          return next(new Error('Authentication required'))
        }

        // Mock token validation for testing
        console.log('Mock server: Validating token:', JSON.stringify(token, null, 2))
        if (token.id && token.jti && token.email) {
          socket.data.userId = token.id
          socket.data.userName = token.name || `User ${token.id}`
          socket.data.userEmail = token.email
          socket.data.userSessionId = token.jti
          console.log('Mock server: Authentication successful for user:', socket.data.userId)
          return next()
        }

        console.log('Mock server: Invalid token - missing required fields')
        next(new Error('Invalid authentication token'))
      } catch (error) {
        next(new Error('Authentication failed'))
      }
    })

    // Set up connection handler
    this.io.on('connection', (socket) => {
      console.log(`Mock server: Client connected: ${socket.id} (User: ${socket.data.userId})`)

      this.connectedSockets.set(socket.id, {
        socket,
        userId: socket.data.userId,
        userName: socket.data.userName,
        userEmail: socket.data.userEmail,
        roomCode: null
      })

      // Handle join-room
      socket.on('join-room', async (data) => {
        await this.handleJoinRoom(socket, data)
      })

      // Handle leave-room
      socket.on('leave-room', async (data) => {
        await this.handleLeaveRoom(socket, data)
      })

      // Handle player-ready
      socket.on('player-ready', async (data) => {
        await this.handlePlayerReady(socket, data)
      })

      // Handle place-heart
      socket.on('place-heart', async (data) => {
        await this.handlePlaceHeart(socket, data)
      })

      // Handle draw-heart
      socket.on('draw-heart', async (data) => {
        await this.handleDrawHeart(socket, data)
      })

      // Handle draw-magic-card
      socket.on('draw-magic-card', async (data) => {
        await this.handleDrawMagicCard(socket, data)
      })

      // Handle use-magic-card
      socket.on('use-magic-card', async (data) => {
        await this.handleUseMagicCard(socket, data)
      })

      // Handle end-turn
      socket.on('end-turn', async (data) => {
        await this.handleEndTurn(socket, data)
      })

      // Handle shuffle-tiles
      socket.on('shuffle-tiles', async (data) => {
        await this.handleShuffleTiles(socket, data)
      })

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket)
      })
    })

    // Start listening on available port
    return new Promise((resolve, reject) => {
      this.httpServer.listen(0, (err) => {
        if (err) {
          reject(err)
        } else {
          this.port = this.httpServer.address().port
          console.log(`Mock server: Listening on port ${this.port}`)
          resolve(this.port)
        }
      })
    })
  }

  async handleJoinRoom(socket, data) {
    try {
      const { roomCode } = data

      // Validate room code
      if (!validateRoomCode(roomCode)) {
        socket.emit('room-error', 'Invalid room code')
        return
      }

      // Get or create room
      let room = this.rooms.get(roomCode)
      if (!room) {
        room = this.createMockRoom(roomCode)
        this.rooms.set(roomCode, room)
      }

      // Check if room is full
      if (room.players.length >= room.maxPlayers) {
        socket.emit('room-error', 'Room is full')
        return
      }

      // Extract base userId for unique ID handling (for tests)
      const baseUserId = socket.data.userId.split('-').slice(0, -2).join('-') || socket.data.userId

      // Check if player already in room (using base userId)
      const existingPlayer = room.players.find(p => {
        const playerBaseId = p.userId.split('-').slice(0, -2).join('-') || p.userId
        return playerBaseId === baseUserId
      })
      if (existingPlayer) {
        socket.emit('room-error', 'Already in room')
        return
      }

      // Log for debugging
      console.log(`MockSocketServer: User ${socket.data.userName || socket.data.userId || 'undefined'} joined room ${roomCode}`)

      // Add player to room
      const player = {
        userId: socket.data.userId,
        name: socket.data.userName,
        email: socket.data.userEmail,
        isReady: false,
        score: 0,
        joinedAt: new Date(),
        socketId: socket.id
      }

      room.players.push(player)
      this.connectedSockets.get(socket.id).roomCode = roomCode

      // Join socket room
      socket.join(roomCode)

      // Send response to joining player
      socket.emit('room-joined', {
        roomCode,
        players: room.players,
        playerId: socket.data.userId,
        gameState: room.gameState
      })

      // Notify other players
      socket.to(roomCode).emit('player-joined', {
        roomCode,
        players: room.players,
        newPlayer: player
      })

    } catch (error) {
      console.error('Mock server: Error in join-room:', error)
      socket.emit('room-error', 'Failed to join room')
    }
  }

  async handleLeaveRoom(socket, data) {
    try {
      const { roomCode } = data
      const room = this.rooms.get(roomCode)

      if (!room) {
        socket.emit('room-error', 'Room not found')
        return
      }

      // Remove player from room
      room.players = room.players.filter(p => p.userId !== socket.data.userId)
      this.connectedSockets.get(socket.id).roomCode = null

      // Leave socket room
      socket.leave(roomCode)

      // Send response
      socket.emit('player-left', {
        roomCode,
        players: room.players
      })

      // Notify other players
      socket.to(roomCode).emit('player-left', {
        roomCode,
        players: room.players,
        leftPlayerId: socket.data.userId
      })

      // Clean up empty room
      if (room.players.length === 0) {
        this.rooms.delete(roomCode)
      }

    } catch (error) {
      console.error('Mock server: Error in leave-room:', error)
      socket.emit('room-error', 'Failed to leave room')
    }
  }

  async handlePlayerReady(socket, data) {
    try {
      const { roomCode } = data
      const room = this.rooms.get(roomCode)

      if (!room) {
        socket.emit('room-error', 'Room not found')
        return
      }

      // Find player and toggle ready state
      const player = room.players.find(p => p.userId === socket.data.userId)
      if (!player) {
        socket.emit('room-error', 'Not in room')
        return
      }

      player.isReady = !player.isReady

      // Broadcast updated room state
      const response = {
        roomCode,
        players: room.players,
        playerId: socket.data.userId,
        isReady: player.isReady
      }

      this.io.to(roomCode).emit('player-ready', response)

      // Check if all players are ready and game should start
      if (room.players.length === room.maxPlayers && room.players.every(p => p.isReady)) {
        await this.startGame(room)
      }

    } catch (error) {
      console.error('Mock server: Error in player-ready:', error)
      socket.emit('room-error', 'Failed to update ready state')
    }
  }

  async startGame(room) {
    try {
      // Generate tiles
      room.gameState.tiles = generateTiles()

      // Select starting player
      const startingPlayer = selectRandomStartingPlayer(room.players)
      room.gameState.currentPlayer = startingPlayer
      room.gameState.turnCount = 1

      // Initialize player hands using real card system
      const { createInitialHand } = await import('../factories/card-factories.js')

      for (const player of room.players) {
        room.gameState.playerHands[player.userId] = createInitialHand(player.userId)
        // Initialize player actions for turn tracking
        room.gameState.playerActions[player.userId] = {
          drawnHeart: false,
          drawnMagic: false,
          heartsPlaced: 0,
          magicCardsUsed: 0
        }
      }

      // Mark game as started
      room.gameState.gameStarted = true

      // Include hand information in player objects for the broadcast
      const playersWithHands = room.players.map(player => ({
        ...player,
        hand: room.gameState.playerHands[player.userId] || []
      }))

      // Broadcast game start
      this.io.to(room.code).emit('game-start', {
        roomCode: room.code,
        gameState: room.gameState,
        players: playersWithHands,
        currentPlayer: room.gameState.currentPlayer,
        tiles: room.gameState.tiles,
        gameStarted: room.gameState.gameStarted,
        turnCount: room.gameState.turnCount
      })

    } catch (error) {
      console.error('Mock server: Error starting game:', error)
      this.io.to(room.code).emit('room-error', 'Failed to start game')
    }
  }

  async handlePlaceHeart(socket, data) {
    try {
      const { roomCode, tileId, heartId } = data
      const room = this.rooms.get(roomCode)

      if (!room || !room.gameState.gameStarted) {
        socket.emit('room-error', 'Game not started')
        return
      }

      // Validate turn
      if (room.gameState.currentPlayer.userId !== socket.data.userId) {
        socket.emit('room-error', 'Not your turn')
        return
      }

      // Find player and heart card
      const player = room.players.find(p => p.userId === socket.data.userId)
      if (!player) {
        socket.emit('room-error', 'Player not found')
        return
      }

      const playerHand = room.gameState.playerHands[socket.data.userId]
      if (!playerHand) {
        socket.emit('room-error', 'Player hand not initialized')
        return
      }

      const heartCard = playerHand.find(card => card.id === heartId && card.type === 'heart')

      if (!heartCard) {
        socket.emit('room-error', 'Invalid heart card')
        return
      }

      // Find tile
      const tile = room.gameState.tiles.find(t => t.id === tileId)
      if (!tile || tile.placedHeart) {
        socket.emit('room-error', 'Invalid tile')
        return
      }

      // Place heart (use real card logic)
      const { HeartCard } = await import('../../src/lib/cards.js')
      const heart = new HeartCard(heartCard.id, heartCard.color, heartCard.value, heartCard.emoji)
      const score = heart.calculateScore(tile)

      // Update tile
      tile.placedHeart = {
        id: heartCard.id,
        color: heartCard.color,
        value: heartCard.value,
        emoji: heartCard.emoji,
        placedBy: socket.data.userId,
        originalTileColor: tile.color
      }
      tile.color = heartCard.color
      tile.emoji = heartCard.emoji

      // Update player score
      player.score += score

      // Remove card from hand
      const cardIndex = playerHand.findIndex(card => card.id === heartId)
      playerHand.splice(cardIndex, 1)

      // Track player action
      if (!room.gameState.playerActions[socket.data.userId]) {
        room.gameState.playerActions[socket.data.userId] = {
          drawnHeart: false,
          drawnMagic: false,
          heartsPlaced: 0,
          magicCardsUsed: 0
        }
      }
      room.gameState.playerActions[socket.data.userId].heartsPlaced++

      // Include hand information in player objects for the broadcast
      const playersWithHands = room.players.map(player => ({
        ...player,
        hand: room.gameState.playerHands[player.userId] || []
      }))

      // Broadcast updated state
      this.io.to(roomCode).emit('heart-placed', {
        roomCode,
        tiles: room.gameState.tiles,
        players: playersWithHands,
        playerId: socket.data.userId,
        tileId,
        heartId,
        newScore: player.score
      })

    } catch (error) {
      console.error('Mock server: Error in place-heart:', error)
      socket.emit('room-error', 'Failed to place heart')
    }
  }

  async handleDrawHeart(socket, data) {
    try {
      const { roomCode } = data
      const room = this.rooms.get(roomCode)

      if (!room || !room.gameState.gameStarted) {
        socket.emit('room-error', 'Game not started')
        return
      }

      // Validate turn
      if (room.gameState.currentPlayer.userId !== socket.data.userId) {
        socket.emit('room-error', 'Not your turn')
        return
      }

      // Check if already drawn
      if (!room.gameState.playerActions[socket.data.userId]) {
        room.gameState.playerActions[socket.data.userId] = {
          drawnHeart: false,
          drawnMagic: false,
          heartsPlaced: 0,
          magicCardsUsed: 0
        }
      }

      if (room.gameState.playerActions[socket.data.userId].drawnHeart) {
        socket.emit('room-error', 'You can only draw one heart card per turn')
        return
      }

      // Check deck availability
      if (room.gameState.deck.cards <= 0) {
        socket.emit('room-error', 'No more cards in deck')
        return
      }

      // Generate heart card using real system
      const { generateRandomHeartCard } = await import('../factories/card-factories.js')
      const heartCard = generateRandomHeartCard()

      room.gameState.playerHands[socket.data.userId].push(heartCard)
      room.gameState.deck.cards--
      room.gameState.playerActions[socket.data.userId].drawnHeart = true

      // Include hand information in player objects for the broadcast
      const playersWithHands = room.players.map(player => ({
        ...player,
        hand: room.gameState.playerHands[player.userId] || []
      }));

      socket.emit('heart-drawn', {
        roomCode,
        heartCard,
        deck: room.gameState.deck,
        tiles: room.gameState.tiles,
        players: playersWithHands,
        gameState: {
          gameStarted: room.gameState.gameStarted,
          currentPlayer: room.gameState.currentPlayer,
          turnCount: room.gameState.turnCount,
          shields: room.gameState.shields
        }
      })

    } catch (error) {
      console.error('Mock server: Error in draw-heart:', error)
      socket.emit('room-error', 'Failed to draw heart')
    }
  }

  async handleDrawMagicCard(socket, data) {
    try {
      const { roomCode } = data
      const room = this.rooms.get(roomCode)

      if (!room || !room.gameState.gameStarted) {
        socket.emit('room-error', 'Game not started')
        return
      }

      // Validate turn
      if (room.gameState.currentPlayer.userId !== socket.data.userId) {
        socket.emit('room-error', 'Not your turn')
        return
      }

      // Check if already drawn
      if (!room.gameState.playerActions[socket.data.userId]) {
        room.gameState.playerActions[socket.data.userId] = {
          drawnHeart: false,
          drawnMagic: false,
          heartsPlaced: 0,
          magicCardsUsed: 0
        }
      }

      if (room.gameState.playerActions[socket.data.userId].drawnMagic) {
        socket.emit('room-error', 'You can only draw one magic card per turn')
        return
      }

      // Check deck availability
      if (room.gameState.magicDeck.cards <= 0) {
        socket.emit('room-error', 'No more magic cards in deck')
        return
      }

      // Generate magic card using real system
      const { generateRandomMagicCard } = await import('../factories/card-factories.js')
      const magicCard = generateRandomMagicCard()

      room.gameState.playerHands[socket.data.userId].push(magicCard)
      room.gameState.magicDeck.cards--
      room.gameState.playerActions[socket.data.userId].drawnMagic = true

      // Include hand information in player objects for the broadcast
      const playersWithHands = room.players.map(player => ({
        ...player,
        hand: room.gameState.playerHands[player.userId] || []
      }));

      socket.emit('magic-card-drawn', {
        roomCode,
        magicCard,
        magicDeck: room.gameState.magicDeck,
        tiles: room.gameState.tiles,
        players: playersWithHands,
        gameState: {
          gameStarted: room.gameState.gameStarted,
          currentPlayer: room.gameState.currentPlayer,
          turnCount: room.gameState.turnCount,
          shields: room.gameState.shields
        }
      })

    } catch (error) {
      console.error('Mock server: Error in draw-magic-card:', error)
      socket.emit('room-error', 'Failed to draw magic card')
    }
  }

  async handleUseMagicCard(socket, data) {
    try {
      const { roomCode, cardId, targetTileId } = data
      const room = this.rooms.get(roomCode)

      if (!room || !room.gameState.gameStarted) {
        socket.emit('room-error', 'Game not started')
        return
      }

      // Validate turn
      if (room.gameState.currentPlayer.userId !== socket.data.userId) {
        socket.emit('room-error', 'Not your turn')
        return
      }

      // Find card in player hand
      const playerHand = room.gameState.playerHands[socket.data.userId]
      if (!playerHand) {
        socket.emit('room-error', 'Player hand not initialized')
        return
      }

      const cardIndex = playerHand.findIndex(card => card.id === cardId)

      if (cardIndex === -1) {
        socket.emit('room-error', 'Card not found in hand')
        return
      }

      const card = playerHand[cardIndex]

      // Handle different magic card types using real card system
      let actionResult = null
      const { WindCard, RecycleCard, ShieldCard } = await import('../../src/lib/cards.js')

      if (card.type === 'wind') {
        // Wind card - remove opponent's heart
        if (targetTileId === undefined || targetTileId === null) {
          socket.emit('room-error', 'Target tile required for wind card')
          return
        }

        const tile = room.gameState.tiles.find(t => t.id === targetTileId)
        if (!tile || !tile.placedHeart || tile.placedHeart.placedBy === socket.data.userId) {
          socket.emit('room-error', 'Invalid target for wind card')
          return
        }

        // Remove heart and restore tile color
        actionResult = {
          type: 'wind',
          removedHeart: tile.placedHeart,
          tileId: targetTileId,
          previousColor: tile.color
        }

        const originalColor = tile.placedHeart.originalTileColor || 'white'
        tile.color = originalColor
        tile.emoji = originalColor === 'white' ? '⬜' :
                    originalColor === 'red' ? '🟥' :
                    originalColor === 'yellow' ? '🟨' : '🟩'
        delete tile.placedHeart

        // Subtract points from opponent
        const opponent = room.players.find(p => p.userId === actionResult.removedHeart.placedBy)
        if (opponent) {
          opponent.score = Math.max(0, opponent.score - actionResult.removedHeart.value)
        }

      } else if (card.type === 'recycle') {
        // Recycle card - change tile to white
        if (targetTileId === undefined || targetTileId === null) {
          socket.emit('room-error', 'Target tile required for recycle card')
          return
        }

        const tile = room.gameState.tiles.find(t => t.id === targetTileId)
        if (!tile) {
          socket.emit('room-error', 'Invalid target for recycle card')
          return
        }

        actionResult = {
          type: 'recycle',
          previousColor: tile.color,
          newColor: 'white',
          tileId: targetTileId
        }

        tile.color = 'white'
        tile.emoji = '⬜'

      } else if (card.type === 'shield') {
        // Shield card - protect player's tiles
        actionResult = {
          type: 'shield',
          activatedFor: socket.data.userId,
          remainingTurns: 2
        }

        if (!room.gameState.shields[socket.data.userId]) {
          room.gameState.shields[socket.data.userId] = []
        }

        room.gameState.shields[socket.data.userId].push({
          activatedBy: socket.data.userId,
          remainingTurns: 2,
          activatedAt: room.gameState.turnCount
        })

      } else {
        socket.emit('room-error', 'Unknown magic card type')
        return
      }

      // Remove card from hand
      playerHand.splice(cardIndex, 1)

      // Track action
      if (!room.gameState.playerActions[socket.data.userId]) {
        room.gameState.playerActions[socket.data.userId] = {
          drawnHeart: false,
          drawnMagic: false,
          heartsPlaced: 0,
          magicCardsUsed: 0
        }
      }
      room.gameState.playerActions[socket.data.userId].magicCardsUsed++

      // Include hand information in player objects for the broadcast
      const playersWithHands = room.players.map(player => ({
        ...player,
        hand: room.gameState.playerHands[player.userId] || []
      }))

      // Broadcast result
      this.io.to(roomCode).emit('magic-card-used', {
        roomCode,
        playerId: socket.data.userId,
        cardId,
        actionResult,
        tiles: room.gameState.tiles,
        players: playersWithHands,
        shields: room.gameState.shields
      })

    } catch (error) {
      console.error('Mock server: Error in use-magic-card:', error)
      socket.emit('room-error', 'Failed to use magic card')
    }
  }

  async handleEndTurn(socket, data) {
    try {
      const { roomCode } = data
      const room = this.rooms.get(roomCode)

      if (!room || !room.gameState.gameStarted) {
        socket.emit('room-error', 'Game not started')
        return
      }

      // Validate turn
      if (room.gameState.currentPlayer.userId !== socket.data.userId) {
        socket.emit('room-error', 'Not your turn')
        return
      }

      // Check if required cards were drawn
      const playerActions = room.gameState.playerActions[socket.data.userId] || {
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      }

      if (room.gameState.deck.cards > 0 && !playerActions.drawnHeart) {
        socket.emit('room-error', 'You must draw a heart card before ending your turn')
        return
      }

      if (room.gameState.magicDeck.cards > 0 && !playerActions.drawnMagic) {
        socket.emit('room-error', 'You must draw a magic card before ending your turn')
        return
      }

      // Find next player
      const currentIndex = room.players.findIndex(p => p.userId === socket.data.userId)
      const nextIndex = (currentIndex + 1) % room.players.length
      const nextPlayer = room.players[nextIndex]

      // Update game state
      room.gameState.currentPlayer = nextPlayer
      room.gameState.turnCount++

      // Reset actions for next player
      room.gameState.playerActions[nextPlayer.userId] = {
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: 0,
        magicCardsUsed: 0
      }

      // Check game end conditions
      const gameEndResult = checkGameEndConditions(room)
      if (gameEndResult.shouldEnd) {
        // Final scores
        const finalScores = room.players.map(player => ({
          userId: player.userId,
          name: player.name,
          score: player.score
        })).sort((a, b) => b.score - a.score)

        this.io.to(roomCode).emit('game-over', {
          roomCode,
          finalScores,
          winner: finalScores[0]
        })
      } else {
        // Include hand information in player objects for the broadcast
        const playersWithHands = room.players.map(player => ({
          ...player,
          hand: room.gameState.playerHands[player.userId] || []
        }))

        // Broadcast turn change
        this.io.to(roomCode).emit('turn-changed', {
          roomCode,
          currentPlayer: room.gameState.currentPlayer,
          turnCount: room.gameState.turnCount,
          players: playersWithHands
        })
      }

    } catch (error) {
      console.error('Mock server: Error in end-turn:', error)
      socket.emit('room-error', 'Failed to end turn')
    }
  }

  async handleShuffleTiles(socket, data) {
    try {
      const { roomCode } = data
      const room = this.rooms.get(roomCode)

      if (!room) {
        socket.emit('room-error', 'Room not found')
        return
      }

      if (room.gameState.gameStarted) {
        socket.emit('room-error', 'Cannot shuffle tiles after game started')
        return
      }

      // Generate new tiles
      room.gameState.tiles = generateTiles()

      // Broadcast new tiles
      this.io.to(roomCode).emit('tiles-updated', {
        roomCode,
        tiles: room.gameState.tiles
      })

    } catch (error) {
      console.error('Mock server: Error in shuffle-tiles:', error)
      socket.emit('room-error', 'Failed to shuffle tiles')
    }
  }

  handleDisconnect(socket) {
    console.log(`Mock server: Client disconnected: ${socket.id}`)
    const socketInfo = this.connectedSockets.get(socket.id)

    if (socketInfo && socketInfo.roomCode) {
      const room = this.rooms.get(socketInfo.roomCode)
      if (room) {
        // Remove player from room (use base userId matching)
        const baseUserId = socketInfo.userId.split('-').slice(0, -2).join('-') || socketInfo.userId
        room.players = room.players.filter(p => {
          const playerBaseId = p.userId.split('-').slice(0, -2).join('-') || p.userId
          return playerBaseId !== baseUserId
        })

        // Notify other players
        socket.to(socketInfo.roomCode).emit('player-left', {
          roomCode: socketInfo.roomCode,
          players: room.players,
          leftPlayerId: socketInfo.userId
        })

        // Clean up empty room
        if (room.players.length === 0) {
          this.rooms.delete(socketInfo.roomCode)
          console.log(`Mock server: Cleaned up empty room ${socketInfo.roomCode}`)
        }
      }
    }

    this.connectedSockets.delete(socket.id)
  }

  createMockRoom(roomCode) {
    return {
      code: roomCode,
      players: [],
      maxPlayers: 2,
      gameState: {
        tiles: [],
        gameStarted: false,
        currentPlayer: null,
        deck: { emoji: "💌", cards: 16, type: 'hearts' },
        magicDeck: { emoji: "🔮", cards: 16, type: 'magic' },
        playerHands: {},
        shields: {},
        turnCount: 0,
        playerActions: {}
      }
    }
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode)
  }

  async stop() {
    if (this.io) {
      this.io.close()
    }

    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer.close(resolve)
      })
    }
  }
}