import { Router, Request, Response } from 'express';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import {AuthenticationService} from '../application/REG/AuthenticationService.js';

const router = Router();
const registrationService = new RegistrationService();
const authService = new AuthenticationService(registrationService);

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { accountName, password, email, role, extraData } = req.body;
   
    const account = await registrationService.registerAccount(
      accountName,
      password,
      email,
      role,
      extraData
    );

    res.status(201).json({
      account: {
        accountID: account.accountID,
        accountName: account.accountName,
        email: account.email,
        role: account.role,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/auth/check-username/:username
router.get('/check-username/:username', async (req: Request, res: Response) => {
  try {
    const isTaken = await registrationService.isUsernameDuplicate(String(req.params.username));
    res.json({ duplicate: isTaken });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
// POST /api/auth/login (Person 2)
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { accountName, password } = req.body;
    const result = await authService.login(accountName, password);
    res.json({
      sessionToken: result.sessionToken,
      account: {
        accountID: result.account.accountID,
        accountName: result.account.accountName,
        email: result.account.email,
        role: result.account.role,
      },
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

// POST /api/auth/logout 
router.post('/logout', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() || req.body.sessionToken;
  if (token) {
    authService.logout(token);
  }
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me (verify session)
router.get('/me', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token || !authService.isAuthenticated(token)) {
    return res.status(401).json({ error: 'Unauthorized: No active session' });
  }
  const user = authService.getCurrentUser(token);
  res.json({ user });
});
export default router;
