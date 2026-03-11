import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Task, TaskStatus, CreateTaskDto, UpdateTaskDto, StatusHistoryEntry } from '../models/task.model';
import { FileDb } from '../database/fileDb';
import { AppError } from '../utils/AppError';

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

  res.status(200).json({
    success: true,
    count: paginatedTasks.length,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    data: paginatedTasks,
  });
};

// GET /api/tasks/:id
export const getTaskById = (req: Request, res: Response, next: NextFunction): void => {
  const task = taskDb.findById(req.params.id);

  if (!task) {
    return next(new AppError(`Task not found with id: ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: task,
  });
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

  res.status(201).json({
    success: true,
    data: created,
  });
};

// PUT /api/tasks/:id
export const updateTask = (req: Request, res: Response, next: NextFunction): void => {
  const existing = taskDb.findById(req.params.id);

  if (!existing) {
    return next(new AppError(`Task not found with id: ${req.params.id}`, 404));
  }

  const { title, description, status, priority, dueDate, reopenReason }: UpdateTaskDto = req.body;

  // ── Completed task lock ────────────────────────────────────
  // If the task is completed, only allow changing the status (to reopen it).
  // Title and description cannot be changed during reopen to preserve the
  // original task's identity and resolution history.
  if (existing.status === 'completed') {
    if (title !== undefined || description !== undefined) {
      return next(new AppError(
        'Cannot modify title or description of a completed task. Create a new task instead',
        400
      ));
    }

    if (status === undefined || status === 'completed') {
      const fieldsAttempted = [priority !== undefined && 'priority', dueDate !== undefined && 'dueDate'].filter(Boolean);
      if (fieldsAttempted.length > 0 && status === undefined) {
        return next(new AppError('Completed tasks cannot be modified. Change the status to reopen the task first', 400));
      }
      if (status === 'completed') {
        return next(new AppError('Task is already completed', 400));
      }
    }

    // reopenReason is required when reopening a completed task
    if (!reopenReason || reopenReason.trim().length === 0) {
      return next(new AppError('A reopen reason is required when reopening a completed task', 400));
    }

    // Build status history entry
    const historyEntry: StatusHistoryEntry = {
      from: existing.status,
      to: status as TaskStatus,
      reason: reopenReason.trim(),
      timestamp: new Date().toISOString(),
    };

    // Reopening: allow status change + priority/dueDate adjustments only
    const updates: Partial<Task> = {
      status,
      statusHistory: [...(existing.statusHistory || []), historyEntry],
      updatedAt: new Date().toISOString(),
    };
    if (priority !== undefined) updates.priority = priority;
    if (dueDate !== undefined) updates.dueDate = dueDate || null;

    // Validate high-priority rule on reopen
    const resolvedPriority = priority ?? existing.priority;
    const resolvedDueDate = dueDate !== undefined ? (dueDate || null) : existing.dueDate;

    if (resolvedPriority === 'high') {
      if (!resolvedDueDate) {
        return next(new AppError('High priority tasks must have a due date', 400));
      }
      const due = new Date(resolvedDueDate + 'T00:00:00.000Z');
      const sevenDays = new Date();
      sevenDays.setDate(sevenDays.getDate() + 7);
      sevenDays.setHours(23, 59, 59, 999);
      if (due > sevenDays) {
        return next(new AppError('High priority tasks must have a due date within the next 7 days', 400));
      }
    }

    const updated = taskDb.update(req.params.id, updates);
    res.status(200).json({ success: true, data: updated });
    return;
  }

  const updates: Partial<Task> = { updatedAt: new Date().toISOString() };

  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description.trim();
  if (status !== undefined) {
    updates.status = status;
    // Track status change in history
    if (status !== existing.status) {
      const historyEntry: StatusHistoryEntry = {
        from: existing.status,
        to: status,
        timestamp: new Date().toISOString(),
      };
      updates.statusHistory = [...(existing.statusHistory || []), historyEntry];
    }
  }
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate || null;

  // Cross-field check: resolved priority (new or existing) + resolved dueDate
  const resolvedPriority = priority ?? existing.priority;
  const resolvedDueDate = dueDate !== undefined ? updates.dueDate : existing.dueDate;

  if (resolvedPriority === 'high') {
    if (!resolvedDueDate) {
      return next(new AppError('High priority tasks must have a due date', 400));
    }
    const due = new Date(resolvedDueDate + 'T00:00:00.000Z');
    const sevenDays = new Date();
    sevenDays.setDate(sevenDays.getDate() + 7);
    sevenDays.setHours(23, 59, 59, 999);
    if (due > sevenDays) {
      return next(new AppError('High priority tasks must have a due date within the next 7 days', 400));
    }
  }

  const updated = taskDb.update(req.params.id, updates);

  res.status(200).json({
    success: true,
    data: updated,
  });
};

// DELETE /api/tasks/:id
export const deleteTask = (req: Request, res: Response, next: NextFunction): void => {
  const existing = taskDb.findById(req.params.id);

  if (!existing) {
    return next(new AppError(`Task not found with id: ${req.params.id}`, 404));
  }

  taskDb.delete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Task deleted successfully',
  });
};
