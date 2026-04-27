import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { authApi } from "@/api/auth.api";
import { useAuthStore } from "@/store/auth.store";
import { isApiError } from "@/api/client";

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.token, data.user);
      toast.success("Hoş geldin!");
      window.location.href = "/";
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Giriş başarısız";
      toast.error(msg);
    },
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setAuth(data.token, data.user);
      toast.success("Hesap oluşturuldu! E-postanı doğrulamayı unutma.");
      router.navigate({ to: "/" });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Kayıt başarısız";
      toast.error(msg);
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: authApi.forgotPassword,
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "İşlem başarısız";
      toast.error(msg);
    },
  });
}

export function useResetPassword() {
  const router = useRouter();
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, { password }),
    onSuccess: () => {
      toast.success("Şifren güncellendi!");
      router.navigate({ to: "/login" });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Şifre sıfırlama başarısız";
      toast.error(msg);
    },
  });
}

export function useEditProfile() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: authApi.editProfile,
    onSuccess: (user) => {
      updateUser(user);
      toast.success("Profil güncellendi");
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Güncelleme başarısız";
      toast.error(msg);
    },
  });
}
