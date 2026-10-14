export const logger = {
  info: (message: string, meta?: Record<string, any>) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : "");
  },
  warn: (message: string, meta?: Record<string, any>) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : "");
  },
  error: (message: string, meta?: Record<string, any>) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : "");
  },
};

export default logger;
