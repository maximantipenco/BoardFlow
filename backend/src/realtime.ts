import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { getBoardRole } from './access';

let io: Server | null = null;

export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, { path: '/socket.io' });

  // Authenticate every connection with the same JWT as the REST API
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) return next(new Error('Unauthorized'));
    try {
      const payload = jwt.verify(token, secret) as { userId: number };
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Only board members may join the board's room
    socket.on('board:join', async (boardId: number, ack?: (ok: boolean) => void) => {
      const role = Number.isInteger(boardId)
        ? await getBoardRole(boardId, socket.data.userId)
        : null;
      if (!role) return ack?.(false);
      await socket.join(`board:${boardId}`);
      ack?.(true);
    });

    socket.on('board:leave', (boardId: number) => {
      socket.leave(`board:${boardId}`);
    });
  });
}

// Tell everyone watching a board that it changed
export function notifyBoard(boardId: number) {
  io?.to(`board:${boardId}`).emit('board:changed');
}
