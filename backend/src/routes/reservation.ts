import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { validate } from '../validators';
import { reservationSchema } from '../validators';
import { authenticate, AuthRequest } from '../middleware/auth';
import { io } from '../socket';
import { recordActivity } from '../utils/audit';
import { notifyStaffByRole } from '../push';
import {
    DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES,
    platformReservationDefaults,
} from '../config/reservation-defaults';
import { BLOCKING_BOOKING_ORDER_STATUSES, isStillBlockingBooking } from '../utils/booking-blocker';

const router = Router();
const PAYMENT_WINDOW_TEXT = `${DEFAULT_PREORDER_PAYMENT_WINDOW_MINUTES} minutes`;

// Used for customers to pre-book a table and optional pre-order food
router.post('/book', authenticate, validate(reservationSchema), async (req: AuthRequest, res: Response) => {
    try {
        const { cafeId, tableId, partySize, scheduledAt, items, deviceIdentifier } = req.body;
        const customerId = req.user!.id; // Needs login

        const cafe = await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true }
        });

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        if (!platformReservationDefaults.reservationsEnabled) {
            res.status(403).json({ error: 'This cafe does not accept reservations.' });
            return;
        }

        const candidateOrders = await prisma.order.findMany({
            where: {
                cafeId,
                orderType: { in: ['PRE_ORDER', 'TAKEAWAY'] },
                status: { in: BLOCKING_BOOKING_ORDER_STATUSES },
                session: { customerId },
            },
            include: {
                session: {
                    select: {
                        id: true,
                        isActive: true,
                        isPrebooked: true,
                        deviceIdentifier: true,
                        joinCode: true,
                        scheduledAt: true,
                        slotDurationMinutes: true,
                        createdAt: true,
                        updatedAt: true,
                        table: { select: { number: true } },
                    },
                },
                payment: {
                    select: { status: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 12,
        }) as any[];

        const existingBlocking = candidateOrders.find((order) => isStillBlockingBooking(order)) || null;

        if (existingBlocking) {
            res.status(409).json({
                error: 'You already have a pending or active booking for this cafe. Complete or cancel it before creating another booking.',
                code: 'EXISTING_ACTIVE_BOOKING',
                existingBooking: {
                    orderId: existingBlocking.id,
                    orderType: existingBlocking.orderType,
                    status: existingBlocking.status,
                    paymentStatus: existingBlocking.payment?.status || null,
                    scheduledAt: existingBlocking.session?.scheduledAt || existingBlocking.session?.createdAt || null,
                    joinCode: existingBlocking.session?.joinCode || null,
                    tableNumber: existingBlocking.session?.table?.number || null,
                },
            });
            return;
        }

        const table = await prisma.table.findFirst({
            where: { id: tableId, cafeId, isActive: true }
        });

        if (!table) {
            res.status(404).json({ error: 'Table not found or inactive.' });
            return;
        }

        if (partySize > table.capacity) {
            res.status(400).json({ error: `Table capacity is ${table.capacity}. Cannot seat a party of ${partySize}.` });
            return;
        }

        const reservationTime = scheduledAt ? new Date(scheduledAt) : new Date();

        // Check if table is currently vacant
        const activeSession = await prisma.session.findFirst({
            where: { tableId, isActive: true }
        });

        const queueAhead = await prisma.session.count({
            where: {
                tableId,
                isPrebooked: true,
                isActive: false,
                scheduledAt: {
                    gte: new Date()
                }
            }
        });

        const shouldQueue = Boolean(activeSession);

        // Proceed to create booking
        // 1. Create session immediately if the table is free, otherwise hold it in queue.
        const session = await prisma.session.create({
            data: {
                cafeId,
                tableId,
                customerId,
                isActive: !shouldQueue,
                isPrebooked: true,
                deviceIdentifier,
                scheduledAt: reservationTime,
                joinCode: Math.floor(1000 + Math.random() * 9000).toString(), // 4-digit token
                createdBy: customerId,
                updatedBy: customerId
            }
        });

        let preOrderAmount = 0;
        let platformFee = 0;
        let advancePaid = 0;
        let order = null;

        // 2. Handle optional Pre-order
        if (items && items.length > 0) {
            const subtotal = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
            platformFee = platformReservationDefaults.platformFeeAmount;
            
            // Calculate taxes just like a normal order
            const taxRate = cafe.settings?.taxEnabled ? (cafe.settings?.taxRate || 0) : 0;
            const originalTaxAmount = cafe.settings?.taxInclusive ? 0 : (subtotal * taxRate) / 100;
            const grandTotal = subtotal + originalTaxAmount;

            // Calculate advance to be paid NOW (e.g. 30% of total)
            const advanceRate = platformReservationDefaults.preOrderAdvanceRate;
            advancePaid = (grandTotal * advanceRate) / 100;
            preOrderAmount = advancePaid + platformFee;

            // Important: We actually need a way to charge this money. 
            // In this scope, we simulate payment success for the advance
            order = await prisma.order.create({
                data: {
                    cafeId,
                    sessionId: session.id,
                    orderType: 'PRE_ORDER',
                    status: 'PENDING_APPROVAL',
                    isPreorder: true,
                    items: JSON.stringify(items),
                    subtotal,
                    taxAmount: originalTaxAmount,
                    platformFee,
                    advancePaid,
                    totalAmount: grandTotal, // full total to be tracked
                    isLocationVerified: true, // assuming if they pre-book it's remote intent
                    createdBy: customerId,
                    updatedBy: customerId
                }
            });

            await prisma.payment.create({
                data: {
                    orderId: order.id,
                    amount: preOrderAmount,
                    provider: 'RAZORPAY',
                    status: 'PENDING',
                    paymentStage: 'PENDING',
                    createdBy: customerId,
                    updatedBy: customerId
                } as any
            });

            io.to(`MANAGER_${cafeId}`).emit('new_order', {
                ...order,
                session: { ...session, table }
            });
            io.to(`ADMIN_${cafeId}`).emit('new_order', {
                ...order,
                session: { ...session, table }
            });
            notifyStaffByRole(cafeId, 'MANAGER', 'Preorder Approval Needed', `Reservation pre-order for Table ${table.number} needs approval.`);
            notifyStaffByRole(cafeId, 'ADMIN', 'Preorder Approval Needed', `Reservation pre-order for Table ${table.number} needs approval.`);
        }

        // Audit Log for Reservation
        recordActivity({
            cafeId,
            actionType: shouldQueue ? 'QUEUE_JOIN' : 'SESSION_START',
            message: `${shouldQueue ? 'Queued' : 'New'} Reservation for Table ${table.number} (Party: ${partySize})`,
            metadata: { sessionId: session.id, partySize, orderId: order?.id, queueAhead }
        });

        res.json({
            message: shouldQueue
                ? 'Reservation queued and preorder sent for approval.'
                : 'Reservation confirmed. Preorder is pending owner/manager approval.',
            session,
            reservationStatus: shouldQueue ? 'QUEUED' : 'CONFIRMED',
            queuePosition: shouldQueue ? queueAhead + 1 : 0,
            approvalRequired: Boolean(order),
            approvalStatus: order ? 'PENDING_APPROVAL' : null,
            paymentNotice: order ? `Please pay the deposit within ${PAYMENT_WINDOW_TEXT} after owner/manager approval.` : null,
            preOrder: order ? {
               id: order.id,
               advancePaid,
               platformFee,
               totalPaidNow: preOrderAmount,
               subtotal: order.subtotal
            } : null
        });

    } catch (error: any) {
        console.error('Reservation Error:', error);
        res.status(500).json({ error: 'Failed to process reservation.' });
    }
});

export default router;
