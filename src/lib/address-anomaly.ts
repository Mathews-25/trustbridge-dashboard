import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

export interface AnomalyStatus {
  isAnomaly: boolean;
  count: number;
  threshold: number;
  windowMinutes: number;
}

/**
 * Evaluates whether a sudden mass address rotation anomaly has occurred
 * in the configured sliding time window.
 */
export async function checkAddressChangeAnomaly(
  windowMinutesOverride?: number,
  thresholdOverride?: number
): Promise<AnomalyStatus> {
  const windowMinutes =
    windowMinutesOverride ??
    Number(process.env.MASS_ADDRESS_CHANGE_WINDOW_MINUTES ?? 60);

  const threshold =
    thresholdOverride ??
    Number(process.env.MASS_ADDRESS_CHANGE_THRESHOLD ?? 5);

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  try {
    const count = await prisma.addressHistoryRecord.count({
      where: {
        changeType: "address_change",
        recordedAt: { gte: windowStart },
      },
    });

    const isAnomaly = count >= threshold;
    return {
      isAnomaly,
      count,
      threshold,
      windowMinutes,
    };
  } catch (error) {
    console.error("Failed to check address change anomaly:", error);
    return {
      isAnomaly: false,
      count: 0,
      threshold,
      windowMinutes,
    };
  }
}

/**
 * Triggers anomaly evaluation when an address change occurs.
 * If the threshold is breached, an audit log event is recorded.
 * Fail open: non-blocking, returns anomaly status.
 */
export async function evaluateAndAuditAddressChangeAnomaly(
  actorId: string,
  actorLogin: string | null
): Promise<AnomalyStatus> {
  const status = await checkAddressChangeAnomaly();

  if (status.isAnomaly) {
    try {
      await recordAuditLog({
        action: "anomaly.mass_address_changes",
        actorId,
        actorLogin,
        metadata: {
          count: status.count,
          threshold: status.threshold,
          windowMinutes: status.windowMinutes,
          message: `High volume of address changes detected (${status.count} changes in ${status.windowMinutes} minutes).`,
        },
      });
    } catch (auditErr) {
      console.error("Failed to log address change anomaly audit event:", auditErr);
    }
  }

  return status;
}
