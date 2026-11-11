import express from 'express';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orders.js';
import restaurantRoutes from './routes/restaurantRoutes.js';
import { SeedAccountLoader } from './application/REG/SeedAccountLoader.js';
import { InitialCitySeeder } from './seed/InitialCitySeeder.js';
import courierRoutes from './routes/couriers.js';
import operatorDeliveryRoutes from './routes/operatorDeliveryRoutes.js';
import operatorResetRoutes from './routes/operatorResetRoutes.js';
import operatorRestaurantRoutes from './routes/operatorRestaurantRoutes.js';
import operatorOrderRoutes from './routes/operatorOrderRoutes.js';
import { DispatchQueueService } from './application/DLV/DispatchQueueService.js';
import { pool } from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
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
  })
  .catch((err) => {
    console.error(
      'Failed to initialize or recover dispatch queue:',
      err
    );
  });

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});

export default app;
