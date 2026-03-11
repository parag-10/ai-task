export interface ValidationDetail {
  field: string;
  message: string;
  type: string;
}

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public details?: ValidationDetail[];

  constructor(message: string, statusCode: number, details?: ValidationDetail[]) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}
