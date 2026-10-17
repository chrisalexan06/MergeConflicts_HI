import { Router } from 'express';
import { OrderLine } from '../domain/ORD/OrderLine.js';
import { OrderService, OrderValidationError } from '../application/ORD/OrderService.js';

const router = Router();
const orderService = new OrderService();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOrderLine(value: unknown): value is { itemId: number; quantity: number } {
  return isRecord(value)
    && isPositiveInteger(value.itemId)
    && isPositiveInteger(value.quantity);
}

router.post('/', async (req, res) => {
  const body: unknown = req.body;
  if (!isRecord(body)
    || !isPositiveInteger(body.customerId)
    || !isPositiveInteger(body.restaurantId)
    || !Array.isArray(body.orderLines)
    || body.orderLines.length === 0
    || !body.orderLines.every(isOrderLine)) {
    res.status(400).json({
      error: 'Request must include positive integer customerId and restaurantId, plus a non-empty orderLines array of positive integer itemId and quantity values.',
    });
    return;
  }

  const orderLines = body.orderLines.map(
    (line) => new OrderLine(line.itemId, line.quantity)
  );

  try {
    const order = await orderService.placeOrder(
      body.customerId,
      body.restaurantId,
      orderLines
    );
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof OrderValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error('Failed to place order:', error);
    res.status(500).json({ error: 'An unexpected error occurred while placing the order.' });
  }
});

export default router;