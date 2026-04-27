import { prisma } from '../prisma';

export type ActivityAction = 
  | 'SESSION_START' 
  | 'QUEUE_JOIN'
  | 'SESSION_CLOSE' 
  | 'ORDER_PLACED' 
  | 'ORDER_APPROVED' 
  | 'ORDER_REJECTED' 
  | 'ORDER_PREPARING' 
  | 'ORDER_READY' 
  | 'ORDER_DELIVERED' 
  | 'CALL_ACKNOWLEDGED' 
  | 'TABLE_CLEANED' 
  | 'SETTINGS_UPDATE' 
  | 'MENU_UPDATE';

interface AuditOptions {
  cafeId: string;
  staffId?: string;
  role?: string;
  actionType: ActivityAction;
  message: string;
  metadata?: any;
}

/**
 * Centrally log any significant staff or system activity.
 */
export async function recordActivity(options: AuditOptions) {
  try {
    await prisma.activityLog.create({
      data: {
        cafeId: options.cafeId,
        staffId: options.staffId,
        role: options.role,
        actionType: options.actionType,
        message: options.message,
        metadata: options.metadata ? JSON.stringify(options.metadata) : null,
      }
    });
  } catch (error) {
    console.error('[Audit Log Error]', error);
    // Don't throw - audit logging should not break the main transaction flow
  }
}
