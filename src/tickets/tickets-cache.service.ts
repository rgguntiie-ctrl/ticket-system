import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { Ticket } from './entities/ticket.entity';

@Injectable()
export class TicketsCacheService {
  private readonly CACHE_PREFIX = 'ticket';
  private readonly CACHE_TTL = 300 * 1000; // 5 minutes
  private readonly logger = new Logger(TicketsCacheService.name);

  constructor(
    private readonly cacheService: CacheService,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
  ) {}

  private getDetailKey(id: string): string {
    return `${this.CACHE_PREFIX}:detail:${id}`;
  }

  private getListKey(queryDto: QueryTicketDto): string {
    const params = new URLSearchParams();
    Object.entries(queryDto).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    return `${this.CACHE_PREFIX}:list:${params.toString()}`;
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const cacheKey = this.getDetailKey(id);
    const cached = await this.cacheService.get<Ticket>(cacheKey);

    if (cached) {
      this.logger.debug(`Cache HIT for ticket: ${id}`);
    } else {
      this.logger.debug(`Cache MISS for ticket: ${id}`);
    }

    return cached;
  }

  async getTicketList(queryDto: QueryTicketDto): Promise<any> {
    const cacheKey = this.getListKey(queryDto);
    const cached = await this.cacheService.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache HIT for ticket list`);
    } else {
      this.logger.debug(`Cache MISS for ticket list`);
    }

    return cached;
  }

  async getOrFetch(id: string): Promise<Ticket | null> {
    const cached = await this.getTicket(id);
    if (cached) {
      return cached;
    }

    this.logger.debug(`Fetching ticket ${id} from database`);
    const ticket = await this.ticketRepository.findOne({ where: { id } });

    if (ticket) {
      await this.setTicket(id, ticket);
      this.logger.debug(`Cached ticket: ${id}`);
    }

    return ticket;
  }

  async setTicket(id: string, ticket: Ticket): Promise<void> {
    const cacheKey = this.getDetailKey(id);
    await this.cacheService.set(cacheKey, ticket, this.CACHE_TTL);
    this.logger.debug(`Set cache for ticket: ${id}`);
  }

  async setTicketList(queryDto: QueryTicketDto, result: any): Promise<void> {
    const cacheKey = this.getListKey(queryDto);
    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);
    this.logger.debug(`Set cache for ticket list`);
  }

  async invalidateTicket(id: string): Promise<void> {
    const cacheKey = this.getDetailKey(id);
    await this.cacheService.del(cacheKey);
    this.logger.debug(`Invalidated cache for ticket: ${id}`);
  }

  async invalidateAllLists(): Promise<void> {
    await this.cacheService.delByPattern(`${this.CACHE_PREFIX}:list:`);
    this.logger.debug(`Invalidated all ticket list caches`);
  }

  async invalidateAll(): Promise<void> {
    await this.cacheService.delByPattern(this.CACHE_PREFIX);
    this.logger.log(`Invalidated all ticket caches`);
  }

  async warmFrequentTickets(limit: number = 100): Promise<void> {
    try {
      this.logger.log('Starting cache warming for frequent tickets...');

      const tickets = await this.ticketRepository.find({
        where: { status: 'OPEN' as any },
        take: limit,
        order: { updatedAt: 'DESC' },
      });

      await Promise.all(
        tickets.map((ticket) => this.setTicket(ticket.id, ticket)),
      );

      this.logger.log(`Successfully warmed ${tickets.length} tickets in cache`);
    } catch (error) {
      this.logger.error(`Cache warming failed: ${error.message}`, error.stack);
    }
  }

  async warmTicket(id: string): Promise<void> {
    try {
      const ticket = await this.ticketRepository.findOne({ where: { id } });
      if (ticket) {
        await this.setTicket(id, ticket);
        this.logger.debug(`Manually warmed ticket: ${id}`);
      }
    } catch (error) {
      this.logger.error(`Failed to warm ticket ${id}: ${error.message}`);
    }
  }
}
