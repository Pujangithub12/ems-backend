import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { parse as parseCookie } from "cookie";
import { JWT_SECRET } from "../config/jwt";
import { prisma } from "../config/prisma";

// Mirrors authMiddleware's CORS allow-list (backend/src/index.ts) — kept as a
// separate list rather than importing index.ts's array to avoid a circular
// import between index.ts (which creates the http.Server this attaches to)
// and this module.
const ALLOWED_ORIGINS = [
  "https://www.jdnenergy.com.np",
  "https://jdnenergy.com.np",
  "https://emsjandaenergy.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];

interface AuthedSocket extends Socket {
  userId?: number;
}

let io: Server | null = null;

// Every connected client joins exactly one room, keyed by user id — every
// notification in this app (task assignment/completion, approval requests,
// announcements) always resolves to a concrete list of recipient user ids
// server-side before emitting, so there's no need for a separate
// per-organization broadcast room.
export const userRoom = (userId: number) => `user:${userId}`;

export const initSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: ALLOWED_ORIGINS,
      credentials: true,
    },
  });

  io.use(async (socket: AuthedSocket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = cookieHeader ? parseCookie(cookieHeader) : {};
      const token = cookies.token;
      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.verify(token, JWT_SECRET) as { id: number; v?: number };
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!user) return next(new Error("User not found"));
      if ((decoded.v ?? 0) !== user.tokenVersion) {
        return next(new Error("Session expired"));
      }

      socket.userId = user.id;
      next();
    } catch (err) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    if (socket.userId) {
      socket.join(userRoom(socket.userId));
    }
  });

  return io;
};

export const getIO = (): Server | null => io;
