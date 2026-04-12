import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    if (req.originalUrl?.includes('/payment/webhook')) {
      return next();
    }

    const hasCustomHeader = req.headers['x-requested-with'] === 'FotoUai';
    const hasContentType =
      req.headers['content-type']?.includes('application/json') ||
      req.headers['content-type']?.includes('multipart/form-data');

    if (!hasCustomHeader && !hasContentType) {
      return res.status(403).json({
        success: false,
        message: 'CSRF validation failed',
        statusCode: 403,
      });
    }

    next();
  }
}
