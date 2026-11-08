import { useCallback, useEffect, useState } from 'react';
import { confirmDelivery, confirmPickup, getCurrentCourier } from '../api/courier';
import type { CurrentCourier } from '../types/courier';

interface CourierDashboardProps {
  token: string;
}

export default function CourierDashboard({ token }: CourierDashboardProps) {
  const [courier, setCourier] = useState<CurrentCourier | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCourier = useCallback(async () => {
    const currentCourier = await getCurrentCourier(token);
    setCourier(currentCourier);
  }, [token]);

  useEffect(() => {
    let active = true;

    void getCurrentCourier(token)
      .then((currentCourier) => {
        if (active) setCourier(currentCourier);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Could not load courier status.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [token]);

  async function handleConfirmation(action: typeof confirmPickup | typeof confirmDelivery) {
    if (!courier?.currentOrderId) return;

    setUpdating(true);
    setError(null);
    try {
      await action(token, courier.currentOrderId);
      await refreshCourier();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update the order.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className="card">
      <h1 className="page-title">Courier Dashboard</h1>
      {loading && <p className="muted">Loading courier status...</p>}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {!loading && courier && (
        <>
          <p>Current assigned order: {courier.currentOrderId ?? 'None'}</p>
          <p>Current order status: {courier.currentOrderStatus ?? 'None'}</p>
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={updating || courier.currentOrderStatus !== 'ready'}
              onClick={() => void handleConfirmation(confirmPickup)}
            >
              Confirm Pickup
            </button>
            <button
              type="button"
              className="btn"
              disabled={updating || courier.currentOrderStatus !== 'picked_up'}
              onClick={() => void handleConfirmation(confirmDelivery)}
            >
              Confirm Delivery
            </button>
          </div>
        </>
      )}
    </section>
  );
}