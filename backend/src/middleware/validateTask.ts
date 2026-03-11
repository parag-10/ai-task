import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from '../utils/AppError';

// ── Joi Schemas ──────────────────────────────────────────────

const taskStatusValues = ['pending', 'in-progress', 'completed'] as const;
const taskPriorityValues = ['low', 'medium', 'high'] as const;

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
}).min(1).messages({
  'object.min': 'At least one field (title, description, status, priority) must be provided',
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
    const message = error.details.map((d) => d.message).join('; ');
    return next(new AppError(message, 400));
  }

  req.body = value;
  next();
};

export const validateUpdateTask = (req: Request, _res: Response, next: NextFunction): void => {
  const { error, value } = updateTaskSchema.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    const message = error.details.map((d) => d.message).join('; ');
    return next(new AppError(message, 400));
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
