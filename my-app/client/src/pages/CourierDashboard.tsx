import { useCallback, useEffect, useState } from 'react';
import {
  confirmDelivery,
  confirmPickup,
  getCurrentCourier,
  acceptOffer,
  goOffDuty,
  goOnDuty,
} from '../api/courier';
import { getOrderSummary } from '../api/orderSummaries';
import type { CurrentCourier } from '../types/courier';
import './CourierDashboard.css';

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
      if (action === confirmDelivery) {
        try {
          await getOrderSummary(token, courier.currentOrderId);
        } catch (summaryError) {
          const message = summaryError instanceof Error
            ? summaryError.message
            : 'Could not record the delivered order summary.';
          setError(`Delivery was confirmed, but its ledger entry could not be recorded: ${message}`);
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update the order.');
    } finally {
      setUpdating(false);
    }
  }

  async function handleDutyChange(action: typeof goOnDuty | typeof goOffDuty) {
    setUpdating(true);
    setError(null);
    try {
      await action(token);
      await refreshCourier();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update courier duty status.');
    } finally {
      setUpdating(false);
    }
  }

  async function handleAcceptOffer() {
    if (!courier?.currentOfferId) return;

    setUpdating(true);
    setError(null);
    try {
      await acceptOffer(token, courier.currentOfferId);
      await refreshCourier();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not accept the offer.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className="card courier-dashboard">
      <header className="courier-dashboard-header">
        <div>
          <p className="courier-eyebrow">On the road</p>
          <h1 className="page-title">Courier Dashboard</h1>
        </div>
      </header>
      {loading && <p className="muted courier-loading">Loading courier status...</p>}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {!loading && courier && (
        <>
          <div className="courier-summary-grid" aria-label="Courier current state">
            <article className="courier-summary-card">
              <span className="courier-summary-label">Courier Status</span>
              <strong className={`courier-summary-value courier-status-value courier-status-value--${courier.status}`}>
                {courier.status}
              </strong>
            </article>
            <article className="courier-summary-card">
              <span className="courier-summary-label">Current Assigned Order</span>
              <strong className="courier-summary-value">
                {courier.currentOrderId ? `#${courier.currentOrderId}` : 'None'}
              </strong>
            </article>
            <article className="courier-summary-card">
              <span className="courier-summary-label">Current Order Status</span>
              <strong className={`courier-summary-value courier-order-status courier-order-status--${courier.currentOrderStatus ?? 'none'}`}>
                {courier.currentOrderStatus ?? '—'}
              </strong>
            </article>
          </div>
          {courier.currentOfferId && (
            <section className="courier-offer-card" aria-labelledby="courier-offer-heading">
              <div className="courier-offer-copy">
                <p className="courier-offer-eyebrow">A delivery is waiting</p>
                <h2 id="courier-offer-heading">New Delivery Offer</h2>
                <p className="courier-offer-order">Order #{courier.currentOfferId}</p>
                <p className="courier-offer-help">Accept this offer to take the delivery.</p>
              </div>
              <button
                type="button"
                className="btn courier-offer-button"
                disabled={updating}
                onClick={() => void handleAcceptOffer()}
              >
                {updating ? 'Accepting…' : 'Accept Offer'}
              </button>
            </section>
          )}
          <div className="courier-action-sections">
            <section className="courier-action-section" aria-labelledby="courier-duty-heading">
              <div className="courier-section-heading">
                <h2 id="courier-duty-heading">Duty</h2>
                <p>Manage your availability for deliveries.</p>
              </div>
              <div className="courier-action-row">
                {courier.status === 'offline' && (
                  <button
                    type="button"
                    className="btn courier-action-button"
                    disabled={updating}
                    onClick={() => void handleDutyChange(goOnDuty)}
                  >
                    {updating ? 'Updating…' : 'Go On Duty'}
                  </button>
                )}
                {courier.status === 'idle' && courier.currentOrderId === null && !courier.currentOfferId && (
                  <button
                    type="button"
                    className="btn btn-secondary courier-action-button"
                    disabled={updating}
                    onClick={() => void handleDutyChange(goOffDuty)}
                  >
                    {updating ? 'Updating…' : 'Go Off Duty'}
                  </button>
                )}
              </div>
            </section>
            <section className="courier-action-section" aria-labelledby="courier-delivery-heading">
              <div className="courier-section-heading">
                <h2 id="courier-delivery-heading">Delivery Actions</h2>
                <p>Update your active delivery as it progresses.</p>
              </div>
              <div className="courier-delivery-actions">
                <div className="courier-delivery-action">
                  <button
                    type="button"
                    className="btn courier-action-button"
                    disabled={updating || courier.currentOrderStatus !== 'ready'}
                    onClick={() => void handleConfirmation(confirmPickup)}
                  >
                    Confirm Pickup
                  </button>
                  {courier.currentOrderStatus !== 'ready' && (
                    <p className="courier-action-help">Pickup becomes available when the order is ready.</p>
                  )}
                </div>
                <div className="courier-delivery-action">
                  <button
                    type="button"
                    className="btn courier-action-button"
                    disabled={updating || courier.currentOrderStatus !== 'picked_up'}
                    onClick={() => void handleConfirmation(confirmDelivery)}
                  >
                    Confirm Delivery
                  </button>
                  {courier.currentOrderStatus !== 'picked_up' && (
                    <p className="courier-action-help">Delivery becomes available after pickup.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}