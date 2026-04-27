import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  password: z.string().min(6).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(6).max(100),
});

export const validateEmailSchema = z.object({
  email: z.string().email(),
});

export const editUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  password: z.string().min(6).max(100).optional(),
  profileImage: z.string().url().optional(),
});
