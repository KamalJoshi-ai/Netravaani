import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import {
  register,
  verifyEmail,
  login,
  logout,
  checkUserAuth,
} from "../controllers/authController.js";

export const authRouter = Router();

// Seed default nurse/admin accounts if database has no accounts
async function ensureDefaultUsers() {
  const count = await User.countDocuments();
  if (count === 0) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash("nurse123", salt);
    await User.create([
      {
        username: "nurse",
        email: "nurse@netravaani.local",
        password: "nurse123",
        passwordHash: hash,
        name: "Nurse Station Ward 4",
        role: "nurse",
        isVerified: true,
      },
      {
        username: "admin",
        email: "admin@netravaani.local",
        password: "nurse123",
        passwordHash: hash,
        name: "Hospital Admin",
        role: "admin",
        isVerified: true,
      },
    ]);
  }
}

// Ensure defaults before login or register attempts
authRouter.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await ensureDefaultUsers();
  } catch {
    // Ignore seed errors if MongoDB is temporarily connecting
  }
  next();
});

// Authentication Routes
authRouter.post("/register", register);
authRouter.get("/verify-email/:token", verifyEmail);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/me", checkUserAuth);
authRouter.get("/check", checkUserAuth);

export default authRouter;
