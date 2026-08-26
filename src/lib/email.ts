import nodemailer from "nodemailer";
import { env } from "../env";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  const e = env();

  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    auth:
      e.SMTP_USER && e.SMTP_PASS
        ? { user: e.SMTP_USER, pass: e.SMTP_PASS }
        : undefined,
  });

  return transporter;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const e = env();

  try {
    const transport = getTransporter();

    const info = await transport.sendMail({
      from: e.SMTP_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });

    console.log(`[EMAIL] Sent to ${options.to} | messageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("[EMAIL] Failed to send:", error);
    return false;
  }
}
