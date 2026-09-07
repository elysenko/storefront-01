import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReviewsService, type ReviewEligibility } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../common/api-role';
import type { ReviewView } from '../catalog/catalog.service';

@ApiTags('reviews')
@Controller('products/:id/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param('id') productId: string): Promise<ReviewView[]> {
    return this.reviews.list(productId);
  }

  /** Drives whether the SPA offers the review form at all. */
  @Get('eligibility')
  @UseGuards(OptionalJwtGuard)
  eligibility(
    @Param('id') productId: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<ReviewEligibility> {
    return this.reviews.eligibility(productId, user?.id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  create(
    @Param('id') productId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ReviewView> {
    return this.reviews.create(productId, user.id, dto);
  }
}
