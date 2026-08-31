export function SearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="file-search">
      <span>搜索名称或路径</span>
      <input aria-label="搜索名称或路径" value={value} onChange={(event) => onChange(event.target.value)} placeholder="例如：报告、项目名或文件夹" className="prototype-field" />
    </label>
  );
}
