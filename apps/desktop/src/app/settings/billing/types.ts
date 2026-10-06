import type {
  BillingAutoReload,
  BillingCardInfo,
  BillingChargeResponse,
  BillingChargeStatusResponse,
  BillingErrorPayload,
  BillingMonthlyCap,
  BillingMutationResponse,
  BillingRefusalCode,
  ChargeFailureReason,
  BillingStateResponse as SharedBillingStateResponse,
  SubscriptionPreviewResponse,
  SubscriptionStateResponse,
  SubscriptionTierOption,
  UsageBarData,
  UsageModelData
} from '@hermes/shared/billing'

/**
 * The gateway's `billing.state` payload as THIS app reads it: the shared shape
 * plus the free-tier fields newer gateways add (backend passthrough — the UI
 * no longer branches on them). Both fields are absent on older gateways.
 */
export type BillingStateResponse = SharedBillingStateResponse & {
  free_tier_account?: boolean
  free_tier_model?: null | string
}

export type {
  BillingAutoReload,
  BillingCardInfo,
  BillingChargeResponse,
  BillingChargeStatusResponse,
  BillingErrorPayload,
  BillingMonthlyCap,
  BillingMutationResponse,
  BillingRefusalCode,
  ChargeFailureReason,
  SharedBillingStateResponse,
  SubscriptionPreviewResponse,
  SubscriptionStateResponse,
  SubscriptionTierOption,
  UsageBarData,
  UsageModelData
}
