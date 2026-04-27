import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "./errors";

export function signToken(payload: { id: string; name: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRE,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): { id: string; name: string } {
  try {
    return jwt.verify(token, env.JWT_SECRET) as { id: string; name: string };
  } catch {
    throw new AppError("INVALID_TOKEN", "Token is invalid or expired", 401);
  }
}
