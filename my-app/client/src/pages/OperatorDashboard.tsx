import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './OperatorDashboard.css';

interface RestaurantMarker {
  restaurantId: number;
  restaurantName: string;
  status: string;
  latitude: number;
  longitude: number;
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
  const [error, setError] = useState('');
  const mapElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
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
      .then(value => { if (active) setData(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load map data.'); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!data || !mapElement.current) return;

    const map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map);

    const locations: L.LatLngExpression[] = [];
    const addMarker = (latitude: number, longitude: number, kind: 'restaurant' | 'courier', name: string, status: string) => {
      const point: L.LatLngExpression = [latitude, longitude];
      locations.push(point);
      const letter = kind === 'restaurant' ? 'R' : 'C';
      const icon = L.divIcon({
        className: 'location-marker-icon',
        html: `<span class="location-marker ${kind}-marker"><span class="marker-letter">${letter}</span><i class="status-dot status-${statusClass(status)}"></i></span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      L.marker(point, { icon })
        .bindTooltip(`<strong>${escapeHtml(name)}</strong><br>${escapeHtml(status)}`, { direction: 'top', offset: [0, -16] })
        .addTo(map);
    };

    data.restaurants.forEach(restaurant => addMarker(restaurant.latitude, restaurant.longitude, 'restaurant', restaurant.restaurantName, restaurant.status));
    data.couriers.forEach(courier => addMarker(courier.latitude, courier.longitude, 'courier', courier.name, courier.status));

    if (locations.length === 1) map.setView(locations[0], 14);
    else if (locations.length > 1) map.fitBounds(L.latLngBounds(locations), { padding: [56, 56], maxZoom: 15 });
    else map.setView([45.5017, -73.5673], 12);

    return () => { map.remove(); };
  }, [data]);

  if (error) return <section className="operator-dashboard"><h1>City operations</h1><p role="alert">{error}</p></section>;
  if (!data) return <section className="operator-dashboard"><h1>City operations</h1><p>Loading city map…</p></section>;

  return (
    <section className="operator-dashboard">
      <div className="operator-heading">
        <div><p className="eyebrow">Live city overview</p><h1>City operations</h1></div>
        <p>{data.restaurants.length} restaurants · {data.couriers.length} on-duty couriers</p>
      </div>
      <div className="operator-map-shell">
        <div ref={mapElement} className="operator-map" role="application" aria-label="Interactive map of restaurants and on-duty couriers" />
        <div className="map-legend"><span><i className="legend-restaurant">R</i> Restaurant</span><span><i className="legend-courier">C</i> Courier</span><span><i className="status-dot status-open" /> Open / idle</span><span><i className="status-dot status-paused" /> Paused / assigned</span><span><i className="status-dot status-closed" /> Closed</span><span><i className="status-dot status-carrying" /> Carrying</span></div>
      </div>
    </section>
  );
}
