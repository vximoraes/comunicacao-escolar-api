import nodemailer from 'nodemailer';
import { CustomError, HttpStatusCodes } from '../utils/helpers/index.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.warn(
        'Variáveis de ambiente EMAIL_USER e EMAIL_APP_PASSWORD não configuradas. Serviço de e-mail não estará disponível.',
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_APP_PASSWORD,
        },
      });
      console.log('✓ Serviço de e-mail inicializado com sucesso');
    } catch (error) {
      console.error('Erro ao inicializar serviço de e-mail:', error);
    }
  }

  async enviarEmail(to, subject, text, html = null) {
    if (!this.transporter) {
      throw new CustomError({
        statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR.code,
        errorType: 'emailServiceUnavailable',
        field: 'Email',
        details: [],
        customMessage: 'Serviço de e-mail não está configurado.',
      });
    }

    const mailOptions = {
      from: `"${process.env.COMPANY_NAME || 'Comunicação Escolar'}" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      text: text,
      html: html || text,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('E-mail enviado com sucesso:', info.response);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      throw new CustomError({
        statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR.code,
        errorType: 'emailSendError',
        field: 'Email',
        details: [],
        customMessage: 'Erro ao enviar e-mail. Tente novamente mais tarde.',
      });
    }
  }

  async enviarEmailConvite(nome, email, token) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const activationUrl = `${frontendUrl}/ativar-conta?token=${token}`;

    const subject = 'Ative sua conta';

    const text = `
Olá, ${nome}!

Sua conta foi criada. Clique no link para definir sua senha:
${activationUrl}

Link válido por 5 minutos.

Equipe Comunicação Escolar
        `.trim();

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #306FCC; font-size: 24px; margin-bottom: 20px; margin-top: 0;">Bem-vindo ao Comunicação Escolar!</h1>
            <p style="margin: 0 0 15px 0; font-size: 18px;">Olá, <strong>${nome}</strong>!</p>
            <p style="margin: 0 0 20px 0; font-size: 18px;">Sua conta foi criada no sistema. Para começar, clique no botão abaixo e defina sua senha.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${activationUrl}" style="display: inline-block; padding: 14px 32px; background-color: #306FCC; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Ativar minha conta</a>
            </div>
            <div style="margin-top: 25px; border-radius: 4px;">
                <p style="margin: 0; font-size: 18px;"><strong>Importante:</strong> Este link expira em 15 minutos por segurança.</p>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                <p style="margin: 0 0 8px 0; font-size: 16px;">Não solicitou este cadastro? Ignore este e-mail.</p>
                <p style="margin: 0; font-size: 16px; color: #999;">Equipe Comunicação Escolar</p>
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();

    return await this.enviarEmail(email, subject, text, html);
  }

  async enviarEmailRecuperacaoSenha(nome, email, token) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/redefinir-senha?token=${token}`;

    const subject = 'Recuperação de senha';

    const text = `
Olá, ${nome}!

Você solicitou a recuperação de senha da sua conta no Comunicação Escolar.

Clique no link abaixo para redefinir sua senha:
${resetUrl}

Este link é válido por 15 minutos.

Se você não solicitou esta recuperação, ignore este e-mail.

Equipe Comunicação Escolar
        `.trim();

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #306FCC; font-size: 24px; margin-bottom: 20px; margin-top: 0;">Recuperação de Senha</h1>
            <p style="margin: 0 0 15px 0; font-size: 18px;">Olá, <strong>${nome}</strong>!</p>
            <p style="margin: 0 0 20px 0; font-size: 18px;">Você solicitou a recuperação de senha da sua conta. Para redefinir, clique no botão abaixo.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #306FCC; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Redefinir minha senha</a>
            </div>
            <div style="margin-top: 25px; border-radius: 4px;">
                <p style="margin: 0; font-size: 18px;"><strong>Importante:</strong> Este link expira em 15 minutos por segurança.</p>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                <p style="margin: 0 0 8px 0; font-size: 16px;">Não solicitou esta recuperação? Ignore este e-mail.</p>
                <p style="margin: 0; font-size: 16px; color: #999;">Equipe Comunicação Escolar</p>
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();

    return await this.enviarEmail(email, subject, text, html);
  }
}

export default new EmailService();
