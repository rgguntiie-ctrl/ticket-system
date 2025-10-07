import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('admin/queues')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get(':name/stats')
  getQueueStats(@Param('name') name: string) {
    return this.queueService.getQueueStats(name);
  }

  @Get(':name/jobs')
  getJobsByStatus(
    @Param('name') name: string,
    @Query('status') status: string = 'waiting',
  ) {
    return this.queueService.getJobsByStatus(name, status);
  }
}