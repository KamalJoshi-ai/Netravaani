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
  const expireOptions: CookieOptions = {
    ...baseOptions,
    expires: new Date(0),
    maxAge: 0,
  };
  res.clearCookie("access_token", expireOptions);
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", expireOptions);
  res.clearCookie("refresh_token", { path: "/" });
  res.clearCookie("netravaani_token", expireOptions);
  res.clearCookie("netravaani_token", { path: "/" });
  res.clearCookie("patient_token", expireOptions);
  res.clearCookie("patient_token", { path: "/" });
};
