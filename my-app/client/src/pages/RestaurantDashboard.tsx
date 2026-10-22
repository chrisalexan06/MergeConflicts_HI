import { useEffect, useState } from 'react';
import { listRestaurantOrders, updateRestaurantOrder, type RestaurantOrderAction } from '../api/orders';
import type { Order } from '../types/order';

interface RestaurantDashboardProps {
	token: string;
}

const actionsByStatus: Partial<Record<Order['orderStatus'], RestaurantOrderAction[]>> = {
	placed: ['accept', 'cancel'],
	accepted: ['preparing', 'cancel'],
	preparing: ['ready', 'cancel'],
};

const actionLabels: Record<RestaurantOrderAction, string> = {
	accept: 'Accept',
	preparing: 'Start preparing',
	ready: 'Mark ready',
	cancel: 'Cancel order',
};

export default function RestaurantDashboard({ token }: RestaurantDashboardProps) {
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(true);
	const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function refreshOrders() {
		setOrders(await listRestaurantOrders(token));
	}

	useEffect(() => {
		let active = true;
		void listRestaurantOrders(token)
			.then((restaurantOrders) => {
				if (active) setOrders(restaurantOrders);
			})
			.catch((requestError: unknown) => {
				if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load orders.');
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => { active = false; };
	}, [token]);

	async function handleAction(orderId: number, action: RestaurantOrderAction) {
		setUpdatingOrderId(orderId);
		setError(null);
		try {
			await updateRestaurantOrder(token, orderId, action);
			await refreshOrders();
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : 'Could not update the order.');
		} finally {
			setUpdatingOrderId(null);
		}
	}

	return (
		<section aria-labelledby="restaurant-orders-heading" className="card">
			<h2 id="restaurant-orders-heading" className="page-title">Restaurant Orders</h2>

			{loading && <p className="muted">Loading Orders...</p>}
			{error && <div role="alert" className="alert alert-error">{error}</div>}
			{!loading && orders.length === 0 && <p className="muted">No orders for this restaurant.</p>}

			{!loading && orders.length > 0 && (
			<div className="table-wrap">
				<table>
				<thead>
					<tr>
					<th scope="col">Order</th>
					<th scope="col">Placed</th>
					<th scope="col">Items</th>
					<th scope="col">Total</th>
					<th scope="col">Status</th>
					<th scope="col">Actions</th>
					</tr>
				</thead>
				<tbody>
					{orders.map((order) => (
					<tr key={order.orderId}>
						<td>#{order.orderId}</td>
						<td>{new Date(order.createdAt).toLocaleString()}</td>
						<td>{order.items.map((item) => `${item.quantity} x ${item.itemName}`).join(', ')}</td>
						<td>${order.total.toFixed(2)}</td>
						<td>
						<span className={`badge badge-${order.orderStatus}`}>{order.orderStatus}</span>
						</td>
						<td>
						<div className="actions">
							{(actionsByStatus[order.orderStatus] ?? []).map((action) => (
							<button
								key={action}
								type="button"
								className={action === 'cancel' ? 'btn btn-secondary' : 'btn'}
								disabled={updatingOrderId === order.orderId}
								onClick={() => void handleAction(order.orderId, action)}
							>
								{actionLabels[action]}
							</button>
							))}
						</div>
						</td>
					</tr>
					))}
				</tbody>
				</table>
			</div>
			)}
		</section>
	);
}
