import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { Ticket } from './entities/ticket.entity';
import { TicketProcessor } from './processors/ticket.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket]),
    BullModule.registerQueue({
      name: 'tickets',
    }),
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketProcessor],
  exports: [TicketsService],
})
export class TicketsModule {}