import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../entities/ticket.entity';

@Processor('tickets')
export class TicketProcessor extends WorkerHost {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case 'notify':
        return this.handleNotification(job);
      case 'sla-check':
        return this.handleSlaCheck(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }

  async handleNotification(job: Job) {
    const { ticketId } = job.data;

    try {
      const ticket = await this.ticketRepository.findOne({
        where: { id: ticketId },
      });

      if (!ticket) {
        console.error(`Ticket not found: ${ticketId}`);
        throw new Error(`Ticket with ID ${ticketId} not found`);
      }

      console.log('===== NOTIFICATION =====');
      console.log(`New Ticket Created!`);
      console.log(`   ID: ${ticket.id}`);
      console.log(`   Title: ${ticket.title}`);
      console.log(`   Priority: ${ticket.priority}`);
      console.log(`   Status: ${ticket.status}`);
      console.log(`   Created: ${ticket.createdAt}`);
      console.log('==========================\n');

      return {
        success: true,
        ticketId,
        notifiedAt: new Date(),
      };
    } catch (error) {
      console.error(`Failed to send notification for ticket ${ticketId}:`, error.message);
      throw error;
    }
  }

  async handleSlaCheck(job: Job) {
    const { ticketId } = job.data;

    try {
      const ticket = await this.ticketRepository.findOne({
        where: { id: ticketId },
      });

      if (!ticket) {
        console.error(`Ticket not found for SLA check: ${ticketId}`);
        return { success: false, reason: 'Ticket not found' };
      }

      if (ticket.status !== 'RESOLVED') {
        console.log('===== SLA ALERT =====');
        console.log(`SLA Breach Warning!`);
        console.log(`   Ticket ID: ${ticket.id}`);
        console.log(`   Title: ${ticket.title}`);
        console.log(`   Status: ${ticket.status}`);
        console.log(`   Priority: ${ticket.priority}`);
        console.log(`   Time Elapsed: 15+ minutes`);
        console.log(`   Action Required: Please review this ticket`);
        console.log('========================\n');

        return {
          success: true,
          ticketId,
          slaBreached: true,
          checkedAt: new Date(),
        };
      } else {
        console.log(`Ticket ${ticketId} was resolved before SLA breach`);
        return {
          success: true,
          ticketId,
          slaBreached: false,
          resolvedAt: ticket.updatedAt,
        };
      }
    } catch (error) {
      console.error(`Failed to check SLA for ticket ${ticketId}:`, error.message);
      throw error;
    }
  }
}