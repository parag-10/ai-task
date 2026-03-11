import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import healthRoutes from './routes/health.routes';
import taskRoutes from './routes/task.routes';
import { errorHandler } from './middleware/errorHandler';
import { AppError } from './utils/AppError';

const app: Application = express();

// ── Security Middleware ──────────────────────────────────────

// CORS – allow requests from the Angular frontend
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Helmet – set secure HTTP headers
app.use(helmet());

// Rate Limiting – 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests, please try again later', statusCode: 429 } },
});
app.use('/api', limiter);

// ── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

// ── Request Logging ──────────────────────────────────────────
morgan.token('exec-time', (_req, res) => {
  const startTime = res.getHeader('X-Request-Start');
  if (!startTime) return '0';
  return String(Date.now() - Number(startTime));
});

// Capture request start time
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Request-Start', String(Date.now()));
  next();
});

app.use(morgan('[:method] :url - Execution time: :exec-time ms'));

// ── Routes ───────────────────────────────────────────────────
app.use('/', healthRoutes);
app.use('/api/tasks', taskRoutes);

// ── 404 Catch-All ────────────────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404));
});

// ── Error Handling (must be last) ────────────────────────────
app.use(errorHandler);

export default app;
