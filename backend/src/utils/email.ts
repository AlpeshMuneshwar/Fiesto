import nodemailer from 'nodemailer';

if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('\n⚠️  WARNING: EMAIL_USER or EMAIL_APP_PASSWORD not set. Email functionality will fail.\n');
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
    },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
    const from = process.env.SMTP_FROM || `"Cafe QR Support" <${process.env.EMAIL_USER}>`;
    
    try {
        const info = await transporter.sendMail({
            from,
            to,
            subject,
            html,
        });
        console.log(`[EMAIL] Sent: ${info.messageId} to ${to}`);
        return info;
    } catch (error) {
        console.error(`[EMAIL] Error sending to ${to}:`, error);
        throw error;
    }
};

export const sendOTPEmail = async (to: string, otp: string, purpose: string) => {
    const subject = purpose === 'VERIFY_EMAIL' ? 'Verify Your Email' : 
                   purpose === 'LOGIN' ? 'Login OTP' : 'Reset Your Password';
    
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #333; text-align: center;">Cafe QR Solutions</h2>
            <hr>
            <p>Hello,</p>
            <p>Your OTP for ${purpose.replace('_', ' ').toLowerCase().replace('verify email', 'email verification')} is:</p>
            <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #007bff; border-radius: 5px; margin: 20px 0;">
                ${otp}
            </div>
            <p>This OTP is valid for 15 minutes. If you did not request this, please ignore this email.</p>
            <hr>
            <p style="font-size: 12px; color: #777; text-align: center;">&copy; 2026 Cafe QR Solutions. All rights reserved.</p>
        </div>
    `;

    return sendEmail(to, subject, html);
};
