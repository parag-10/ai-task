import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Task, CreateTaskDto, UpdateTaskDto } from '../models/task.model';
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

  const validSortFields = ['title', 'status', 'priority', 'createdAt', 'updatedAt'];
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
  const { title, description, status, priority }: CreateTaskDto = req.body;

  const now = new Date().toISOString();

  const newTask: Task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: description?.trim() || '',
    status: status || 'pending',
    priority: priority || 'medium',
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

  const { title, description, status, priority }: UpdateTaskDto = req.body;

  const updates: Partial<Task> = { updatedAt: new Date().toISOString() };

  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description.trim();
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;

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
