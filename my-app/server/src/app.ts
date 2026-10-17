import express from 'express';
import authRoutes from './routes/authRoutes.js';
import restaurantRoutes from './routes/restaurantRoutes.js';
import { SeedAccountLoader } from './application/REG/SeedAccountLoader.js';
import { InitialCitySeeder } from './seed/InitialCitySeeder.js';



const app = express();
const PORT = process.env.PORT || 3000;

// Dynamic CORS middleware: allows 5173, 5177, or any Vite localhost port
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin.startsWith('http://localhost:')) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
app.use('/api/test/restaurants', restaurantRoutes);

InitialCitySeeder.seed()
  .then(() => SeedAccountLoader.load())
  .then(() => console.log('Database seeders completed successfully.'))
  .catch((err) => console.error('Failed to initialize database seed data:', err));

app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});

export default app;
