import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateReviewDto {
  /** Outside 1–5 the global ValidationPipe rejects with 400 before the service runs. */
  @Type(() => Number)
  @IsInt({ message: 'Choose a rating between 1 and 5 stars.' })
  @Min(1, { message: 'Choose a rating between 1 and 5 stars.' })
  @Max(5, { message: 'Choose a rating between 1 and 5 stars.' })
  rating!: number;

  @IsString()
  @MinLength(1, { message: 'Write a few words about the product.' })
  @MaxLength(2000)
  body!: string;
}
