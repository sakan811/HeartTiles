// Global setup for integration tests to ensure proper database connection
import {
  connectToDatabase,
  disconnectDatabase,
} from "./utils/server-test-utils.js";

let isConnected = false;

export async function setup() {
  if (!isConnected) {
    try {
      console.log(
        "Global setup: Connecting to database for integration tests...",
      );
      await connectToDatabase();
      isConnected = true;
      console.log("Global setup: Database connected successfully");
    } catch (error) {
      console.error("Global setup: Database connection failed:", error.message);
      // Don't throw error to allow tests to run with degraded functionality
    }
  }
}

export async function teardown() {
  if (isConnected) {
    try {
      console.log("Global teardown: Disconnecting from database...");
      await disconnectDatabase();
      isConnected = false;
      console.log("Global teardown: Database disconnected successfully");
    } catch (error) {
      console.error(
        "Global teardown: Database disconnection failed:",
        error.message,
      );
    }
  }
}

// Export utility for individual test files to check connection status
export function isDatabaseConnected() {
  return isConnected;
}
