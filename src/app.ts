import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import menuRoutes from './routes/menu.routes';
import orderRoutes from './routes/order.routes';
import { errorHandler } from './middlewares/error.middleware';
import analysisRoutes from './routes/analysis.routes';

import roomTypeRoutes from './routes/roomType.routes';
import bookingRoutes from './routes/booking.routes';
import cmRoutes from './routes/cm.routes';

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://10.221.54.4:3000',
    'https://restaurantfrontend-ei8x.onrender.com'
  ],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/analysis', analysisRoutes);

app.use('/api/room-types', roomTypeRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/cm', cmRoutes);

// Error Handling Middleware
app.use(errorHandler);

export default app;
