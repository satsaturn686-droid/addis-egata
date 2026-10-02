export type DrawStatus =
  | "draft"
  | "open"
  | "full"
  | "closed"
  | "drawing"
  | "completed"
  | "cancelled";

export type PrizeType = "cash" | "physical";

export type EntryStatus =
  | "reserved"
  | "pending_payment"
  | "paid"
  | "rejected"
  | "expired";

export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected";

export interface Draw {
  id: string;
  name: string;
  description: string | null;
  prizeType: PrizeType;
  prizeName: string;
  prizeImageUrl: string | null;
  prizeDescription: string | null;
  displayedPrizeValue: number | null;
  actualPrizeCost: number | null;
  totalNumbers: number;
  filledNumbers: number;
  entryFee: number;
  winnerCount: number;
  uniqueWinners: boolean;
  status: DrawStatus;
  startsAt: string | null;
  deadlineAt: string | null;
  drawAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DrawPrize {
  id: string;
  drawId: string;
  rank: number;
  amount: number;
  createdAt: string;
}

export interface Entry {
  id: string;
  drawId: string;
  userId: string;
  number: number;
  status: EntryStatus;
  reservedUntil: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  entryId: string;
  userId: string;
  amount: number;
  paymentMethod: "telebirr";
  transactionReference: string;
  senderName: string | null;
  receiptImageUrl: string | null;
  status: PaymentStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Winner {
  id: string;
  drawId: string;
  entryId: string;
  userId: string;
  rank: number;
  prizeAmount: number;
  selectedAt: string;
}
