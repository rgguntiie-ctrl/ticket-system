import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { Ticket } from './entities/ticket.entity';
import { TicketProcessor } from './processors/ticket.processor';
import { CacheModule } from 'src/cache/cache.module';
import { TicketsCacheService } from './tickets-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket]),
    BullModule.registerQueue({
      name: 'tickets',
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
    CacheModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketProcessor,TicketsCacheService],
  exports: [TicketsService],
})
export class TicketsModule {}