import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from '../utils/AppError';

// ── Shared constants ─────────────────────────────────────────

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

// ── Reusable dueDate schema fragment (YYYY-MM-DD) ────────────

const dueDateSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .allow(null)
  .optional()
  .messages({
    'string.pattern.base': 'Due date must be in YYYY-MM-DD format',
  });

// ── Joi Schemas ──────────────────────────────────────────────

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
  dueDate: dueDateSchema,
}).custom((value, helpers) => {
  if (value.dueDate) {
    const due = new Date(value.dueDate + 'T00:00:00.000Z');
    if (isNaN(due.getTime())) {
      return helpers.error('any.custom', { message: 'Due date must be a valid date' });
    }
    if (due < startOfToday()) {
      return helpers.error('any.custom', { message: 'Due date cannot be in the past' });
    }
  }

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
  dueDate: dueDateSchema,
  reopenReason: Joi.string().trim().min(1).max(500).optional()
    .messages({
      'string.empty': 'Reopen reason cannot be empty',
      'string.max': 'Reopen reason must not exceed 500 characters',
    }),
}).min(1).messages({
  'object.min': 'At least one field must be provided',
}).custom((value, helpers) => {
  if (value.dueDate) {
    const due = new Date(value.dueDate + 'T00:00:00.000Z');
    if (isNaN(due.getTime())) {
      return helpers.error('any.custom', { message: 'Due date must be a valid date' });
    }
    if (due < startOfToday()) {
      return helpers.error('any.custom', { message: 'Due date cannot be in the past' });
    }
  }

  if (value.priority === 'high' && value.dueDate !== undefined) {
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

const taskIdSchema = Joi.object({
  id: Joi.string().trim().required()
    .messages({
      'string.empty': 'A valid task ID is required',
      'any.required': 'A valid task ID is required',
    }),
});

// ── Generic Validation Factory ───────────────────────────────

type RequestSource = 'body' | 'params' | 'query';

/**
 * Creates validation middleware for the given Joi schema.
 * Replaces req[source] with the validated & stripped value on success.
 */
const validate = (schema: Joi.ObjectSchema, source: RequestSource = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.') || source,
        message: d.message,
        type: d.type,
      }));
      return next(
        new AppError(
          error.details.map((d) => d.message).join('; '),
          400,
          details
        )
      );
    }

    req[source] = value;
    next();
  };

// ── Exported Middleware ──────────────────────────────────────

export const validateCreateTask = validate(createTaskSchema, 'body');
export const validateUpdateTask = validate(updateTaskSchema, 'body');
export const validateTaskId = validate(taskIdSchema, 'params');
