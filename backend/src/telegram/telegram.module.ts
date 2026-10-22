import { Module } from '@nestjs/common';
import { TelegramApi } from './telegram-api.client';
import { TelegramController } from './telegram.controller';
import { TelegramDeliveryService } from './telegram-delivery.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramPollerService } from './telegram-poller.service';
import { TelegramService } from './telegram.service';

@Module({
  controllers: [TelegramController],
  providers: [TelegramApi, TelegramLinkService, TelegramDeliveryService, TelegramPollerService, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
