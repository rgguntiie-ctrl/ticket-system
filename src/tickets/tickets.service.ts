import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { TicketsCacheService } from './tickets-cache.service';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectQueue('tickets')
    private readonly ticketQueue: Queue,
    private readonly cacheService: TicketsCacheService,
  ) {}

  async create(createTicketDto: CreateTicketDto) {
    try {
      const ticket = this.ticketRepository.create(createTicketDto);
      const savedTicket = await this.ticketRepository.save(ticket);

      await this.cacheService.invalidateAllLists();

      await this.ticketQueue.add(
        'notify',
        { ticket: savedTicket },
        {
          jobId: `notify_${savedTicket.id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      await this.ticketQueue.add(
        'sla-check',
        { ticket: savedTicket },
        {
          jobId: `sla_${savedTicket.id}`,
          delay: 15 * 60 * 1000,
        },
      );

      this.logger.log(`Created ticket: ${savedTicket.id}`);
      return savedTicket;
    } catch (error) {
      this.logger.error(`Failed to create ticket: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create ticket');
    }
  }

  async findAll(queryDto: QueryTicketDto) {
    try {
      const cachedResult = await this.cacheService.getTicketList(queryDto);
      if (cachedResult) {
        return cachedResult;
      }

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

      // Apply pagination
      const skip = (page - 1) * pageSize;
      queryBuilder.skip(skip).take(pageSize);

      const [data, total] = await queryBuilder.getManyAndCount();

      const result = {
        data,
        meta: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };

      await this.cacheService.setTicketList(queryDto, result);

      return result;
    } catch (error) {
      this.logger.error(`Failed to fetch tickets: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch tickets');
    }
  }

  async findOne(id: string) {
    try {
      const ticket = await this.cacheService.getOrFetch(id);

      if (!ticket) {
        throw new NotFoundException(`Ticket with ID "${id}" not found`);
      }

      return ticket;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch ticket ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch ticket');
    }
  }

  async update(id: string, updateTicketDto: UpdateTicketDto) {
    const ticket = await this.findOne(id);
    const oldStatus = ticket.status;

    try {
      Object.assign(ticket, updateTicketDto);
      const updatedTicket = await this.ticketRepository.save(ticket);

      await this.cacheService.invalidateTicket(id);
      await this.cacheService.invalidateAllLists();

      if (
        updateTicketDto.status === TicketStatus.RESOLVED &&
        oldStatus !== TicketStatus.RESOLVED
      ) {
        await this.removeSlaJob(id);
      }

      this.logger.log(`Updated ticket: ${id}`);
      return updatedTicket;
    } catch (error) {
      this.logger.error(`Failed to update ticket ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update ticket');
    }
  }

  async remove(id: string) {
    const ticket = await this.findOne(id);

    try {
      await this.ticketRepository.remove(ticket);

      await this.cacheService.invalidateTicket(id);
      await this.cacheService.invalidateAllLists();

      await this.removeSlaJob(id);

      this.logger.log(`Deleted ticket: ${id}`);
      return {
        message: `Ticket with ID "${id}" has been successfully deleted`,
      };
    } catch (error) {
      this.logger.error(`Failed to delete ticket ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to delete ticket');
    }
  }

  private async removeSlaJob(ticketId: string) {
    try {
      const job = await this.ticketQueue.getJob(`sla:${ticketId}`);
      if (job) {
        await job.remove();
        this.logger.debug(`Removed SLA job for ticket: ${ticketId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to remove SLA job for ticket ${ticketId}: ${error.message}`,
        error.stack,
      );
    }
  }
}