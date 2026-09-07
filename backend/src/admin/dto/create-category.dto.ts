import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1, { message: 'Enter a category name.' })
  @MaxLength(80)
  name!: string;
}
