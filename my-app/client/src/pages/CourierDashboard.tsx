import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  confirmDelivery,
  confirmPickup,
  getCurrentCourier,
  acceptOffer,
  goOffDuty,
  goOnDuty,
} from '../api/courier';
import { getOrderSummary } from '../api/orderSummaries';
import { getMyCourierRatingSummary, type CourierRatingSummary } from '../api/ratings';
import type { CurrentCourier } from '../types/courier';
import './CourierDashboard.css';

function formatStatus(status: string | null | undefined): string {
  if (!status) return '—';
  const text = status.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface CourierDashboardProps {
  token: string;
}

type CourierView = 'status' | 'delivery';

export default function CourierDashboard({ token }: CourierDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: CourierView = searchParams.get('view') === 'delivery' ? 'delivery' : 'status';
  const setView = (nextView: CourierView) => setSearchParams({ view: nextView });
  const [courier, setCourier] = useState<CurrentCourier | null>(null);
  const [ratingSummary, setRatingSummary] = useState<CourierRatingSummary | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [statusRefreshError, setStatusRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const refreshCourier = useCallback(async () => {
    const currentCourier = await getCurrentCourier(token);
    setCourier(currentCourier);
    void getMyCourierRatingSummary(token)
      .then((summary) => {
        setRatingSummary(summary);
        setRatingError(null);
      })
      .catch((requestError: unknown) => {
        setRatingError(requestError instanceof Error ? requestError.message : 'Could not load courier ratings.');
      });
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

    void getMyCourierRatingSummary(token)
      .then((summary) => {
        if (active) {
          setRatingSummary(summary);
          setRatingError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setRatingError(requestError instanceof Error ? requestError.message : 'Could not load courier ratings.');
        }
      });

    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (courier?.status !== 'idle' || updating) return;

    let active = true;
    let timeoutId: number;

    const refreshStatus = async () => {
      try {
        const latestCourier = await getCurrentCourier(token);
        if (!active) return;
        setCourier(latestCourier);
        setStatusRefreshError(null);
      } catch (requestError: unknown) {
        if (active) {
          setStatusRefreshError(
            requestError instanceof Error ? requestError.message : 'Could not refresh courier offers.'
          );
        }
      }

      if (active) {
        timeoutId = window.setTimeout(() => void refreshStatus(), 5000);
      }
    };

    timeoutId = window.setTimeout(() => void refreshStatus(), 5000);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [courier?.status, token, updating]);

  async function handleConfirmation(action: typeof confirmPickup | typeof confirmDelivery) {
    if (!courier?.currentOrderId) return;

    setUpdating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await action(token, courier.currentOrderId);
      if (action === confirmDelivery) {
        setSuccessMessage('Delivery confirmed.');
      }
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
    setSuccessMessage(null);
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
    setSuccessMessage(null);
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
          <h1 className="page-title">Courier Dashboard</h1>
        </div>
      </header>
      {loading && <p className="muted courier-loading">Loading courier status...</p>}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {successMessage && <div role="status" className="alert alert-success">{successMessage}</div>}
      {statusRefreshError && (
        <div role="alert" className="alert alert-error">
          Could not refresh courier offers: {statusRefreshError}
        </div>
      )}
      {!loading && courier && (
        <>
          <nav className="view-tabs" aria-label="Courier pages">
            <button type="button" className={view === 'status' ? 'view-tab active' : 'view-tab'} aria-current={view === 'status' ? 'page' : undefined} onClick={() => setView('status')}>Information</button>
            <button type="button" className={view === 'delivery' ? 'view-tab active' : 'view-tab'} aria-current={view === 'delivery' ? 'page' : undefined} onClick={() => setView('delivery')}>
              Deliveries{courier.currentOfferId ? ' · Offer Waiting' : ''}
            </button>
          </nav>
          {view === 'status' && <>
          <div className="courier-summary-grid" aria-label="Courier current state">
            <article className="courier-summary-card">
              <span className="courier-summary-label">Status</span>
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
                {formatStatus(courier.currentOrderStatus)}
              </strong>
            </article>
            <article className="courier-summary-card">
              <span className="courier-summary-label">Customer Rating</span>
              <strong className="courier-summary-value">
                {ratingSummary?.ratingCount
                  ? `★ ${ratingSummary.averageRating?.toFixed(1)} / 5`
                  : 'No ratings yet'}
              </strong>
              {Boolean(ratingSummary?.ratingCount) && (
                <span className="courier-summary-label">
                  {ratingSummary?.ratingCount} {ratingSummary?.ratingCount === 1 ? 'rating' : 'ratings'}
                </span>
              )}
              {ratingError && <span className="courier-action-help" role="alert">{ratingError}</span>}
            </article>
          </div>
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
                {courier.status === 'idle' && courier.currentOrderId === null && (
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
          </div>
          </>}
          {view === 'delivery' && <>
          <section className="courier-action-section courier-current-delivery" aria-labelledby="courier-current-delivery-heading">
            <div className="courier-section-heading">
              <h2 id="courier-current-delivery-heading">Current Delivery</h2>
              <p>{courier.currentOrderId
                ? <>Order #{courier.currentOrderId} · Status: <strong>{formatStatus(courier.currentOrderStatus)}</strong></>
                : courier.currentOfferId
                  ? 'Review and accept the offer below to begin.'
                  : 'No active delivery. New offers will appear here when available.'}</p>
            </div>
          </section>
          {courier.currentOfferId && (
            <section className="courier-offer-card" aria-labelledby="courier-offer-heading">
              <div className="courier-offer-copy">
                <h2 id="courier-offer-heading">New Delivery Offer: Order #{courier.currentOfferId}</h2>
                <p className="courier-offer-help">
                  From {courier.currentOfferRestaurantName ?? 'restaurant information unavailable'}
                </p>
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
            <section className="courier-action-section" aria-labelledby="courier-delivery-heading">
              <div className="courier-section-heading">
                <h2 id="courier-delivery-heading">Actions</h2>
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
          </>}
        </>
      )}
    </section>
  );
}
