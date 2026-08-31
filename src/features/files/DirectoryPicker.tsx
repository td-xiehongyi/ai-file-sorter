export function DirectoryPicker({ onChoose, disabled, label = "选择扫描目录" }: { onChoose: () => void; disabled?: boolean; label?: string }) {
  return <button type="button" disabled={disabled} onClick={onChoose} className="prototype-button primary">{label}</button>;
}
