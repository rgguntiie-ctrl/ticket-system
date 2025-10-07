import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('tickets')
    private readonly ticketQueue: Queue,
  ) {}

  async getQueueStats(queueName: string) {
    if (queueName !== 'tickets') {
      throw new NotFoundException(`Queue "${queueName}" not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.ticketQueue.getWaitingCount(),
      this.ticketQueue.getActiveCount(),
      this.ticketQueue.getCompletedCount(),
      this.ticketQueue.getFailedCount(),
      this.ticketQueue.getDelayedCount(),
    ]);

    return {
      queue: queueName,
      stats: {
        waiting,
        active,
        completed,
        failed,
        delayed,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async getJobsByStatus(queueName: string, status: string) {
    if (queueName !== 'tickets') {
      throw new NotFoundException(`Queue "${queueName}" not found`);
    }

    let jobs: any[] = [];
    switch (status) {
      case 'waiting':
        jobs = await this.ticketQueue.getWaiting();
        break;
      case 'active':
        jobs = await this.ticketQueue.getActive();
        break;
      case 'completed':
        jobs = await this.ticketQueue.getCompleted();
        break;
      case 'failed':
        jobs = await this.ticketQueue.getFailed();
        break;
      case 'delayed':
        jobs = await this.ticketQueue.getDelayed();
        break;
      default:
        throw new NotFoundException(`Status "${status}" not found`);
    }

    return {
      queue: queueName,
      status,
      count: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        attemptsMade: job.attemptsMade,
      })),
    };
  }
}