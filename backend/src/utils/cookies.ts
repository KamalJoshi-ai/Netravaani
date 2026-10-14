import { CookieOptions, Response } from "express";

export const getCookieOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd, // Must be true when sameSite is "none" (Vercel <-> Render)
    sameSite: isProd ? "none" : "lax", // Use lax for local dev so cookies persist on localhost
    path: "/",
  };
};

export const clearAuthCookies = (res: Response): void => {
  const baseOptions = getCookieOptions();
  res.clearCookie("access_token", baseOptions);
  res.clearCookie("refresh_token", baseOptions);
  res.clearCookie("netravaani_token", { path: "/" });
};
