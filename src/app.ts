import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

app.use(cors({
  origin: 'http://localhost:3000', // Update if frontend is on a different port
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Error Handling Middleware
app.use(errorHandler);

export default app;
