import nodemailer from 'nodemailer';

if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('\n⚠️  WARNING: EMAIL_USER or EMAIL_APP_PASSWORD not set. Email functionality will fail.\n');
}

let transportVerified = false;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
    },
});

function createEmailServiceError(message: string, details?: unknown) {
    const error: any = new Error(message);
    error.status = 503;
    if (details) {
        error.details = details;
    }
    return error;
}

async function ensureEmailTransportReady() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
        throw createEmailServiceError('Email service is not configured on the server yet. Please try again later or contact support.');
    }

    if (transportVerified) {
        return;
    }

    try {
        await transporter.verify();
        transportVerified = true;
        console.log('[EMAIL] SMTP transport verified successfully');
    } catch (error: any) {
        console.error('[EMAIL] SMTP verification failed:', error);
        throw createEmailServiceError('We could not connect to the email service right now. Please try again in a minute.', error);
    }
}

export const sendEmail = async (to: string, subject: string, html: string) => {
    const from = process.env.SMTP_FROM || `"Cafe QR Support" <${process.env.EMAIL_USER}>`;
    
    try {
        await ensureEmailTransportReady();

        const info = await transporter.sendMail({
            from,
            to,
            subject,
            html,
        });
        console.log(`[EMAIL] Sent: ${info.messageId} to ${to}`);
        return info;
    } catch (error: any) {
        if (error?.status) {
            throw error;
        }

        console.error(`[EMAIL] Error sending to ${to}:`, error);

        if (error?.responseCode === 535 || error?.code === 'EAUTH') {
            console.error('[EMAIL] Authentication failed. Check EMAIL_USER, EMAIL_APP_PASSWORD, and Gmail app password setup.');
        }

        throw createEmailServiceError('We could not send the email right now. Please try again in a minute.', error);
    }
};

export const sendOTPEmail = async (to: string, otp: string, purpose: string) => {
    const subject = purpose === 'VERIFY_EMAIL' ? 'Verify your Fiesto email' :
        purpose === 'LOGIN' ? 'Your Fiesto login code' : 'Your Fiesto password reset code';
    const actionLabel = purpose === 'VERIFY_EMAIL' ? 'email verification' :
        purpose === 'LOGIN' ? 'login' : 'password reset';
    
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; background: #FFFFFF;">
            <div style="padding: 24px; border-bottom: 4px solid #0F172A;">
                <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #C2410C;">FIESTO SECURITY CODE</p>
                <h2 style="margin: 0; color: #0F172A; font-size: 28px;">Your ${actionLabel} code</h2>
            </div>
            <div style="padding: 24px;">
                <p style="margin: 0 0 14px; color: #334155; font-size: 15px; line-height: 24px;">Hello,</p>
                <p style="margin: 0 0 18px; color: #334155; font-size: 15px; line-height: 24px;">Use the 6-digit code below to continue your ${actionLabel} flow on Fiesto.</p>
                <div style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 18px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0F172A; margin: 20px 0;">
                ${otp}
                </div>
                <p style="margin: 0 0 10px; color: #475569; font-size: 14px; line-height: 22px;">This code is valid for 15 minutes.</p>
                <p style="margin: 0 0 18px; color: #475569; font-size: 14px; line-height: 22px;">For security, you can request a new code again after 60 seconds.</p>
                <p style="margin: 0; color: #64748B; font-size: 13px; line-height: 21px;">If you did not request this email, you can safely ignore it.</p>
            </div>
            <div style="padding: 18px 24px; background: #F8FAFC; border-top: 1px solid #E5E7EB;">
                <p style="margin: 0; color: #64748B; font-size: 12px; line-height: 18px;">Fiesto by Cafe QR Solutions</p>
            </div>
        </div>
    `;

    return sendEmail(to, subject, html);
};

export const sendPreorderStatusEmail = async (params: {
    to: string;
    customerName?: string | null;
    cafeName: string;
    cafePhone?: string | null;
    orderType: 'PRE_ORDER' | 'TAKEAWAY';
    approved: boolean;
    paymentWindowMinutes?: number | null;
    approvalExpiresAt?: Date | string | null;
}) => {
    const {
        to,
        customerName,
        cafeName,
        cafePhone,
        orderType,
        approved,
        paymentWindowMinutes,
        approvalExpiresAt,
    } = params;

    const label = orderType === 'TAKEAWAY' ? 'takeaway order' : 'preorder';
    const subject = approved
        ? `Your ${cafeName} ${label} is approved`
        : `Your ${cafeName} ${label} was not approved`;
    const greeting = customerName?.trim() ? `Hi ${customerName.trim()},` : 'Hello,';
    const expiresAtLabel = approvalExpiresAt
        ? new Date(approvalExpiresAt).toLocaleString()
        : null;

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #E5E7EB; background: #FFFFFF;">
            <div style="padding: 24px; border-bottom: 4px solid ${approved ? '#16A34A' : '#DC2626'};">
                <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 1px; color: ${approved ? '#166534' : '#991B1B'};">FIESTO ORDER UPDATE</p>
                <h2 style="margin: 0; color: #0F172A; font-size: 28px;">${approved ? 'Order approved' : 'Order update'}</h2>
            </div>
            <div style="padding: 24px;">
                <p style="margin: 0 0 14px; color: #334155; font-size: 15px; line-height: 24px;">${greeting}</p>
                <p style="margin: 0 0 18px; color: #334155; font-size: 15px; line-height: 24px;">
                    Your ${label} at <strong>${cafeName}</strong> has been ${approved ? 'approved' : 'rejected by the cafe team'}.
                </p>
                ${approved ? `
                    <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 16px; margin-bottom: 18px;">
                        <p style="margin: 0 0 8px; color: #166534; font-size: 14px; line-height: 22px; font-weight: 700;">
                            Please complete the deposit payment within ${paymentWindowMinutes || 60} minutes.
                        </p>
                        ${expiresAtLabel ? `<p style="margin: 0; color: #166534; font-size: 13px; line-height: 21px;">Payment window ends at ${expiresAtLabel}.</p>` : ''}
                    </div>
                ` : `
                    <div style="background: #FEF2F2; border: 1px solid #FECACA; padding: 16px; margin-bottom: 18px;">
                        <p style="margin: 0; color: #991B1B; font-size: 14px; line-height: 22px; font-weight: 700;">
                            You can update the order and place a fresh request if needed.
                        </p>
                    </div>
                `}
                ${cafePhone ? `<p style="margin: 0 0 10px; color: #475569; font-size: 14px; line-height: 22px;">Need help? Call the cafe at <strong>${cafePhone}</strong>.</p>` : ''}
                <p style="margin: 0; color: #64748B; font-size: 13px; line-height: 21px;">Fiesto by Cafe QR Solutions</p>
            </div>
        </div>
    `;

    return sendEmail(to, subject, html);
};
