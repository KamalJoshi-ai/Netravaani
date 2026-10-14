export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode?: number, code?: string);
  constructor(statusCode: number, code: string, message: string, details?: unknown);
  constructor(...args: any[]) {
    if (typeof args[0] === "number") {
      super(args[2]);
      this.statusCode = args[0];
      this.code = args[1] || "APP_ERROR";
      this.details = args[3];
    } else {
      super(args[0]);
      this.statusCode = typeof args[1] === "number" ? args[1] : 400;
      this.code = args[2] || "APP_ERROR";
    }
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export default AppError;
