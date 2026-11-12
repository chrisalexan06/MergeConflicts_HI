import { useEffect, useRef, useState, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  getOperatorOrders,
  getOperatorLedgerHistory,
  refundOperatorOrder,
  reassignOperatorOrder,
  restoreInitialState,
  updateOperatorRestaurantStatus,
  type OperatorLedgerEntry,
  type OperatorOrder,
  type OperatorRestaurantStatus,
} from '../api/operator';
import './OperatorDashboard.css';

interface RestaurantMarker {
  restaurantId: number;
  restaurantName: string;
  status: string;
  latitude: number;
  longitude: number;
  preparationQueueCount: number;
  preparationQueueLevel: 'long' | 'building' | 'short';
}

interface CourierMarker {
  id: string;
  name: string;
  status: string;
  latitude: number;
  longitude: number;
}

interface DashboardMapData {
  restaurants: RestaurantMarker[];
  couriers: CourierMarker[];
}

function statusClass(status: string): string {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] ?? character);
}

export default function OperatorDashboard({ token }: { token: string }) {
  const [data, setData] = useState<DashboardMapData | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapTileError, setMapTileError] = useState('');
  const [resetFeedback, setResetFeedback] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetInProgress, setResetInProgress] = useState(false);
  const [updatingRestaurantId, setUpdatingRestaurantId] = useState<number | null>(null);
  const [restaurantStatusFeedback, setRestaurantStatusFeedback] = useState('');
  const [restaurantStatusError, setRestaurantStatusError] = useState('');
  const [reassignmentOrderId, setReassignmentOrderId] = useState('');
  const [reassignmentCourierId, setReassignmentCourierId] = useState('');
  const [confirmedHandoff, setConfirmedHandoff] = useState(false);
  const [reassignmentInProgress, setReassignmentInProgress] = useState(false);
  const [reassignmentFeedback, setReassignmentFeedback] = useState('');
  const [reassignmentError, setReassignmentError] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState<OperatorLedgerEntry[]>([]);
  const [ledgerError, setLedgerError] = useState('');
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);
  const [refundFeedback, setRefundFeedback] = useState('');
  const [refundError, setRefundError] = useState('');
  const [orders, setOrders] = useState<OperatorOrder[]>([]);
  const [ordersError, setOrdersError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const mapElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let loadingTimer: number | undefined;
    const loadingStartedAt = Date.now();
    fetch('http://localhost:3000/api/operator/delivery/map-data', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async response => {
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          if (response.status === 404) {
            throw new Error('Map endpoint not found (HTTP 404): GET /api/operator/delivery/map-data. The server on port 3000 may be running older code or a different app. Restart the backend from my-app/server and confirm it is listening on port 3000.');
          }
          throw new Error(`Map API returned HTTP ${response.status} with ${contentType || 'an unexpected response'} instead of JSON. Check the backend server at http://localhost:3000.`);
        }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load map data.');
        return body as DashboardMapData;
      })
      .then(value => {
        if (active) {
          setError('');
          setData(value);
          const remainingVisibleTime = Math.max(0, 700 - (Date.now() - loadingStartedAt));
          loadingTimer = window.setTimeout(() => {
            if (active) setMapLoading(false);
          }, remainingVisibleTime);
        }
      })
      .catch(reason => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Could not load map data.');
          setMapLoading(false);
        }
      });
    return () => {
      active = false;
      if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
    };
  }, [token, refreshVersion]);

  useEffect(() => {
    let active = true;
    void getOperatorOrders(token)
      .then(allOrders => {
        if (active) {
          setOrders(allOrders);
          setOrdersError('');
        }
      })
      .catch(reason => {
        if (active) {
          setOrdersError(reason instanceof Error ? reason.message : 'Could not load all orders.');
        }
      });
    return () => { active = false; };
  }, [token, refreshVersion]);

  useEffect(() => {
    let active = true;
    void getOperatorLedgerHistory(token)
      .then(entries => {
        if (active) {
          setLedgerEntries(entries);
          setLedgerError('');
        }
      })
      .catch(reason => {
        if (active) {
          setLedgerError(reason instanceof Error ? reason.message : 'Could not load ledger history.');
        }
      });
    return () => { active = false; };
  }, [token, refreshVersion]);

  async function handleRestoreInitialState(): Promise<void> {
    if (!window.confirm('Restore the initial SugarDash state? Current orders and operational history will be removed.')) {
      return;
    }

    setResetInProgress(true);
    setResetFeedback('');
    setResetError('');
    try {
      await restoreInitialState(token);
      setResetFeedback('Initial state restored successfully.');
      setMapLoading(true);
      setError('');
      setMapTileError('');
      setRefreshVersion(version => version + 1);
    } catch (reason) {
      setResetError(reason instanceof Error ? reason.message : 'Could not restore the initial state.');
    } finally {
      setResetInProgress(false);
    }
  }

  async function handleRestaurantStatusChange(
    restaurantId: number,
    status: OperatorRestaurantStatus
  ): Promise<void> {
    setUpdatingRestaurantId(restaurantId);
    setRestaurantStatusFeedback('');
    setRestaurantStatusError('');
    try {
      await updateOperatorRestaurantStatus(token, restaurantId, status);
      setRestaurantStatusFeedback(`Restaurant status updated to ${status}.`);
      setMapLoading(true);
      setError('');
      setMapTileError('');
      setRefreshVersion(version => version + 1);
    } catch (reason) {
      setRestaurantStatusError(
        reason instanceof Error ? reason.message : 'Could not update restaurant status.'
      );
    } finally {
      setUpdatingRestaurantId(null);
    }
  }

  async function handleReassignOrder(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const orderId = Number(reassignmentOrderId);
    const courierId = Number(reassignmentCourierId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0
      || !Number.isSafeInteger(courierId) || courierId <= 0) {
      setReassignmentError('Enter valid positive integer order and courier IDs.');
      setReassignmentFeedback('');
      return;
    }

    setReassignmentInProgress(true);
    setReassignmentFeedback('');
    setReassignmentError('');
    try {
      const result = await reassignOperatorOrder(
        token,
        orderId,
        courierId,
        confirmedHandoff
      );
      setReassignmentFeedback(result.message);
      setMapLoading(true);
      setError('');
      setMapTileError('');
      setRefreshVersion(version => version + 1);
    } catch (reason) {
      setReassignmentError(
        reason instanceof Error ? reason.message : 'Could not reassign the order.'
      );
    } finally {
      setReassignmentInProgress(false);
    }
  }

  async function handleRefundOrder(orderId: string): Promise<void> {
    setRefundingOrderId(orderId);
    setRefundFeedback('');
    setRefundError('');
    try {
      await refundOperatorOrder(token, orderId);
      setRefundFeedback(`Order ${orderId} refunded successfully.`);
      setMapLoading(true);
      setError('');
      setMapTileError('');
      setRefreshVersion(version => version + 1);
    } catch (reason) {
      setRefundError(reason instanceof Error ? reason.message : 'Could not refund the order.');
    } finally {
      setRefundingOrderId(null);
    }
  }

  function handleMapRefresh(): void {
    setError('');
    setMapTileError('');
    setMapLoading(true);
    setRefreshVersion(version => version + 1);
  }

  useEffect(() => {
    if (mapLoading || !data || !mapElement.current || (data.restaurants.length === 0 && data.couriers.length === 0)) return;

    const map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true });
    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    });
    tileLayer.on('tileerror', () => {
      setMapTileError('Map tiles could not be loaded. Check your connection and retry the map.');
    });
    tileLayer.addTo(map);

    const locations: L.LatLngExpression[] = [];
    const addMarker = (latitude: number, longitude: number, kind: 'restaurant' | 'courier', name: string, status: string, preparationQueueCount?: number, preparationQueueLevel?: 'long' | 'building' | 'short') => {
      const point: L.LatLngExpression = [latitude, longitude];
      locations.push(point);
      const letter = kind === 'restaurant' ? 'R' : 'C';
      const icon = L.divIcon({
        className: 'location-marker-icon',
        html: `<span class="location-marker ${kind}-marker${preparationQueueLevel ? ` queue-${preparationQueueLevel}` : ''}" title="${escapeHtml(name)}"><span class="marker-letter">${letter}</span><i class="status-dot status-${statusClass(status)}"></i></span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      const queueDetail = preparationQueueLevel
        ? `<br>Preparation queue: <strong>${preparationQueueLevel}</strong> (${preparationQueueCount} queued)`
        : '';
      L.marker(point, { icon, zIndexOffset: kind === 'restaurant' ? 1000 : 0 })
        .bindTooltip(`<strong>${escapeHtml(name)}</strong><br>${escapeHtml(status)}${queueDetail}`, { direction: 'top', offset: [0, -16] })
        .bindPopup(`<strong>${escapeHtml(name)}</strong><br>${escapeHtml(status)}${queueDetail}`)
        .addTo(map);
    };

    data.restaurants.forEach(restaurant => addMarker(restaurant.latitude, restaurant.longitude, 'restaurant', restaurant.restaurantName, restaurant.status, restaurant.preparationQueueCount, restaurant.preparationQueueLevel));
    data.couriers.forEach(courier => addMarker(courier.latitude, courier.longitude, 'courier', courier.name, courier.status));

    if (locations.length === 1) map.setView(locations[0], 14);
    else if (locations.length > 1) map.fitBounds(L.latLngBounds(locations), { padding: [56, 56], maxZoom: 15 });
    else map.setView([45.5017, -73.5673], 12);

    return () => { map.remove(); };
  }, [data, mapLoading]);

  return (
    <section className="operator-dashboard">
      <div className="operator-heading">
        <div><p className="eyebrow">Live city overview</p><h1>City operations</h1></div>
        {data && <p>{data.restaurants.length} restaurants · {data.couriers.length} on-duty couriers</p>}
      </div>
      <div className="operator-reset-controls">
        <button type="button" onClick={handleRestoreInitialState} disabled={resetInProgress}>
          {resetInProgress ? 'Restoring…' : 'Restore Initial State'}
        </button>
        {resetFeedback && <p role="status">{resetFeedback}</p>}
        {resetError && <p role="alert">{resetError}</p>}
      </div>
      <section className="operator-reassignment" aria-labelledby="operator-reassignment-heading">
        <h2 id="operator-reassignment-heading">Reassign stalled order</h2>
        <p>Enter the order ID and the ID of the courier who should receive it.</p>
        <form onSubmit={(event) => void handleReassignOrder(event)}>
          <label>
            Order ID
            <input
              type="number"
              min="1"
              step="1"
              required
              value={reassignmentOrderId}
              onChange={event => setReassignmentOrderId(event.target.value)}
            />
          </label>
          <label>
            New courier ID
            <input
              type="number"
              min="1"
              step="1"
              required
              value={reassignmentCourierId}
              onChange={event => setReassignmentCourierId(event.target.value)}
            />
          </label>
          <label className="operator-handoff-confirmation">
            <input
              type="checkbox"
              checked={confirmedHandoff}
              onChange={event => setConfirmedHandoff(event.target.checked)}
            />
            Confirm physical handoff if the order was picked up
          </label>
          <button type="submit" disabled={reassignmentInProgress}>
            {reassignmentInProgress ? 'Reassigning…' : 'Reassign order'}
          </button>
        </form>
        {reassignmentFeedback && <p role="status">{reassignmentFeedback}</p>}
        {reassignmentError && <p role="alert">{reassignmentError}</p>}
      </section>
      <section className="operator-restaurants" aria-labelledby="operator-restaurants-heading">
        <h2 id="operator-restaurants-heading">Restaurants</h2>
        {restaurantStatusFeedback && <p role="status">{restaurantStatusFeedback}</p>}
        {restaurantStatusError && <p role="alert">{restaurantStatusError}</p>}
        {!data
          ? <p>Loading restaurants…</p>
          : data.restaurants.length === 0
            ? <p>No restaurants found.</p>
            : <ul>
                {data.restaurants.map(restaurant => (
                  <li key={restaurant.restaurantId}>
                    <span>
                      <strong>{restaurant.restaurantName}</strong>
                      {' · '}
                      <span className={`restaurant-status status-${statusClass(restaurant.status)}`}>
                        {restaurant.status}
                      </span>
                    </span>
                    {restaurant.status === 'open' && (
                      <button
                        type="button"
                        disabled={updatingRestaurantId === restaurant.restaurantId}
                        onClick={() => void handleRestaurantStatusChange(
                          restaurant.restaurantId,
                          'paused'
                        )}
                      >
                        {updatingRestaurantId === restaurant.restaurantId ? 'Updating…' : 'Pause'}
                      </button>
                    )}
                    {restaurant.status === 'paused' && (
                      <button
                        type="button"
                        disabled={updatingRestaurantId === restaurant.restaurantId}
                        onClick={() => void handleRestaurantStatusChange(
                          restaurant.restaurantId,
                          'open'
                        )}
                      >
                        {updatingRestaurantId === restaurant.restaurantId ? 'Updating…' : 'Reopen'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>}
      </section>
      <section className="operator-ledger" aria-labelledby="operator-ledger-heading">
        <h2 id="operator-ledger-heading">Ledger History</h2>
        {refundFeedback && <p role="status">{refundFeedback}</p>}
        {refundError && <p role="alert">{refundError}</p>}
        {ledgerError && <p role="alert">{ledgerError}</p>}
        {!ledgerError && ledgerEntries.length === 0 && <p>No ledger entries found.</p>}
        {ledgerEntries.length > 0 && (
          <div className="operator-ledger-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Entry</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Subtotal</th>
                  <th>Total</th>
                  <th>Customer</th>
                  <th>Restaurant</th>
                  <th>Courier</th>
                  <th>Delivered</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map(entry => {
                  const hasRefund = ledgerEntries.some(
                    candidate => candidate.orderId === entry.orderId && candidate.entryType === 'refund'
                  );
                  const isRefundEligible = entry.entryType === 'charge'
                    && entry.orderStatus === 'delivered'
                    && !hasRefund;
                  return (
                    <tr key={entry.ledgerEntryId}>
                      <td>#{entry.orderId}</td>
                      <td>{entry.entryType}</td>
                      <td>{entry.orderStatus}</td>
                      <td>${entry.amount.toFixed(2)}</td>
                      <td>${entry.subtotal.toFixed(2)}</td>
                      <td>${entry.total.toFixed(2)}</td>
                      <td>{entry.customerId}</td>
                      <td>{entry.restaurantId}</td>
                      <td>{entry.courierId ?? '—'}</td>
                      <td>{new Date(entry.deliveredAt).toLocaleString()}</td>
                      <td>
                        {isRefundEligible && (
                          <button
                            type="button"
                            disabled={refundingOrderId === entry.orderId}
                            onClick={() => void handleRefundOrder(entry.orderId)}
                          >
                            {refundingOrderId === entry.orderId ? 'Refunding…' : 'Refund'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="operator-orders" aria-labelledby="operator-orders-heading">
        <h2 id="operator-orders-heading">All Orders</h2>
        {ordersError && <p role="alert">{ordersError}</p>}
        {!ordersError && orders.length === 0 && <p>No orders found.</p>}
        {orders.length > 0 && (
          <div className="operator-orders-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Customer</th>
                  <th>Restaurant</th>
                  <th>Courier</th>
                  <th>Items</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.orderId}>
                    <td>#{order.orderId}</td>
                    <td>{order.status}</td>
                    <td>{order.customerName ?? `#${order.customerId}`}</td>
                    <td>{order.restaurantName ?? `#${order.restaurantId}`}</td>
                    <td>{order.courierName
                      ? `${order.courierName} (#${order.courierId})`
                      : order.courierId == null ? '—' : `#${order.courierId}`}</td>
                    <td>{order.items.map(item => `${item.quantity} × ${item.itemName}`).join(', ')}</td>
                    <td>{new Date(order.createdAt).toLocaleString()}</td>
                    <td>{new Date(order.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="operator-map-toolbar">
        <h2>City map</h2>
        <button type="button" onClick={handleMapRefresh} disabled={mapLoading}>Refresh map</button>
      </div>
      {error
        ? <div className="operator-map-shell"><p className="operator-map-error" role="alert">{error}</p></div>
        : mapLoading
          ? <div className="operator-map-shell"><div className="operator-map-loading" role="status"><span className="operator-loading-spinner" aria-hidden="true" />Loading map data…</div></div>
          : !data
            ? null
            : <>
              <div className="operator-map-shell">
                {data.restaurants.length === 0 && data.couriers.length === 0
                  ? <div className="operator-map-empty" role="status">
                      <span className="operator-map-empty-icon" aria-hidden="true">⌖</span>
                      <strong>No locations to display</strong>
                      <span>There are no restaurants or on-duty couriers in the current dataset.</span>
                    </div>
                  : <div ref={mapElement} className="operator-map" role="application" aria-label="Interactive map of restaurants and on-duty couriers" />}
              </div>
              {mapTileError && (
                <p className="operator-map-tile-error" role="alert">
                  {mapTileError}{' '}
                  <button type="button" onClick={handleMapRefresh}>Retry map</button>
                </p>
              )}
              <div className="map-legend" aria-label="Map legend">
                <div className="legend-group"><strong>Map markers</strong><span><i className="legend-restaurant">R</i> Restaurant</span><span><i className="legend-courier">C</i> Courier</span></div>
                <div className="legend-group"><strong>Preparation queue</strong><span><i className="queue-key queue-short" /> Short: 0–2</span><span><i className="queue-key queue-building" /> Building: 3–5</span><span><i className="queue-key queue-long" /> Long: 6+ or paused</span></div>
                <div className="legend-group"><strong>Restaurant status</strong><span><i className="status-dot status-open" /> Open</span><span><i className="status-dot status-paused" /> Paused</span><span><i className="status-dot status-closed" /> Closed</span></div>
                <div className="legend-group"><strong>Courier status</strong><span><i className="status-dot status-idle" /> Idle</span><span><i className="status-dot status-assigned" /> Assigned</span><span><i className="status-dot status-carrying" /> Carrying</span></div>
              </div>
            </>}
    </section>
  );
}
