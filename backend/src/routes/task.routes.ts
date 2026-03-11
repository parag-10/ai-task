import { Router } from 'express';
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from '../controllers/task.controller';
import {
  validateCreateTask,
  validateUpdateTask,
  validateTaskId,
} from '../middleware/validateTask';

const router = Router();

router.get('/', getAllTasks);
router.get('/:id', validateTaskId, getTaskById);
router.post('/', validateCreateTask, createTask);
router.put('/:id', validateTaskId, validateUpdateTask, updateTask);
router.delete('/:id', validateTaskId, deleteTask);

export default router;
