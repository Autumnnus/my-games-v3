import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { sendEmail } from "../lib/email";
import { AppError } from "../lib/errors";
import User from "../models/User";
import userRepository from "../repository/user.repository";
import { withUserCounters } from "./counter.service";

async function registerService(email: string, name: string, password: string) {
  const existing = await userRepository.getUserByEmail(email);
  if (existing) throw new AppError("CONFLICT", "User already exists", 409);

  return await User.create({ email, name, password, authProviders: ["email"] });
}

async function loginService(email: string, password: string) {
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new AppError("UNAUTHORIZED", "Invalid credentials", 401);
  if (!user.password)
    throw new AppError(
      "UNAUTHORIZED",
      "This account uses Steam login. Please sign in with Steam.",
      401,
    );

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new AppError("UNAUTHORIZED", "Invalid credentials", 401);

  return user;
}

async function forgotPasswordService(email: string) {
  const user = await userRepository.getUserByEmail(email);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  if (!user.email)
    throw new AppError(
      "BAD_REQUEST",
      "This account does not have an email address",
      400,
    );

  const token = user.getResetPasswordTokenFromUser();
  await user.save();

  const url = `${env.FRONTEND_URL}/auth/resetPassword?resetPasswordToken=${token}`;
  await sendEmail(
    user as typeof user & { email: string },
    "Reset Password",
    "We received a request to reset the password for your account.",
    url,
  );
  return { message: "Reset password email sent" };
}

async function resetPasswordService(
  resetPasswordToken: string,
  password: string,
) {
  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });
  if (!user) throw new AppError("BAD_REQUEST", "Invalid or expired token", 400);

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  return { message: "Password reset successful" };
}

async function editUserService(
  editData: { name?: string; password?: string; profileImage?: string },
  userId: string,
) {
  const user = await User.findById(userId);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);

  if (editData.name && editData.name === user.name)
    throw new AppError("BAD_REQUEST", "No changes detected for name", 400);
  if (
    editData.password &&
    user.password &&
    (await bcrypt.compare(editData.password, user.password))
  )
    throw new AppError("BAD_REQUEST", "No changes detected for password", 400);
  if (editData.profileImage && editData.profileImage === user.profileImage)
    throw new AppError(
      "BAD_REQUEST",
      "No changes detected for profile image",
      400,
    );

  const updated = await User.findByIdAndUpdate(userId, editData, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new AppError("NOT_FOUND", "User not found", 404);
  return await withUserCounters(updated);
}

async function validateEmailService(email: string) {
  const user = await User.findOne({ email });
  if (!user) throw new AppError("NOT_FOUND", "No user with that email", 404);
  if (!user.email)
    throw new AppError(
      "BAD_REQUEST",
      "This account does not have an email address",
      400,
    );
  if (user.isVerified)
    throw new AppError("CONFLICT", "Account is already verified", 409);

  const token = user.getVerificationTokenFromUser();
  await user.save();

  const url = `${env.FRONTEND_URL}/api/auth/verifyAccount?verificationToken=${token}`;
  await sendEmail(
    user as typeof user & { email: string },
    "Verify Account",
    "We received a request to verify the email for your account.",
    url,
  );
  return { message: "Verification email sent" };
}

async function verifyAccountService(verificationToken: string) {
  const user = await User.findOne({
    verificationToken,
    verificationExpire: { $gt: Date.now() },
  });
  if (!user) throw new AppError("BAD_REQUEST", "Invalid or expired token", 400);

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationExpire = undefined;
  await user.save();
  return { message: "Account verified successfully" };
}

export default {
  registerService,
  loginService,
  forgotPasswordService,
  resetPasswordService,
  editUserService,
  validateEmailService,
  verifyAccountService,
};
