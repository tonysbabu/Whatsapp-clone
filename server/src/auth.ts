import jwt from "jsonwebtoken";

const DEV_SECRET = "dev-jwt-secret-change-me";
const JWT_SECRET = process.env.JWT_SECRET ?? DEV_SECRET;
const JWT_EXPIRES = "7d";

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_SECRET)) {
  throw new Error("JWT_SECRET must be set to a strong value in production");
}

export type JwtPayload = { sub: string };

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies JwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null || typeof decoded.sub !== "string") {
    throw new Error("Invalid token");
  }
  return { sub: decoded.sub };
}
