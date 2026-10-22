import { Module } from '@nestjs/common';
import { LogosController } from './logos.controller';
import { LogosService } from './logos.service';

@Module({ controllers: [LogosController], providers: [LogosService] })
export class LogosModule {}
