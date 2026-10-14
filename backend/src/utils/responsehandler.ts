import { Response } from "express";

export const response = (
  res: Response,
  statusCode: number,
  message: string,
  data?: any
) => {
  return res.status(statusCode).json({
    status: statusCode >= 200 && statusCode < 300 ? "success" : "error",
    message,
    ...(data !== undefined ? { data } : {}),
    ...(data?.accessToken ? { accessToken: data.accessToken, token: data.accessToken } : {}),
    ...(data?.user ? { user: data.user } : {}),
  });
};
