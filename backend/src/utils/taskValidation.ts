import { TaskPriority, TaskStatus, StatusHistoryEntry } from '../models/task.model';
import { AppError } from './AppError';

/**
 * Validates that high-priority tasks have a due date within 7 days.
 * Throws AppError if the rule is violated.
 */
export const validateHighPriorityDueDate = (
  priority: TaskPriority,
  dueDate: string | null
): void => {
  if (priority !== 'high') return;

  if (!dueDate) {
    throw new AppError('High priority tasks must have a due date', 400);
  }

  const due = new Date(dueDate + 'T00:00:00.000Z');
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);
  sevenDays.setHours(23, 59, 59, 999);

  if (due > sevenDays) {
    throw new AppError('High priority tasks must have a due date within the next 7 days', 400);
  }
};

/**
 * Builds a StatusHistoryEntry for task status transitions.
 */
export const buildStatusHistoryEntry = (
  from: TaskStatus,
  to: TaskStatus,
  reason?: string
): StatusHistoryEntry => ({
  from,
  to,
  ...(reason ? { reason: reason.trim() } : {}),
  timestamp: new Date().toISOString(),
});
