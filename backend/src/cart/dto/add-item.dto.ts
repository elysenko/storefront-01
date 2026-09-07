import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class AddItemDto {
  @IsString()
  @MaxLength(64)
  productId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Choose a quantity of at least 1.' })
  @Min(1, { message: 'Choose a quantity of at least 1.' })
  @Max(999)
  qty!: number;
}
