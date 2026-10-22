import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushDeliveryService } from './push-delivery.service';
import { PushSender } from './push-sender.service';
import { PushService } from './push.service';
import { PushSubscriptionService } from './push-subscription.service';

@Module({
  controllers: [PushController],
  providers: [PushSender, PushSubscriptionService, PushDeliveryService, PushService],
  exports: [PushService],
})
export class PushModule {}
