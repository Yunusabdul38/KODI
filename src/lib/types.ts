export type PayoutMethod = "lightning" | "test_wallet";

export interface Landlord {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  accessCodeHash: string;
  idType: string;
  idNumber: string;
  payoutMethod: PayoutMethod;
  lightningAddress: string | null;
  verified: boolean;
  declinedReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface Unit {
  id: string;
  code: string;
  landlordId: string;
  title: string;
  bedrooms: number;
  bathrooms: number;
  area: string;
  city: string;
  address: string;
  description: string;
  photo: string;
  annualRentNgn: number;
  agentName: string | null;
  agentFeeNgn: number;
  agentPayoutMethod: PayoutMethod | null;
  agentLightningAddress: string | null;
  listed: boolean;
  frozen: boolean;
  createdAt: string;
}

export type DepositStatus =
  | "awaiting_payment"
  | "held"
  | "refund_requested"
  | "disputed"
  | "released"
  | "refunded"
  | "expired";

export interface Deposit {
  id: string;
  unitId: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  tokenHash: string;
  months: number;
  rentNgn: number;
  agentFeeNgn: number;
  ngnPerBtc: number;
  amountSats: number;
  rentSats: number;
  agentSats: number;
  moveInDate: string;
  status: DepositStatus;
  paymentHash: string;
  paymentRequest: string;
  preimage: string | null;
  expiresAt: string;
  paidAt: string | null;
  landlordConfirmedAt: string | null;
  movedInAt: string | null;
  refundRequestedAt: string | null;
  refundMethod: PayoutMethod | null;
  refundAddress: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface Vault {
  id: string;
  code: string;
  unitId: string;
  tenantName: string;
  tenantEmail: string;
  tokenHash: string;
  landlordTokenHash: string;
  targetNgn: number;
  dueDate: string;
  schedule: "weekly" | "monthly";
  status: "active" | "paid" | "returned";
  closedAt: string | null;
  createdAt: string;
}

export interface VaultPayment {
  id: string;
  vaultId: string;
  payerName: string | null;
  amountSats: number;
  amountNgn: number;
  ngnPerBtc: number;
  paymentHash: string;
  paymentRequest: string;
  preimage: string | null;
  status: "pending" | "paid" | "expired";
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
}

export interface Payout {
  id: string;
  depositId: string | null;
  vaultId: string | null;
  recipient: "landlord" | "agent" | "tenant";
  method: PayoutMethod;
  destination: string;
  amountSats: number;
  ngnPerBtc: number;
  idempotencyKey: string;
  status: "pending" | "sent" | "failed";
  paymentHash: string | null;
  preimage: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface Dispute {
  id: string;
  depositId: string;
  raisedBy: "tenant" | "landlord";
  reason: string;
  decision: "release" | "refund" | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  role: "tenant" | "landlord" | "admin" | "system";
  actor: string | null;
  action: string;
  unitId: string | null;
  depositId: string | null;
  vaultId: string | null;
  details: string | null;
  createdAt: string;
}

export interface ReserveSnapshot {
  id: string;
  walletBalanceSats: number;
  ledgerTotalSats: number;
  differenceSats: number;
  takenAt: string;
}

/** What the public sees about a unit. */
export type UnitStatus = "available" | "reserved" | "deposit_held" | "let" | "unlisted";
