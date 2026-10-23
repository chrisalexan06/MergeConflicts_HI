import { Router, Request, Response } from 'express';
import { RegistrationService } from '../application/REG/RegistrationService.js';
import {AuthenticationService} from '../application/REG/AuthenticationService.js';
import { Role } from '../domain/REG/Role.js';

const router = Router();
const registrationService = new RegistrationService();
const authService = new AuthenticationService(registrationService);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

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

router.get('/customer-address', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const account = token ? authService.getCurrentUser(token) : null;
  if (!account) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }
  if (account.role !== Role.CUSTOMER) {
    res.status(403).json({ error: 'Only customers can manage delivery details.' });
    return;
  }

  try {
    const customerProfile = await registrationService.findCustomerProfile(account.accountID);
    if (customerProfile === null) {
      res.status(404).json({ error: 'Customer profile was not found.' });
      return;
    }
    res.json(customerProfile);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not load customer profile.' });
  }
});

router.put('/customer-address', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const account = token ? authService.getCurrentUser(token) : null;
  if (!account) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }
  if (account.role !== Role.CUSTOMER) {
    res.status(403).json({ error: 'Only customers can manage delivery details.' });
    return;
  }

  const { deliveryAddress, city, country }: {
    deliveryAddress?: unknown;
    city?: unknown;
    country?: unknown;
  } = req.body ?? {};
  if (!isNonEmptyString(deliveryAddress) || !isNonEmptyString(city) || !isNonEmptyString(country)) {
    res.status(400).json({ error: 'Enter a delivery address, city, and country.' });
    return;
  }

  try {
    const updated = await registrationService.updateCustomerProfile(account.accountID, {
      deliveryAddress,
      city,
      country,
    });
    if (!updated) {
      res.status(404).json({ error: 'Customer profile was not found.' });
      return;
    }
    res.json({
      deliveryAddress: deliveryAddress.trim(),
      city: city.trim(),
      country: country.trim(),
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save customer profile.' });
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
