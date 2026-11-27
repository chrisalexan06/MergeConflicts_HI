import express from 'express';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orders.js';
import restaurantRoutes from './routes/restaurantRoutes.js';
import { SeedAccountLoader } from './application/REG/SeedAccountLoader.js';
import { InitialCitySeeder } from './application/ORD/InitialCitySeeder.js';
import courierRoutes from './routes/couriers.js';
import operatorDeliveryRoutes from './routes/operatorDeliveryRoutes.js';
import operatorResetRoutes from './routes/operatorResetRoutes.js';
import operatorRestaurantRoutes from './routes/operatorRestaurantRoutes.js';
import operatorOrderRoutes from './routes/operatorOrderRoutes.js';
import ratingRoutes from './routes/ratings.js';
import { DispatchQueueService } from './application/DLV/DispatchQueueService.js';
import { pool } from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
let appReady = false;

// Dynamic CORS middleware: allows 5173, 5177, or any Vite localhost port
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin.startsWith('http://localhost:')) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

app.use((request, response, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    next();
    return;
  }

  const origin = request.get('origin');
  if (!origin) {
    next();
    return;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    response.status(403).json({ error: 'Request origin is not allowed.' });
    return;
  }

  const isLocalDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname);
  const requestHost = request.get('host');
  if (!isLocalDevelopment && originUrl.host !== requestHost) {
    response.status(403).json({ error: 'Request origin is not allowed.' });
    return;
  }

  next();
});

app.get('/health', async (_request, response) => {
  if (!appReady) {
    response.status(503).json({ status: 'starting' });
    return;
  }

  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch {
    response.status(503).json({ status: 'database unavailable' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/order-summaries', (await import('./routes/orderSummaryRoutes.js')).default);
app.use('/api/couriers', courierRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/test/restaurants', restaurantRoutes);
app.use('/api/operator/delivery', operatorDeliveryRoutes);
app.use('/api/operator/restaurants', operatorRestaurantRoutes);
app.use('/api/operator/orders', operatorOrderRoutes);
app.use('/api/operator', operatorResetRoutes);


InitialCitySeeder.seed()
  .then(() => SeedAccountLoader.load())
  .then(async () => {
    console.log('Database seeders completed successfully.');

    // Recover READY orders without active assignments
    // and retry the persisted dispatch queue.
    const dispatchQueue = new DispatchQueueService(pool);

    const result = await dispatchQueue.retryPendingOrders();

    console.log(
      `Dispatch recovery: ${result.offered} offers created, ` +
      `${result.waiting} waiting.`
    );
    appReady = true;
  })
  .catch((err) => {
    console.error(
      'Failed to initialize or recover dispatch queue:',
      err
    );
  });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server listening on 0.0.0.0:${PORT}`);
});

export default app;
