import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  DataforseoChargedTaskError,
  type DataforseoApiCallCost,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import {
  mapDataforseoPathToCreditFeature,
  type CreditFeature,
} from "@/shared/billing-credit-features";
import { recordCost } from "@/custom/costs/server/ledger";

/**
 * Self-hosted metering: runs a DataForSEO call and writes what it cost to the
 * ledger. It never changes the call's result or error — a ledger failure is
 * logged and swallowed so a bookkeeping problem cannot break a search.
 */
export async function runAndRecordCost<T>(
  customer: BillingCustomerContext,
  execute: () => Promise<DataforseoApiResponse<T>>,
  creditFeature?: CreditFeature,
): Promise<T> {
  try {
    const result = await execute();
    await safeRecord(customer, result.billing, creditFeature, "ok");
    return result.data;
  } catch (error) {
    if (error instanceof DataforseoChargedTaskError) {
      await safeRecord(
        customer,
        error.billing,
        creditFeature,
        "failed_charged",
      );
    }
    throw error;
  }
}

async function safeRecord(
  customer: BillingCustomerContext,
  billing: DataforseoApiCallCost,
  creditFeature: CreditFeature | undefined,
  outcome: "ok" | "failed_charged",
) {
  try {
    await recordCost({
      organizationId: customer.organizationId,
      userEmail: customer.userEmail ?? null,
      projectId: customer.projectId ?? null,
      feature: creditFeature ?? mapDataforseoPathToCreditFeature(billing.path),
      endpoint: billing.path.join("/"),
      costUsd: billing.costUsd,
      outcome,
    });
  } catch (error) {
    console.error("costs.record failed:", error);
  }
}
