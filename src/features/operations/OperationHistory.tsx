import type { OperationHistoryItem } from "../../types/operations";
import { OperationHistoryView } from "./OperationHistoryView";

export function OperationHistory({
  items,
  onUndo,
  onDelete,
  onRestore,
  onPurge,
  includeDeleted,
  onToggleDeleted,
  busy,
}: {
  items: OperationHistoryItem[];
  onUndo: (historyId: number) => void;
  onDelete: (historyId: number) => void;
  onRestore: (historyId: number) => void;
  onPurge: (historyId: number) => void;
  includeDeleted: boolean;
  onToggleDeleted: (include: boolean) => void;
  busy: boolean;
}) {
  return <OperationHistoryView items={items} onUndo={onUndo} onDelete={onDelete} onRestore={onRestore} onPurge={onPurge} includeDeleted={includeDeleted} onToggleDeleted={onToggleDeleted} busy={busy} />;
}
