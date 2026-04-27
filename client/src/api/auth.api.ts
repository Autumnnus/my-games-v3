import { apiFetch } from "./client";
import type {
  AuthLoginData,
  AuthSignupData,
  AuthForgotPasswordData,
  AuthResetPasswordData,
  AuthTokenResponse,
} from "@my-games/shared";

export const authApi = {
  login: (data: AuthLoginData) =>
    apiFetch<AuthTokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  register: (data: AuthSignupData) =>
    apiFetch<AuthTokenResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  forgotPassword: (data: AuthForgotPasswordData) =>
    apiFetch<{ message: string }>("/api/auth/forgotpassword", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  resetPassword: (token: string, data: AuthResetPasswordData) =>
    apiFetch<{ message: string }>(`/api/auth/resetpassword`, {
      method: "PUT",
      body: JSON.stringify({ ...data, resetPasswordToken: token }),
    }),

  editProfile: (data: {
    name?: string;
    password?: string;
    profileImage?: string;
  }) =>
    apiFetch<AuthTokenResponse["user"]>("/api/auth/edit", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  verifyAccount: (token: string) =>
    apiFetch<{ message: string }>("/api/auth/verifyAccount", {
      method: "PUT",
      params: { verificationToken: token },
    }),
};
