import nodemailer from 'nodemailer';

export class GmailEmailService {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor() {
    this.fromEmail = process.env.SMTP_EMAIL || 'noreply@enlite.com';
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: this.fromEmail,
        pass: process.env.SMTP_APP_PASSWORD,
      },
    });
  }

  async sendPasswordResetEmail(to: string, name: string, resetLink: string): Promise<void> {
    const html = this.buildPasswordLinkHtml(name, resetLink, 'Restablecimiento de contraseña', 'Restablecer contraseña');
    await this.transporter.sendMail({
      from: `"Enlite" <${this.fromEmail}>`,
      to,
      subject: 'Restablecimiento de contraseña - Enlite',
      html,
    });
  }

  async sendInvitationEmail(to: string, name: string, inviteLink: string): Promise<void> {
    const html = this.buildPasswordLinkHtml(name, inviteLink, 'Bienvenido/a a Enlite', 'Definir contraseña');
    await this.transporter.sendMail({
      from: `"Enlite" <${this.fromEmail}>`,
      to,
      subject: 'Fuiste invitado a Enlite — Definí tu contraseña',
      html,
    });
  }

  /**
   * Builds an email body with a CTA button pointing to a Firebase password link.
   * Used for both invitation emails and password reset emails.
   */
  private buildPasswordLinkHtml(name: string, link: string, title: string, cta: string): string {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Poppins',Arial,sans-serif;background:#FFF9FC;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(24,1,73,0.08);">
    <div style="background:#180149;padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;font-family:'Lexend',Arial,sans-serif;">${title}</h1>
    </div>
    <div style="padding:32px 24px;">
      <p style="color:#333;font-size:16px;">Hola <strong>${name}</strong>,</p>
      <p style="color:#333;font-size:14px;">Hacé clic en el botón para ${cta.toLowerCase()} y acceder a la plataforma:</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${link}"
           style="display:inline-block;background:#180149;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;font-family:'Lexend',Arial,sans-serif;">
          ${cta}
        </a>
      </div>
      <p style="color:#666;font-size:13px;">Si el botón no funciona, copiá este enlace en tu navegador:</p>
      <p style="color:#180149;font-size:12px;word-break:break-all;">${link}</p>
      <p style="color:#999;font-size:12px;margin-top:32px;">Si no esperabas este correo, podés ignorarlo.</p>
    </div>
  </div>
</body>
</html>`;
  }

}
