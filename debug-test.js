// Debug script to test migratePlayerData function directly
import { migratePlayerData } from './server.js';

// Set up the global turn locks as the test does
global.turnLocks = new Map();
global.turnLocks.set('room_oldUserId', { socketId: 'socket1', timestamp: Date.now() });
global.turnLocks.set('oldUserId_suffix', { socketId: 'socket2', timestamp: Date.now() });
global.turnLocks.set('prefix_oldUserId_middle', { socketId: 'socket3', timestamp: Date.now() });
global.turnLocks.set('different_user', { socketId: 'socket4', timestamp: Date.now() });

console.log('Before migration, turnLocks size:', global.turnLocks.size);
console.log('Keys before:', Array.from(global.turnLocks.keys()));

// Create a minimal room object
const room = {
  players: [{ userId: 'oldUserId', name: 'OldPlayer' }],
  gameState: {
    playerHands: {},
    shields: {},
    currentPlayer: null
  }
};

// Call migratePlayerData
await migratePlayerData(room, 'oldUserId', 'newUserId', 'NewPlayer', 'new@example.com');

console.log('After migration, turnLocks size:', global.turnLocks.size);
console.log('Keys after:', Array.from(global.turnLocks.keys()));

// Check the specific expectations from the test
console.log('Has room_oldUserId:', global.turnLocks.has('room_oldUserId')); // Should be false
console.log('Has oldUserId_suffix:', global.turnLocks.has('oldUserId_suffix')); // Should be false
console.log('Has prefix_oldUserId_middle:', global.turnLocks.has('prefix_oldUserId_middle')); // Should be false
console.log('Has different_user:', global.turnLocks.has('different_user')); // Should be true