import { Server } from 'socket.io'
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'http'

let io: Server

export function initSocket(server: HttpServer<typeof IncomingMessage, typeof ServerResponse>): Server {
  io = new Server(server, {
    cors: {
      origin: process.env.APP_URL ?? 'http://localhost:3000',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  io.on('connection', (socket) => {
    socket.on('join:tenant', (tenantId: string) => {
      socket.join(`tenant:${tenantId}`)
    })

    socket.on('leave:tenant', (tenantId: string) => {
      socket.leave(`tenant:${tenantId}`)
    })
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io não inicializado')
  return io
}
