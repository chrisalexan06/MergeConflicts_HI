import { pool } from '../../db.js';

export interface CustomerOrderRating {
  orderId: number;
  restaurantRating: number;
  courierRating: number;
}

export interface RestaurantRatingSummary {
  restaurantId: number;
  averageRating: number;
  ratingCount: number;
}

export interface CourierRatingSummary {
  averageRating: number | null;
  ratingCount: number;
}

export type SubmitRatingResult =
  | { kind: 'created'; rating: CustomerOrderRating }
  | { kind: 'not_found' }
  | { kind: 'not_delivered' }
  | { kind: 'courier_unavailable' }
  | { kind: 'already_rated' };

export class RatingService {
  async submitRating(
    customerId: string,
    orderId: number,
    restaurantRating: number,
    courierRating: number,
  ): Promise<SubmitRatingResult> {
    try {
      const inserted = await pool.query<{
        order_id: string;
        restaurant_rating: number;
        courier_rating: number;
      }>(
        `INSERT INTO public."OrderRatings" (
           order_id, customer_id, restaurant_id, courier_id,
           restaurant_rating, courier_rating
         )
         SELECT o.order_id, o."customerID", o."restaurantID", d."assignedCourier", $3, $4
         FROM public.orders o
         JOIN public.ready_order_details d ON d.order_id = o.order_id
         WHERE o.order_id = $1
           AND o."customerID" = $2
           AND o."orderStatus" = 'delivered'
           AND d."assignedCourier" IS NOT NULL
         RETURNING order_id, restaurant_rating, courier_rating;`,
        [orderId, customerId, restaurantRating, courierRating],
      );

      const row = inserted.rows[0];
      if (row) {
        return {
          kind: 'created',
          rating: {
            orderId: Number(row.order_id),
            restaurantRating: Number(row.restaurant_rating),
            courierRating: Number(row.courier_rating),
          },
        };
      }

      const order = await pool.query<{ orderStatus: string; hasCourier: boolean }>(
        `SELECT o."orderStatus",
                EXISTS (
                  SELECT 1 FROM public.ready_order_details d
                  WHERE d.order_id = o.order_id AND d."assignedCourier" IS NOT NULL
                ) AS "hasCourier"
         FROM public.orders o
         WHERE o.order_id = $1 AND o."customerID" = $2;`,
        [orderId, customerId],
      );
      if (!order.rows[0]) return { kind: 'not_found' };
      if (order.rows[0].orderStatus !== 'delivered') return { kind: 'not_delivered' };
      if (!order.rows[0].hasCourier) return { kind: 'courier_unavailable' };
      return { kind: 'not_delivered' };
    } catch (error) {
      if (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === '23505'
      ) {
        return { kind: 'already_rated' };
      }
      throw error;
    }
  }

  async listCustomerRatings(customerId: string): Promise<CustomerOrderRating[]> {
    const result = await pool.query<{
      order_id: string;
      restaurant_rating: number;
      courier_rating: number;
    }>(
      `SELECT order_id, restaurant_rating, courier_rating
       FROM public."OrderRatings"
       WHERE customer_id = $1
       ORDER BY created_at DESC, order_id DESC;`,
      [customerId],
    );
    return result.rows.map((row) => ({
      orderId: Number(row.order_id),
      restaurantRating: Number(row.restaurant_rating),
      courierRating: Number(row.courier_rating),
    }));
  }

  async listRestaurantSummaries(): Promise<RestaurantRatingSummary[]> {
    const result = await pool.query<{
      restaurantId: string | number;
      averageRating: string | number;
      ratingCount: string | number;
    }>(
      `SELECT restaurant_id AS "restaurantId",
              ROUND(AVG(restaurant_rating)::numeric, 1) AS "averageRating",
              COUNT(*) AS "ratingCount"
       FROM public."OrderRatings"
       GROUP BY restaurant_id
       ORDER BY restaurant_id;`,
    );
    return result.rows.map((row) => ({
      restaurantId: Number(row.restaurantId),
      averageRating: Number(row.averageRating),
      ratingCount: Number(row.ratingCount),
    }));
  }

  async getRestaurantSummary(restaurantId: number): Promise<{
    averageRating: number | null;
    ratingCount: number;
  }> {
    const result = await pool.query<{ averageRating: string | null; ratingCount: string }>(
      `SELECT ROUND(AVG(restaurant_rating)::numeric, 1) AS "averageRating",
              COUNT(*) AS "ratingCount"
       FROM public."OrderRatings"
       WHERE restaurant_id = $1;`,
      [restaurantId],
    );
    const row = result.rows[0];
    return {
      averageRating: row?.averageRating === null || row?.averageRating === undefined
        ? null
        : Number(row.averageRating),
      ratingCount: Number(row?.ratingCount ?? 0),
    };
  }

  async getCourierSummary(courierId: string): Promise<CourierRatingSummary> {
    const result = await pool.query<{ averageRating: string | null; ratingCount: string }>(
      `SELECT ROUND(AVG(courier_rating)::numeric, 1) AS "averageRating", COUNT(*) AS "ratingCount"
       FROM public."OrderRatings"
       WHERE courier_id = $1;`,
      [courierId],
    );
    const row = result.rows[0];
    return {
      averageRating: row?.averageRating === null || row?.averageRating === undefined
        ? null
        : Number(row.averageRating),
      ratingCount: Number(row?.ratingCount ?? 0),
    };
  }
}
