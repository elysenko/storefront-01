import 'reflect-metadata';
import * as http from 'http';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/**
 * The deploy manifest (colossus.yaml) declares the backend on 3001 while the
 * template's nginx proxies to 3000. Serving the same Express handler on both
 * removes the mismatch instead of betting on one of them.
 */
const PRIMARY_PORT = parseInt(process.env.PORT ?? '3000', 10);
const ALT_PORT = parseInt(process.env.ALT_PORT ?? '3001', 10);

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Same-origin in production (nginx proxies /api/), permissive elsewhere so a
  // local `ng serve` on :4200 works without extra configuration.
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Storefront API')
    .setDescription('Catalog, cart, checkout, orders and admin endpoints')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(PRIMARY_PORT);
  logger.log(`Storefront API listening on http://localhost:${PRIMARY_PORT}/api`);

  if (Number.isInteger(ALT_PORT) && ALT_PORT !== PRIMARY_PORT) {
    const handler = app.getHttpAdapter().getInstance() as http.RequestListener;
    http
      .createServer(handler)
      .listen(ALT_PORT, () => logger.log(`Also listening on http://localhost:${ALT_PORT}/api`))
      .on('error', (error: NodeJS.ErrnoException) => {
        // A busy alternate port is never fatal — the primary one is serving.
        logger.warn(`Alternate port ${ALT_PORT} unavailable: ${error.message}`);
      });
  }
}

void bootstrap();
