import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer from 'nodemailer'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  constructor(private readonly configService: ConfigService) {}

  async sendVerificationCode(options: {
    to: string
    subject: string
    code: string
    purposeLabel: string
  }) {
    const from =
      this.configService.get<string>('MAIL_FROM') ??
      this.configService.get<string>('SMTP_USER') ??
      this.configService.get<string>('GMAIL_USER')
    const textBody = [
      `Xác minh ${options.purposeLabel}`,
      `Mã xác minh: ${options.code}`,
      'Mã này có hiệu lực trong 10 phút.',
      'Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.',
    ].join('\n')
    const htmlBody = this.buildVerificationEmailHtml({
      code: options.code,
      purposeLabel: options.purposeLabel,
    })

    const mailConfig = this.getMailConfig()

    if (!mailConfig) {
      this.logger.warn(
        `Mail chưa cấu hình, bỏ qua gửi mail thật cho ${options.to}. Mã xác minh: ${options.code}`,
      )
      return {
        delivered: false,
        debugCode: options.code,
      }
    }

    const transporter = nodemailer.createTransport(mailConfig)

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: textBody,
      html: htmlBody,
    })

    return {
      delivered: true,
    }
  }

  private getMailConfig() {
    const smtpHost = this.configService.get<string>('SMTP_HOST')
    const smtpUser = this.configService.get<string>('SMTP_USER')
    const smtpPass = this.configService.get<string>('SMTP_PASS')

    if (smtpHost && smtpUser && smtpPass) {
      return {
        host: smtpHost,
        port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
        secure: this.configService.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      }
    }

    const gmailUser = this.configService.get<string>('GMAIL_USER')
    const gmailPass = this.normalizePassword(
      this.configService.get<string>('GMAIL_APP_PASSWORD'),
    )

    if (gmailUser && gmailPass) {
      return {
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      }
    }

    return null
  }

  private normalizePassword(password?: string | null) {
    return password?.replace(/\s+/g, '')
  }

  private buildVerificationEmailHtml(options: {
    code: string
    purposeLabel: string
  }) {
    const escapedPurpose = this.escapeHtml(options.purposeLabel)
    const escapedCode = this.escapeHtml(options.code)

    return `
      <div style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
          <div style="background:linear-gradient(135deg,#6d28d9 0%,#2563eb 100%);border-radius:24px 24px 0 0;padding:28px 28px 24px;color:#fff;">
            <div style="display:inline-flex;align-items:center;gap:10px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;opacity:.9;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#fbbf24;"></span>
              Photo Gallery Manager
            </div>
            <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.2;font-weight:800;">Xác minh ${escapedPurpose}</h1>
            <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,.88);">
              Đây là mã xác minh để hoàn tất thao tác của bạn. Vui lòng sử dụng mã bên dưới trong vòng 10 phút.
            </p>
          </div>

          <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 24px 24px;padding:28px;">
            <p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.7;">
              Mã xác minh của bạn:
            </p>

            <div style="margin:0 0 18px;padding:18px 20px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
              <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6366f1;margin-bottom:8px;">
                Verification Code
              </div>
              <div style="font-size:34px;line-height:1;font-weight:800;letter-spacing:.28em;color:#111827;">
                ${escapedCode}
              </div>
            </div>

            <div style="display:grid;gap:10px;">
              <div style="font-size:14px;line-height:1.7;color:#374151;">
                - Mã có hiệu lực trong <strong>10 phút</strong>.
              </div>
              <div style="font-size:14px;line-height:1.7;color:#374151;">
                - Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.
              </div>
              <div style="font-size:14px;line-height:1.7;color:#374151;">
                - Không chia sẻ mã này với bất kỳ ai.
              </div>
            </div>

            <div style="margin-top:22px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.7;color:#6b7280;">
              Email này được gửi tự động từ hệ thống. Vui lòng không trả lời email này.
            </div>
          </div>
        </div>
      </div>
    `
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}
