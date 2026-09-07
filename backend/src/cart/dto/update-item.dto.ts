import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateItemDto {
  @Type(() => Number)
  @IsInt({ message: 'Choose a quantity of at least 1.' })
  @Min(1, { message: 'Choose a quantity of at least 1.' })
  @Max(999)
  qty!: number;
}
