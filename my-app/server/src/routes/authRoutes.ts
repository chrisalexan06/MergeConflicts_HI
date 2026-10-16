import { Router, Request, Response } from 'express';
import { RegistrationService } from '../application/REG/RegistrationService.js';

const router = Router();
const registrationService = new RegistrationService();

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

export default router;
