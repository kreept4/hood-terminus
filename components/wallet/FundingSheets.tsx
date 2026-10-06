"use client";

import { Sheet } from "@/components/wallet/Sheet";
import { DepositPanel } from "@/components/wallet/DepositPanel";
import { WithdrawPanel } from "@/components/wallet/WithdrawPanel";

/**
 * The two sheets that move money, in one place.
 *
 * They were going to be needed by the account menu and by the portfolio, and a
 * deposit sheet that looks one way in the nav and another way on a page is how
 * a product starts feeling assembled rather than built.
 */

export function DepositSheet({
  address,
  onClose,
}: {
  address: string;
  onClose: () => void;
}) {
  return (
    <Sheet label="Add funds" title="Add funds" onClose={onClose}>
      <DepositPanel address={address} />
    </Sheet>
  );
}

export function WithdrawSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet label="Withdraw" title="Withdraw" onClose={onClose}>
      <WithdrawPanel onDone={onClose} />
    </Sheet>
  );
}
