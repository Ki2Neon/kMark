import { memo } from "react";

type DirtyIndicatorProps = {
  readonly isDirty: boolean;
};

function DirtyIndicatorComponent({ isDirty }: DirtyIndicatorProps) {
  return (
    <span
      aria-atomic="true"
      className="editor-shell__dirty-indicator"
      data-visible={isDirty ? "true" : "false"}
      role="status"
    >
      <span className="visually-hidden">{isDirty ? "未保存の変更あり" : "保存済み"}</span>
    </span>
  );
}

export const DirtyIndicator = memo(DirtyIndicatorComponent);
