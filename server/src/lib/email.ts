import Mailgen from "mailgen";
import nodemailer from "nodemailer";
import { env } from "../config/env";
import { AppError } from "./errors";

type EmailUser = {
  email: string;
  resetPasswordToken?: string | undefined;
  resetPasswordExpire?: Date | undefined;
  verificationToken?: string | undefined;
  verificationExpire?: Date | undefined;
  save: () => Promise<unknown>;
};

export async function sendEmail(
  user: EmailUser,
  subject: string,
  content: string,
  url: string,
): Promise<void> {
  try {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });

    const mailgen = new Mailgen({
      theme: "salted",
      product: { name: "My Games", link: env.FRONTEND_URL },
    });

    const emailBody = mailgen.generate({
      body: {
        greeting: "Dear User",
        intro: content,
        action: {
          instructions: `Click the button below to ${subject}:`,
          button: { color: "#DC4D2F", text: subject, link: url },
        },
        outro:
          "Thank you for taking the time to ensure the security of your account.",
      },
    });

    await transporter.sendMail({
      from: `My Games <${env.SMTP_USER}>`,
      to: user.email,
      subject,
      html: emailBody,
    });
  } catch (err: unknown) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.verificationToken = undefined;
    user.verificationExpire = undefined;
    await user.save();
    throw new AppError("EMAIL_FAILED", `Email could not be sent`, 500, err);
  }
}
