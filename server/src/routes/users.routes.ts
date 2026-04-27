import { Hono } from "hono";
import { ok } from "../lib/response";
import userService from "../services/user.service";
import {
  authMiddleware,
  adminMiddleware,
} from "../middlewares/auth.middleware";
import type { AppVariables } from "../types/context";

const users = new Hono<{ Variables: AppVariables }>();

users.get("/", async (c) => {
  const all = await userService.getAllUsersService();
  return c.json(ok(all));
});

users.get("/:id", async (c) => {
  const user = await userService.getSingleUserService(c.req.param("id"));
  return c.json(ok(user));
});

users.delete("/deleteUser/:id", authMiddleware, adminMiddleware, async (c) => {
  const adminId = c.get("userId");
  const result = await userService.deleteUserService(
    adminId,
    c.req.param("id"),
  );
  return c.json(ok(result));
});

export default users;
