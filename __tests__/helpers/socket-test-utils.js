// Socket.IO testing utilities for integration tests
import { io as ioc } from 'socket.io-client'

/**
 * Enhanced waitFor function with timeout and error handling
 * @param {Object} socket - Socket.IO client socket
 * @param {string} event - Event name to wait for
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns {Promise} Promise that resolves with event data or rejects on timeout
 */
export function waitFor(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent)
      reject(new Error(`Timeout waiting for '${event}' event after ${timeoutMs}ms`))
    }, timeoutMs)

    const onEvent = (data) => {
      clearTimeout(timeout)
      resolve(data)
    }

    socket.once(event, onEvent)
  })
}

/**
 * Create an authenticated socket client with timeout handling
 * @param {number} port - Server port
 * @param {Object} auth - Authentication data
 * @param {number} timeoutMs - Connection timeout in milliseconds
 * @returns {Promise<Object>} Promise that resolves to connected socket
 */
export async function createAuthenticatedSocket(port, auth, timeoutMs = 5000) {
  const socket = ioc(`http://localhost:${port}`, {
    auth,
    timeout: timeoutMs,
    transports: ['websocket']
  })

  // Wait for connection with timeout
  await waitFor(socket, 'connect', timeoutMs)

  return socket
}

/**
 * Create multiple authenticated sockets in parallel
 * @param {number} port - Server port
 * @param {Array} authList - Array of authentication objects
 * @param {number} timeoutMs - Connection timeout in milliseconds
 * @returns {Promise<Array>} Promise that resolves to array of connected sockets
 */
export async function createAuthenticatedSockets(port, authList, timeoutMs = 5000) {
  const socketPromises = authList.map(auth => createAuthenticatedSocket(port, auth, timeoutMs))
  return Promise.all(socketPromises)
}

/**
 * Safely disconnect a socket with error handling
 * @param {Object} socket - Socket.IO client socket
 */
export function safeDisconnect(socket) {
  try {
    if (socket && socket.connected) {
      socket.disconnect()
    }
  } catch (error) {
    console.warn('Error disconnecting socket:', error.message)
  }
}

/**
 * Safely disconnect multiple sockets
 * @param {Array} sockets - Array of Socket.IO client sockets
 */
export function safeDisconnectAll(sockets) {
  sockets.forEach(socket => safeDisconnect(socket))
}

/**
 * Setup test socket clients with default authentication
 * @param {number} port - Server port
 * @returns {Promise<Object>} Object containing player1Socket and player2Socket
 */
export async function setupTestSockets(port) {
  const authList = [
    { userId: 'player1', userName: 'Player 1', userEmail: 'player1@test.com' },
    { userId: 'player2', userName: 'Player 2', userEmail: 'player2@test.com' }
  ]

  const [player1Socket, player2Socket] = await createAuthenticatedSockets(port, authList)

  return { player1Socket, player2Socket }
}

/**
 * Cleanup test sockets
 * @param {Object} sockets - Object containing socket clients
 */
export function cleanupTestSockets(sockets = {}) {
  const { player1Socket, player2Socket, clientSocket } = sockets
  safeDisconnectAll([player1Socket, player2Socket, clientSocket].filter(Boolean))
}