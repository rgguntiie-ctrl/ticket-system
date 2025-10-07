import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectQueue('tickets')
    private readonly ticketQueue: Queue,
  ) {}

  async create(createTicketDto: CreateTicketDto) {
    try {
      const ticket = this.ticketRepository.create(createTicketDto);
      const savedTicket = await this.ticketRepository.save(ticket);

      await this.ticketQueue.add(
        'notify',
        { ticketId: savedTicket.id },
        {
          jobId: `notify:${savedTicket.id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      await this.ticketQueue.add(
        'sla-check',
        { ticketId: savedTicket.id },
        {
          jobId: `sla:${savedTicket.id}`,
          delay: 15 * 60 * 1000,
        },
      );

      return savedTicket;
    } catch (error) {
      throw new InternalServerErrorException('Failed to create ticket');
    }
  }

  async findAll(queryDto: QueryTicketDto) {
    try {
      const {
        status,
        priority,
        search,
        page = 1,
        pageSize = 10,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
      } = queryDto;

      const queryBuilder = this.ticketRepository.createQueryBuilder('ticket');

      if (status) {
        queryBuilder.andWhere('ticket.status = :status', { status });
      }

      if (priority) {
        queryBuilder.andWhere('ticket.priority = :priority', { priority });
      }

      if (search) {
        queryBuilder.andWhere(
          '(ticket.title ILIKE :search OR ticket.description ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      const allowedSortFields = [
        'createdAt',
        'updatedAt',
        'title',
        'priority',
        'status',
      ];
      const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : 'createdAt';
      queryBuilder.orderBy(`ticket.${sortField}`, sortOrder);

      const skip = (page - 1) * pageSize;
      queryBuilder.skip(skip).take(pageSize);

      const [data, total] = await queryBuilder.getManyAndCount();

      return {
        data,
        meta: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch tickets');
    }
  }

  async findOne(id: string) {
    const ticket = await this.ticketRepository.findOne({ where: { id } });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${id}" not found`);
    }

    return ticket;
  }

  async update(id: string, updateTicketDto: UpdateTicketDto) {
    const ticket = await this.findOne(id);
    const oldStatus = ticket.status;

    try {
      Object.assign(ticket, updateTicketDto);
      const updatedTicket = await this.ticketRepository.save(ticket);

      if (
        updateTicketDto.status === TicketStatus.RESOLVED &&
        oldStatus !== TicketStatus.RESOLVED
      ) {
        await this.removeSlaJob(id);
      }

      return updatedTicket;
    } catch (error) {
      throw new InternalServerErrorException('Failed to update ticket');
    }
  }

  async remove(id: string) {
    const ticket = await this.findOne(id);

    try {
      await this.ticketRepository.remove(ticket);
      await this.removeSlaJob(id);

      return {
        message: `Ticket with ID "${id}" has been successfully deleted`,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to delete ticket');
    }
  }

  private async removeSlaJob(ticketId: string) {
    try {
      const job = await this.ticketQueue.getJob(`sla:${ticketId}`);
      if (job) {
        await job.remove();
        console.log(`Removed SLA job for ticket: ${ticketId}`);
      }
    } catch (error) {
      console.error(`Failed to remove SLA job for ticket ${ticketId}:`, error);
    }
  }
}
