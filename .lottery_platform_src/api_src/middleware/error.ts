import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Route not found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      issues: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ ok: false, code: err.code, message: err.message });
    return;
  }

  console.error('[unhandled]', err);
  res.status(500).json({
    ok: false,
    code: 'INTERNAL_ERROR',
    message: isProd ? 'Something went wrong' : String(err),
  });
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler<T extends (req: Request, res: Response) => Promise<unknown>>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}
