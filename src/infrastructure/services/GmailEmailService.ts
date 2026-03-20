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

  async sendTempPasswordEmail(to: string, tempPassword: string, name: string): Promise<void> {
    const html = this.buildTempPasswordHtml(name, tempPassword, 'Bienvenido/a a Enlite');
    await this.transporter.sendMail({
      from: `"Enlite" <${this.fromEmail}>`,
      to,
      subject: 'Tu cuenta de administrador en Enlite',
      html,
    });
  }

  async sendPasswordResetEmail(to: string, tempPassword: string, name: string): Promise<void> {
    const html = this.buildTempPasswordHtml(name, tempPassword, 'Restablecimiento de contraseña');
    await this.transporter.sendMail({
      from: `"Enlite" <${this.fromEmail}>`,
      to,
      subject: 'Restablecimiento de contraseña - Enlite',
      html,
    });
  }

  private buildTempPasswordHtml(name: string, tempPassword: string, title: string): string {
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
      <p style="color:#333;font-size:14px;">Tu contraseña temporal es:</p>
      <div style="background:#F3F0FF;border:1px solid #180149;border-radius:8px;padding:16px;text-align:center;margin:24px 0;">
        <code style="font-size:22px;letter-spacing:2px;color:#180149;font-weight:bold;">${tempPassword}</code>
      </div>
      <p style="color:#333;font-size:14px;">Deberás cambiarla en tu primer inicio de sesión.</p>
      <p style="color:#999;font-size:12px;margin-top:32px;">Si no solicitaste esta cuenta, ignorá este correo.</p>
    </div>
  </div>
</body>
</html>`;
  }
}
