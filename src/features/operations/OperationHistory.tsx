import type { OperationHistoryItem } from "../../types/operations";
import { OperationHistoryView } from "./OperationHistoryView";

export function OperationHistory({
  items,
  onUndo,
  busy,
}: {
  items: OperationHistoryItem[];
  onUndo: (historyId: number) => void;
  busy: boolean;
}) {
  return <OperationHistoryView items={items} onUndo={onUndo} busy={busy} />;
}
