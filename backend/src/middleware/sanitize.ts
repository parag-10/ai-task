import { Request, Response, NextFunction } from 'express';

// ── Sanitization Helpers ─────────────────────────────────────

const stripHtml = (str: string): string => str.replace(/<[^>]*>/g, '');

const sanitizeValue = (val: unknown): unknown => {
  if (typeof val === 'string') {
    return stripHtml(val).trim();
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (val !== null && typeof val === 'object') {
    return sanitizeObject(val as Record<string, unknown>);
  }
  return val;
};

const sanitizeObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    cleaned[key] = sanitizeValue(obj[key]);
  }
  return cleaned;
};

/**
 * Middleware: sanitizes all string values in req.body
 * - Strips HTML tags to prevent XSS
 * - Trims leading/trailing whitespace
 */
export const sanitizeBody = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};
