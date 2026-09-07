import { IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryAdminProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
