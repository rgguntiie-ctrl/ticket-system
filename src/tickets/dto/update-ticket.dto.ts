import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { TicketPriority, TicketStatus } from '../entities/ticket.entity';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Title must be at least 5 characters long' })
  @MaxLength(500, { message: 'Title must not exceed 500 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description?: string;

  @IsOptional()
  @IsEnum(TicketPriority, {
    message: 'Priority must be one of: LOW, MEDIUM, HIGH',
  })
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketStatus, {
    message: 'Status must be one of: OPEN, IN_PROGRESS, RESOLVED',
  })
  status?: TicketStatus;
}
