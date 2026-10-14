import mongoose from "mongoose";

export interface DatabaseStatus {
  connected: boolean;
  state: "disconnected" | "connected" | "connecting" | "disconnecting" | "uninitialized";
}

const stateMap: Record<number, DatabaseStatus["state"]> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  if (!uri) {
    throw new Error("Cannot connect to database: MONGODB_URI is undefined or empty");
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000,
    });
    console.log(`[Database] MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error("[Database] Connection failure:", err instanceof Error ? err.message : err);
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log("[Database] MongoDB disconnected");
  }
}

export function getDatabaseStatus(): DatabaseStatus {
  const readyState = mongoose.connection.readyState;
  return {
    connected: readyState === 1,
    state: stateMap[readyState] || "disconnected",
  };
}
