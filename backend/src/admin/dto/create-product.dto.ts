import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1, { message: 'Enter a product name.' })
  @MaxLength(200)
  name!: string;

  /** Either an existing category id… */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  /** …or a name, which is created on the fly when it does not exist yet. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryName?: string;

  @IsString()
  @MinLength(1, { message: 'Enter a description.' })
  @MaxLength(5000)
  description!: string;

  @Type(() => Number)
  @IsInt({ message: 'Enter the price in whole cents.' })
  @Min(0)
  @Max(100000000)
  priceCents!: number;

  @IsString()
  @MaxLength(2000)
  imageUrl!: string;

  @Type(() => Number)
  @IsInt({ message: 'Enter the stock quantity as a whole number.' })
  @Min(0)
  @Max(1000000)
  stockQty!: number;
}
