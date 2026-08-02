"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initSocket = exports.userRoom = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_1 = require("cookie");
const jwt_1 = require("../config/jwt");
const prisma_1 = require("../config/prisma");
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
let io = null;
// Every connected client joins exactly one room, keyed by user id — every
// notification in this app (task assignment/completion, approval requests,
// announcements) always resolves to a concrete list of recipient user ids
// server-side before emitting, so there's no need for a separate
// per-organization broadcast room.
const userRoom = (userId) => `user:${userId}`;
exports.userRoom = userRoom;
const initSocket = (httpServer) => {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: ALLOWED_ORIGINS,
            credentials: true,
        },
    });
    io.use(async (socket, next) => {
        try {
            const cookieHeader = socket.handshake.headers.cookie;
            const cookies = cookieHeader ? (0, cookie_1.parse)(cookieHeader) : {};
            const token = cookies.token;
            if (!token)
                return next(new Error("No token provided"));
            const decoded = jsonwebtoken_1.default.verify(token, jwt_1.JWT_SECRET);
            const user = await prisma_1.prisma.user.findUnique({ where: { id: decoded.id } });
            if (!user)
                return next(new Error("User not found"));
            if ((decoded.v ?? 0) !== user.tokenVersion) {
                return next(new Error("Session expired"));
            }
            socket.userId = user.id;
            next();
        }
        catch (err) {
            next(new Error("Invalid or expired token"));
        }
    });
    io.on("connection", (socket) => {
        if (socket.userId) {
            socket.join((0, exports.userRoom)(socket.userId));
        }
    });
    return io;
};
exports.initSocket = initSocket;
const getIO = () => io;
exports.getIO = getIO;
//# sourceMappingURL=socket.js.map