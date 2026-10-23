//test to see db was working
import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        NOW() AS server_time
    `);

    res.json({
      connected: true,
      database: result.rows[0].database_name,
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    next(error);
  }
});

export default router;