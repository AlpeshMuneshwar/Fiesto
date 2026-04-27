export const razorpayConfig = {
    keyId: process.env.RAZORPAY_KEY_ID?.trim() || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET?.trim() || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || '',
};

export const isRazorpayConfigured = Boolean(
    razorpayConfig.keyId && razorpayConfig.keySecret && razorpayConfig.webhookSecret
);

export const assertRazorpayConfigured = () => {
    if (!isRazorpayConfigured) {
        const missing = [
            !razorpayConfig.keyId ? 'RAZORPAY_KEY_ID' : null,
            !razorpayConfig.keySecret ? 'RAZORPAY_KEY_SECRET' : null,
            !razorpayConfig.webhookSecret ? 'RAZORPAY_WEBHOOK_SECRET' : null,
        ].filter(Boolean);

        const error = new Error(`Razorpay is not configured. Missing: ${missing.join(', ')}`);
        (error as any).status = 503;
        (error as any).code = 'RAZORPAY_NOT_CONFIGURED';
        throw error;
    }
};
