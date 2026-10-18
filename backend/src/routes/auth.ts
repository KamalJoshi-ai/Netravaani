import { Router } from "express";
import {
  register,
  verifyEmail,
  login,
  logout,
  checkUserAuth,
} from "../controllers/authController.js";

export const authRouter = Router();

// Authentication Routes
authRouter.post("/register", register);
authRouter.get("/verify-email/:token", verifyEmail);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/me", checkUserAuth);
authRouter.get("/check", checkUserAuth);

export default authRouter;
