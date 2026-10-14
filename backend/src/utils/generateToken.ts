import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const generateAccessToken = (user: any): string => {
  const userId = user.id || user._id;
  return jwt.sign(
    {
      userId,
      id: userId,
      email: user.email,
      username: user.username || user.email,
      name: user.name,
      role: user.role,
    },
    process.env.ACCESS_TOKEN_SECRET || env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};
