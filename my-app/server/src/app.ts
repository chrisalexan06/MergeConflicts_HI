import express from 'express';
import authRoutes from './routes/authRoutes.js';
import { SeedAccountLoader } from './application/REG/SeedAccountLoader.js';

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

SeedAccountLoader.load()
  .then(() => console.log('Seed accounts loaded successfully.'))
  .catch((err) => console.error('Failed to load seed accounts:', err));
  
app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});

export default app;
