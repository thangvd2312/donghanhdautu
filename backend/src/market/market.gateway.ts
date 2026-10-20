import { Logger, OnModuleInit } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.module';
import { MarketService } from './market.service';

/**
 * Một kết nối socket.io duy nhất cho mỗi trình duyệt:
 *  - kênh chung: giá realtime (stocks / indices / crypto / gold / fx)
 *  - phòng riêng `user:<id>`: thông báo cá nhân
 */
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173', credentials: true },
})
export class MarketGateway implements OnGatewayConnection, OnModuleInit {
  private log = new Logger(MarketGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private market: MarketService,
    private auth: AuthService,
  ) {}

  onModuleInit() {
    this.market.events$.subscribe((e) => this.server?.emit(e.type, e.data));
  }

  handleConnection(client: Socket) {
    const token = (client.handshake.auth as { token?: string })?.token;
    const userId = token ? this.auth.verify(token) : null;
    if (userId) void client.join(`user:${userId}`);
    client.emit('snapshot', this.market.snapshot());
  }

  notifyUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
