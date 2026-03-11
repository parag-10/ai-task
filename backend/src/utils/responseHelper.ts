import { Response } from 'express';

interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Send a standard success JSON response.
 */
export const sendSuccess = <T>(res: Response, data: T, statusCode = 200): void => {
  res.status(statusCode).json({ success: true, data });
};

/**
 * Send a paginated success JSON response.
 */
export const sendPaginated = <T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  statusCode = 200
): void => {
  res.status(statusCode).json({
    success: true,
    count: data.length,
    pagination,
    data,
  });
};

/**
 * Send a success message response (e.g. for DELETE).
 */
export const sendMessage = (res: Response, message: string, statusCode = 200): void => {
  res.status(statusCode).json({ success: true, message });
};
