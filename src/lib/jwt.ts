import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "easyrecruit-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

export function createToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): (JwtPayload & { jti?: string }) | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    return {
      userId: Number(decoded.userId),
      email: String(decoded.email),
      role: String(decoded.role),
      jti: decoded.jti,
    };
  } catch {
    return null;
  }
}

export function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}
