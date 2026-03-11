import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle known operational errors
  if (err instanceof AppError) {
    console.error(`[AppError] ${err.statusCode}: ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
      },
    });
    return;
  }

  // Handle JSON parse errors (malformed request body)
  if (err instanceof SyntaxError && 'body' in err) {
    console.error(`[SyntaxError] 400: ${err.message}`);
    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid JSON in request body',
        statusCode: 400,
      },
    });
    return;
  }

  // Handle unexpected errors
  console.error(`[Error] 500: ${err.message}`);
  console.error(err.stack);

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal Server Error',
      statusCode: 500,
    },
  });
};
