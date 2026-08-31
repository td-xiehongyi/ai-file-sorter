import type { OperationPreviewResponse } from "../../types/operations";
import { OperationPreviewView } from "./OperationPreviewView";

export function OperationPreview({
  preview,
  onConfirm,
  onCancel,
  busy,
}: {
  preview: OperationPreviewResponse;
  onConfirm: (planId: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return <OperationPreviewView preview={preview} onConfirm={onConfirm} onCancel={onCancel} busy={busy} />;
}
