import { BILL_ICONS, ICON_COLORS, DEFAULT_ICON_COLOR } from '../lib/billIcons'

interface BillIconPickerProps {
  icon?: string
  iconColor?: string
  onChange: (patch: { icon?: string; iconColor?: string }) => void
}

export function BillIconPicker({ icon, iconColor, onChange }: BillIconPickerProps) {
  const color = iconColor || DEFAULT_ICON_COLOR

  return (
    <div className="col-span-2 flex flex-col gap-2">
      <span className="text-xs text-[var(--color-ink-muted)]">Icon</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onChange({ icon: undefined })}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-medium"
          style={{
            background: !icon ? 'var(--color-coral)' : 'var(--color-bg-elevated)',
            color: !icon ? '#fff' : 'var(--color-ink-faint)',
          }}
          title="No icon"
        >
          none
        </button>
        {Object.entries(BILL_ICONS).map(([key, Icon]) => (
          <button
            key={key}
            onClick={() => onChange({ icon: key, iconColor: iconColor ?? DEFAULT_ICON_COLOR })}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: icon === key ? 'var(--color-coral)' : 'var(--color-bg-elevated)' }}
            title={key.replace('_', ' ')}
          >
            <Icon size={16} style={{ color: icon === key ? '#fff' : color }} />
          </button>
        ))}
      </div>

      {icon && (
        <>
          <span className="text-xs text-[var(--color-ink-muted)] mt-1">Colour</span>
          <div className="flex flex-wrap gap-1.5">
            {ICON_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ iconColor: c })}
                className="w-7 h-7 rounded-full"
                style={{
                  background: c,
                  outline: color === c ? '2px solid var(--color-ink)' : '1px solid var(--color-track)',
                  outlineOffset: 2,
                }}
                title={c}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
