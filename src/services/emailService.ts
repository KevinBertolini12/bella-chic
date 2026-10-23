import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY não configurado. Email não enviado.");
    return;
  }
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Bella & Chic <naoresponda@bellachic.com.br>",
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("Erro ao enviar email:", error);
  }
}