import { useEffect, useState, type FormEvent } from 'react';
import { listRestaurantOrders, updateRestaurantOrder, type RestaurantOrderAction } from '../api/orders';
import {
	getMyRestaurant,
	pauseMyRestaurant,
	updateMyMenuItemDetails,
	updateMyMenuItemStatus,
	type StaffRestaurant,
} from '../api/restaurants';
import type { Order } from '../types/order';

interface RestaurantDashboardProps {
	token: string;
}

interface MenuItemEdit {
	itemId: number;
	itemName: string;
	price: string;
}

const actionsByStatus: Partial<Record<Order['orderStatus'], RestaurantOrderAction[]>> = {
	placed: ['accept', 'cancel'],
	accepted: ['preparing', 'cancel'],
	preparing: ['ready', 'cancel'],
};

const actionLabels: Record<RestaurantOrderAction, string> = {
	accept: 'Accept',
	preparing: 'Start preparing',
	ready: 'Mark as ready',
	cancel: 'Cancel order',
};

export default function RestaurantDashboard({ token }: RestaurantDashboardProps) {
	const [orders, setOrders] = useState<Order[]>([]);
	const [restaurant, setRestaurant] = useState<StaffRestaurant | null>(null);
	const [loading, setLoading] = useState(true);
	const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
	const [updatingRestaurantStatus, setUpdatingRestaurantStatus] = useState(false);
	const [updatingMenuItemId, setUpdatingMenuItemId] = useState<number | null>(null);
	const [editingMenuItem, setEditingMenuItem] = useState<MenuItemEdit | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function refreshOrders() {
		setOrders(await listRestaurantOrders(token));
	}

	useEffect(() => {
		let active = true;
		void Promise.all([listRestaurantOrders(token), getMyRestaurant(token)])
			.then(([restaurantOrders, staffRestaurant]) => {
				if (active) {
					setOrders(restaurantOrders);
					setRestaurant(staffRestaurant);
				}
			})
			.catch((requestError: unknown) => {
				if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load orders.');
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => { active = false; };
	}, [token]);

	async function refreshDashboard() {
		const [restaurantOrders, staffRestaurant] = await Promise.all([
			listRestaurantOrders(token),
			getMyRestaurant(token),
		]);
		setOrders(restaurantOrders);
		setRestaurant(staffRestaurant);
	}

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

	async function handlePauseRestaurant() {
		if (!restaurant || restaurant.status !== 'open') return;
		setUpdatingRestaurantStatus(true);
		setError(null);
		try {
			await pauseMyRestaurant(token);
			await refreshDashboard();
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : 'Could not update restaurant status.');
		} finally {
			setUpdatingRestaurantStatus(false);
		}
	}

	async function handleMenuItemStatusChange(itemId: number, status: 'available' | 'sold_out') {
		setUpdatingMenuItemId(itemId);
		setError(null);
		try {
			await updateMyMenuItemStatus(token, itemId, status);
			await refreshDashboard();
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : 'Could not update item availability.');
		} finally {
			setUpdatingMenuItemId(null);
		}
	}

	async function handleSaveMenuItemDetails(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!editingMenuItem) return;

		setUpdatingMenuItemId(editingMenuItem.itemId);
		setError(null);
		try {
			await updateMyMenuItemDetails(token, editingMenuItem.itemId, {
				name: editingMenuItem.itemName.trim(),
				price: Number(editingMenuItem.price),
			});
			setEditingMenuItem(null);
			await refreshDashboard();
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : 'Could not update menu item details.');
		} finally {
			setUpdatingMenuItemId(null);
		}
	}

	return (
		<section aria-labelledby="restaurant-orders-heading" className="card">
			<h2 id="restaurant-orders-heading" className="page-title">Restaurant Dashboard</h2>
			{restaurant && (
				<div className="actions">
					<p>{restaurant.restaurantName} · Status: {restaurant.status}</p>
					{restaurant.status === 'open' && (
						<button
							type="button"
							className="btn btn-secondary"
							disabled={updatingRestaurantStatus}
							onClick={() => void handlePauseRestaurant()}
						>
							{updatingRestaurantStatus ? 'Updating…' : 'Pause Restaurant'}
						</button>
					)}
				</div>
			)}
			<h3>Menu Availability</h3>
			{restaurant && restaurant.menuItems.length === 0 && (
				<p className="muted">No menu items for this restaurant.</p>
			)}
			{restaurant && restaurant.menuItems.length > 0 && (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th scope="col">Item</th>
								<th scope="col">Price</th>
								<th scope="col">Availability</th>
								<th scope="col" className="col-actions">Action</th>
							</tr>
						</thead>
						<tbody>
							{restaurant.menuItems.map((item) => (
								<tr key={item.itemId}>
									{editingMenuItem?.itemId === item.itemId ? (
										<>
											<td>
												<input
													type="text"
													aria-label={`Name for ${item.itemName}`}
													required
													value={editingMenuItem.itemName}
													onChange={(event) => setEditingMenuItem({
														...editingMenuItem,
														itemName: event.target.value,
													})}
												/>
											</td>
											<td>
												<input
													type="number"
													aria-label={`Price for ${item.itemName}`}
													min="0.01"
													step="0.01"
													required
													value={editingMenuItem.price}
													onChange={(event) => setEditingMenuItem({
														...editingMenuItem,
														price: event.target.value,
													})}
												/>
											</td>
										</>
									) : (
										<>
											<td>{item.itemName}</td>
											<td>${item.price.toFixed(2)}</td>
										</>
									)}
									<td>{item.status}</td>
									<td className="menu-item-actions-cell">
										<div className="menu-item-actions">
											{editingMenuItem?.itemId === item.itemId ? (
												<form className="menu-item-actions" onSubmit={(event) => void handleSaveMenuItemDetails(event)}>
													<button
														type="submit"
														className="btn"
														disabled={updatingMenuItemId === item.itemId}
													>
														{updatingMenuItemId === item.itemId ? 'Saving…' : 'Save'}
													</button>
													<button
														type="button"
														className="btn btn-secondary"
														disabled={updatingMenuItemId === item.itemId}
														onClick={() => setEditingMenuItem(null)}
													>
														Cancel
													</button>
												</form>
											) : (
												<span className="menu-item-edit-wrapper">
													<button
														type="button"
														className="btn btn-secondary menu-item-edit-btn"
														aria-label={`Edit ${item.itemName}`}
														title="Edit"
														disabled={updatingMenuItemId === item.itemId}
														onClick={() => setEditingMenuItem({
															itemId: item.itemId,
															itemName: item.itemName,
															price: String(item.price),
														})}
													>
														<svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
															<path d="m14.5 6.5 3 3M4 20l4.8-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.8 16 4 20Z" />
														</svg>
													</button>
													<span className="menu-item-edit-tooltip" role="tooltip">Edit</span>
												</span>
											)}
											<button
												type="button"
												className="btn menu-item-availability-btn"
												disabled={updatingMenuItemId === item.itemId || editingMenuItem?.itemId === item.itemId}
												onClick={() => void handleMenuItemStatusChange(
													item.itemId,
													item.status === 'available' ? 'sold_out' : 'available'
												)}
											>
												{updatingMenuItemId === item.itemId
													? 'Updating…'
													: item.status === 'available' ? 'Mark sold out' : 'Mark available'}
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<h3>Restaurant Orders</h3>

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
					<th scope="col" className="col-actions">Actions</th>
					</tr>
				</thead>
				<tbody>
					{orders.map((order) => (
					<tr key={order.orderId}>
						<td>#{order.orderId}</td>
						<td>{new Date(order.createdAt).toLocaleString()}</td>
						<td>
							{order.items.map((item, i) => (
								<div key={`${item.itemName}-${i}`}>
								{item.quantity} x {item.itemName}
								</div>
							))}
						</td>
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
								{action === 'cancel' && order.orderStatus === 'placed'
									? 'Reject'
									: actionLabels[action]}
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
