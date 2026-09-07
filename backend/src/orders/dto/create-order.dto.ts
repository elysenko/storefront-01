import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @MinLength(1, { message: 'Enter the name the order ships to.' })
  @MaxLength(120)
  shipName!: string;

  @IsString()
  @MinLength(1, { message: 'Enter a shipping address.' })
  @MaxLength(500)
  shipAddress!: string;
}
