export class OrderLine {
  constructor(
    public readonly itemId: string,
    public readonly itemName: string,
    public readonly unitPrice: number,
    public readonly quantity: number,
  ) {
    if (!itemId.trim()) {
      throw new Error('An order line must reference an item.');
    }
    if (!itemName.trim()) {
      throw new Error('An order line must have an item name.');
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('An order line must have a valid non-negative price.');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Order line quantity must be a positive integer.');
    }
  }

  get subtotal(): number {
    return this.unitPrice * this.quantity;
  }
}
