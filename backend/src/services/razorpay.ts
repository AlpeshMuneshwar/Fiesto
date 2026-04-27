import crypto from 'crypto';
import Razorpay from 'razorpay';
import { razorpayConfig, assertRazorpayConfigured } from '../config/payments';

let razorpayClient: Razorpay | null = null;

export const getRazorpayClient = () => {
    assertRazorpayConfigured();

    if (!razorpayClient) {
        razorpayClient = new Razorpay({
            key_id: razorpayConfig.keyId,
            key_secret: razorpayConfig.keySecret,
        });
    }

    return razorpayClient;
};

export const verifyRazorpayPaymentSignature = ({
    orderId,
    paymentId,
    signature,
}: {
    orderId: string;
    paymentId: string;
    signature: string;
}) => {
    assertRazorpayConfigured();

    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
        .createHmac('sha256', razorpayConfig.keySecret)
        .update(payload)
        .digest('hex');

    return expectedSignature === signature;
};

export const verifyRazorpayWebhookSignature = (rawBody: Buffer, signature: string) => {
    assertRazorpayConfigured();

    const expectedSignature = crypto
        .createHmac('sha256', razorpayConfig.webhookSecret)
        .update(rawBody)
        .digest('hex');

    return expectedSignature === signature;
};
