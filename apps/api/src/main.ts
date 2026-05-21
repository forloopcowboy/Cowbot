import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as supertokens from 'supertokens-node';
import { middleware, errorHandler } from 'supertokens-node/framework/express';

import { AppModule } from './app.module';
import { initSuperTokens } from './auth/supertokens.config';

async function bootstrap() {
  initSuperTokens();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Behind Caddy/Nginx: trust X-Forwarded-* so req.secure reflects the original
  // scheme and SuperTokens issues Secure cookies correctly.
  app.set('trust proxy', 1);

  // Comma-separated list of allowed origins, e.g.
  //   WEB_ORIGIN=https://invest.example.com,https://auth.invest.example.com
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:4200';
  const allowedOrigins = webOrigin.split(',').map((s) => s.trim()).filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    // `x-browser-user-agent` is sent by recent supertokens-web-js builds for
    // platform detection; supertokens-node@21's getAllCORSHeaders() doesn't
    // include it yet, so list it explicitly to avoid a CORS preflight failure.
    allowedHeaders: [
      'content-type',
      'x-browser-user-agent',
      ...supertokens.getAllCORSHeaders(),
    ],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', { exclude: ['/health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // SuperTokens HTTP middleware (handles /auth/* routes)
  app.use(middleware());

  const docConfig = new DocumentBuilder()
    .setTitle('Investment Plan API')
    .setDescription(
      'CRUD + report-generation API for the Investment Plan web app. ' +
        'Mirrors the IPC surface previously exposed by the Electron desktop client.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('sAccessToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'sAccessToken',
    })
    .addTag('profiles')
    .addTag('holdings')
    .addTag('reports')
    .addTag('market')
    .addTag('settings')
    .addTag('jobs')
    .addTag('advice')
    .build();
  const document = SwaggerModule.createDocument(app, docConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { withCredentials: true },
  });

  // SuperTokens error handler must come AFTER routes
  app.use(errorHandler());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger UI:  http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
