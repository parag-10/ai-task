import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Task, TaskStatus, CreateTaskDto, UpdateTaskDto } from '../models/task.model';
import { FileDb } from '../database/fileDb';
import { AppError } from '../utils/AppError';
import { validateHighPriorityDueDate, buildStatusHistoryEntry } from '../utils/taskValidation';
import { sendSuccess, sendPaginated, sendMessage } from '../utils/responseHelper';

const taskDb = new FileDb<Task>('tasks.json');

// GET /api/tasks
export const getAllTasks = (req: Request, res: Response, _next: NextFunction): void => {
  let tasks = taskDb.findAll();

  // ── Filtering ────────────────────────────────────────────
  const { status, priority, search } = req.query;

  if (status && typeof status === 'string') {
    tasks = tasks.filter((t) => t.status === status);
  }

  if (priority && typeof priority === 'string') {
    tasks = tasks.filter((t) => t.priority === priority);
  }

  if (search && typeof search === 'string') {
    const keyword = search.toLowerCase();
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(keyword) ||
        t.description.toLowerCase().includes(keyword)
    );
  }

  // ── Sorting ──────────────────────────────────────────────
  const sortBy = (req.query.sortBy as string) || 'createdAt';
  const order = (req.query.order as string) || 'desc';

  const validSortFields = ['title', 'status', 'priority', 'dueDate', 'createdAt', 'updatedAt'];
  if (validSortFields.includes(sortBy)) {
    tasks.sort((a, b) => {
      const fieldA = a[sortBy as keyof Task] ?? '';
      const fieldB = b[sortBy as keyof Task] ?? '';

      if (fieldA < fieldB) return order === 'asc' ? -1 : 1;
      if (fieldA > fieldB) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // ── Pagination ───────────────────────────────────────────
  const totalCount = tasks.length;
  const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 100);
  const totalPages = Math.ceil(totalCount / limit);
  const startIndex = (page - 1) * limit;

  const paginatedTasks = tasks.slice(startIndex, startIndex + limit);

  sendPaginated(res, paginatedTasks, {
    page,
    limit,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  });
};

// GET /api/tasks/:id
export const getTaskById = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const task = taskDb.findByIdOrFail(req.params.id, 'Task');
    sendSuccess(res, task);
  } catch (err) {
    next(err);
  }
};

// POST /api/tasks
export const createTask = (req: Request, res: Response, _next: NextFunction): void => {
  const { title, description, status, priority, dueDate }: CreateTaskDto = req.body;

  const now = new Date().toISOString();

  const newTask: Task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: description?.trim() || '',
    status: status || 'pending',
    priority: priority || 'medium',
    dueDate: dueDate || null,
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  const created = taskDb.create(newTask);
  sendSuccess(res, created, 201);
};

// ── Update helpers ─────────────────────────────────────────

/**
 * Handles updating a completed task (reopen flow).
 * Only status changes (reopen) are allowed; title/description are locked.
 */
const handleCompletedTaskUpdate = (
  existing: Task,
  body: UpdateTaskDto
): Partial<Task> => {
  const { title, description, status, priority, dueDate, reopenReason } = body;

  if (title !== undefined || description !== undefined) {
    throw new AppError(
      'Cannot modify title or description of a completed task. Create a new task instead',
      400
    );
  }

  if (status === undefined || status === 'completed') {
    const fieldsAttempted = [priority !== undefined && 'priority', dueDate !== undefined && 'dueDate'].filter(Boolean);
    if (fieldsAttempted.length > 0 && status === undefined) {
      throw new AppError('Completed tasks cannot be modified. Change the status to reopen the task first', 400);
    }
    if (status === 'completed') {
      throw new AppError('Task is already completed', 400);
    }
  }

  if (!reopenReason || reopenReason.trim().length === 0) {
    throw new AppError('A reopen reason is required when reopening a completed task', 400);
  }

  const resolvedPriority = priority ?? existing.priority;
  const resolvedDueDate = dueDate !== undefined ? (dueDate || null) : existing.dueDate;
  validateHighPriorityDueDate(resolvedPriority, resolvedDueDate);

  const updates: Partial<Task> = {
    status: status as TaskStatus,
    statusHistory: [
      ...(existing.statusHistory || []),
      buildStatusHistoryEntry(existing.status, status as TaskStatus, reopenReason.trim()),
    ],
    updatedAt: new Date().toISOString(),
  };
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate || null;

  return updates;
};

/**
 * Builds a partial update object for a non-completed task.
 */
const buildTaskUpdates = (
  existing: Task,
  body: UpdateTaskDto
): Partial<Task> => {
  const { title, description, status, priority, dueDate } = body;
  const updates: Partial<Task> = { updatedAt: new Date().toISOString() };

  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description.trim();
  if (status !== undefined) {
    updates.status = status;
    if (status !== existing.status) {
      updates.statusHistory = [
        ...(existing.statusHistory || []),
        buildStatusHistoryEntry(existing.status, status),
      ];
    }
  }
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate || null;

  // Cross-field high-priority due-date check
  const resolvedPriority = priority ?? existing.priority;
  const resolvedDueDate = dueDate !== undefined ? updates.dueDate! : existing.dueDate;
  validateHighPriorityDueDate(resolvedPriority, resolvedDueDate);

  return updates;
};

// PUT /api/tasks/:id
export const updateTask = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const existing = taskDb.findByIdOrFail(req.params.id, 'Task');

    const updates = existing.status === 'completed'
      ? handleCompletedTaskUpdate(existing, req.body)
      : buildTaskUpdates(existing, req.body);

    const updated = taskDb.update(req.params.id, updates);
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/tasks/:id
export const deleteTask = (req: Request, res: Response, next: NextFunction): void => {
  try {
    taskDb.findByIdOrFail(req.params.id, 'Task');
    taskDb.delete(req.params.id);
    sendMessage(res, 'Task deleted successfully');
  } catch (err) {
    next(err);
  }
};
