import mongoose, { ClientSession } from "mongoose";

let supportsTransactions: boolean | null = null;

/**
 * Multi-document transactions need a replica set or sharded cluster (MongoDB
 * Atlas always is). A standalone server, such as a plain local mongod or the
 * in-memory test server, cannot run them.
 */
async function detectTransactionSupport(): Promise<boolean> {
  if (supportsTransactions !== null) return supportsTransactions;
  try {
    const db = mongoose.connection.db;
    if (!db) return false;
    const hello = await db.admin().command({ hello: 1 });
    supportsTransactions = Boolean(hello.setName) || hello.msg === "isdbgrid";
  } catch {
    supportsTransactions = false;
  }
  return supportsTransactions;
}

/** Clears the cached capability check. Used by tests that reconnect to a different server. */
export function resetTransactionSupportCache(): void {
  supportsTransactions = null;
}

/**
 * Runs `work` inside one transaction when the server supports it, so all its
 * writes commit or roll back together. On a standalone server it runs the same
 * work without a session.
 */
export async function runInTransaction<T>(work: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!(await detectTransactionSupport())) {
    return work(undefined);
  }
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
