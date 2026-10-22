import { Logger, OnModuleInit } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
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
  @WebSocketServer() server?: Server;
  /** Id thông báo đã đẩy xuống socket: thông báo do web tạo không bị đẩy lại khi relay đọc từ DB */
  private delivered = new Set<string>();

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

  /** Worker không có socket server (this.server undefined): thông báo của nó được web đẩy qua NotificationRelayService */
  notifyUser(userId: string, event: string, payload: unknown): boolean {
    const id = (payload as { id?: unknown } | null)?.id;
    if (event === 'notification' && typeof id === 'string') {
      if (this.delivered.has(id)) return false;
      this.remember(id);
    }
    if (!this.server) return false;
    this.server.to(`user:${userId}`).emit(event, payload);
    return true;
  }

  private remember(id: string) {
    this.delivered.add(id);
    // Chỉ cần nhớ đủ lâu để relay (quét lại ~15 giây gần nhất) không đẩy trùng
    if (this.delivered.size > 5000) this.delivered.delete(this.delivered.values().next().value as string);
  }
}
