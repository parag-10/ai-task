import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from '../utils/AppError';

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

// ── Joi Schemas ──────────────────────────────────────────────

const taskStatusValues = ['pending', 'in-progress', 'completed'] as const;
const taskPriorityValues = ['low', 'medium', 'high'] as const;

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfSevenDaysFromNow = (): Date => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 59, 999);
  return d;
};

const createTaskSchema = Joi.object({
  title: Joi.string().trim().min(1).max(100).required()
    .messages({
      'string.empty': 'Title is required and must be a non-empty string',
      'string.max': 'Title must not exceed 100 characters',
      'any.required': 'Title is required',
    }),
  description: Joi.string().trim().max(500).allow('').optional()
    .messages({
      'string.max': 'Description must not exceed 500 characters',
    }),
  status: Joi.string().valid(...taskStatusValues).optional()
    .messages({
      'any.only': `Status must be one of: ${taskStatusValues.join(', ')}`,
    }),
  priority: Joi.string().valid(...taskPriorityValues).optional()
    .messages({
      'any.only': `Priority must be one of: ${taskPriorityValues.join(', ')}`,
    }),
  dueDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional().allow(null)
    .messages({
      'string.pattern.base': 'Due date must be in YYYY-MM-DD format',
    }),
}).custom((value, helpers) => {
  // Validate dueDate is a real date and not in the past
  if (value.dueDate) {
    const due = new Date(value.dueDate + 'T00:00:00.000Z');
    if (isNaN(due.getTime())) {
      return helpers.error('any.custom', { message: 'Due date must be a valid date' });
    }
    if (due < startOfToday()) {
      return helpers.error('any.custom', { message: 'Due date cannot be in the past' });
    }
  }

  // High priority must have dueDate within 7 days
  if (value.priority === 'high') {
    if (!value.dueDate) {
      return helpers.error('any.custom', { message: 'High priority tasks must have a due date' });
    }
    const due = new Date(value.dueDate + 'T00:00:00.000Z');
    if (due > endOfSevenDaysFromNow()) {
      return helpers.error('any.custom', { message: 'High priority tasks must have a due date within the next 7 days' });
    }
  }
  return value;
}).messages({
  'any.custom': '{{#message}}',
});

const updateTaskSchema = Joi.object({
  title: Joi.string().trim().min(1).max(100).optional()
    .messages({
      'string.empty': 'Title must be a non-empty string',
      'string.max': 'Title must not exceed 100 characters',
    }),
  description: Joi.string().trim().max(500).allow('').optional()
    .messages({
      'string.max': 'Description must not exceed 500 characters',
    }),
  status: Joi.string().valid(...taskStatusValues).optional()
    .messages({
      'any.only': `Status must be one of: ${taskStatusValues.join(', ')}`,
    }),
  priority: Joi.string().valid(...taskPriorityValues).optional()
    .messages({
      'any.only': `Priority must be one of: ${taskPriorityValues.join(', ')}`,
    }),
  dueDate: Joi.date().iso().min('now').optional().allow(null)
    .messages({
      'date.base': 'Due date must be a valid ISO date string',
      'date.min': 'Due date cannot be in the past',
    }),
}).min(1).messages({
  'object.min': 'At least one field (title, description, status, priority, dueDate) must be provided',
});

const taskIdSchema = Joi.object({
  id: Joi.string().trim().required()
    .messages({
      'string.empty': 'A valid task ID is required',
      'any.required': 'A valid task ID is required',
    }),
});

// ── Validation Middleware ────────────────────────────────────

export const validateCreateTask = (req: Request, _res: Response, next: NextFunction): void => {
  const { error, value } = createTaskSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    const details = error.details.map((d) => ({
      field: d.path.join('.') || 'body',
      message: d.message,
      type: d.type,
    }));
    return next(new AppError(
      error.details.map((d) => d.message).join('; '),
      400,
      details
    ));
  }

  req.body = value;
  next();
};

export const validateUpdateTask = (req: Request, _res: Response, next: NextFunction): void => {
  const { error, value } = updateTaskSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    const details = error.details.map((d) => ({
      field: d.path.join('.') || 'body',
      message: d.message,
      type: d.type,
    }));
    return next(new AppError(
      error.details.map((d) => d.message).join('; '),
      400,
      details
    ));
  }

  // Validate dueDate is real and not in past
  if (value.dueDate) {
    const due = new Date(value.dueDate + 'T00:00:00.000Z');
    if (isNaN(due.getTime())) {
      return next(new AppError('Due date must be a valid date', 400));
    }
    if (due < startOfToday()) {
      return next(new AppError('Due date cannot be in the past', 400));
    }
  }

  // Cross-field validation: if updating to high priority, enforce dueDate within 7 days
  // The full check (against existing task data) is done in the controller
  if (value.priority === 'high' && value.dueDate !== undefined) {
    if (!value.dueDate) {
      return next(new AppError('High priority tasks must have a due date', 400));
    }
    const due = new Date(value.dueDate + 'T00:00:00.000Z');
    if (due > endOfSevenDaysFromNow()) {
      return next(new AppError('High priority tasks must have a due date within the next 7 days', 400));
    }
  }

  req.body = value;
  next();
};

export const validateTaskId = (req: Request, _res: Response, next: NextFunction): void => {
  const { error } = taskIdSchema.validate(req.params, { abortEarly: false });

  if (error) {
    const message = error.details.map((d) => d.message).join('; ');
    return next(new AppError(message, 400));
  }

  next();
};
