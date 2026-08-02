import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../context/AppContext'
import { downloadBillsJson, parseBillsJson, mergeImportedBills } from '../lib/storage'
import { Plus, Trash2, Download, Upload } from 'lucide-react'
import type { Bill, BillLocation } from '../types/models'
import { SplitEditor } from '../components/SplitEditor'
import { EditField } from '../components/EditField'

export function Bills() {
  const { data, addBill, updateBill, removeBill, replaceBills } = useAppData()
  const [adding, setAdding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const [locationFilter, setLocationFilter] = useState<'all' | BillLocation>('all')
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const prefill = (routerLocation.state as { billPrefill?: Partial<Omit<Bill, 'id'>> } | null)?.billPrefill

  useEffect(() => {
    if (prefill) setAdding(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state])

  function handleImportFile(file: File) {
    setImportError(null)
    setImportSuccess(false)
    file
      .text()
      .then((text) => {
        const imported = parseBillsJson(text, data.people)
        const currentJointCount = data.bills.filter((b) => b.location === 'joint').length
        const proceed = window.confirm(
          `This replaces all ${currentJointCount} of your current joint bills with the ${imported.length} in this file. Your personal bills won't be touched. Continue?`
        )
        if (!proceed) return
        replaceBills(mergeImportedBills(data.bills, imported))
        setImportSuccess(true)
      })
      .catch((err) => setImportError(err.message))
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-[var(--color-ink)]">Bills</h1>
        <div className="flex gap-2">
          <button
            onClick={() => downloadBillsJson(data.bills, data.people)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface)' }}
            title="Export joint bills as JSON (to share with a partner)"
          >
            <Download size={16} className="text-[var(--color-ink)]" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface)' }}
            title="Import joint bills from JSON (replaces your current joint bills)"
          >
            <Upload size={16} className="text-[var(--color-ink)]" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => setAdding(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-coral)' }}
          >
            <Plus size={18} className="text-white" />
          </button>
        </div>
      </header>

      {importError && (
        <p className="text-xs mb-4 px-1" style={{ color: 'var(--color-negative)' }}>
          Import failed: {importError}
        </p>
      )}
      {importSuccess && (
        <p className="text-xs mb-4 px-1" style={{ color: 'var(--color-positive)' }}>
          Joint bills updated from the imported file.
        </p>
      )}

      {adding && (
        <BillForm
          people={data.people}
          initial={prefill}
          onCancel={() => {
            setAdding(false)
            if (prefill) navigate('.', { replace: true, state: null })
          }}
          onSave={(bill) => {
            addBill(bill)
            setAdding(false)
            if (prefill) navigate('.', { replace: true, state: null })
          }}
        />
      )}

      <div className="flex gap-2 mb-4">
        {(['all', 'personal', 'joint'] as const).map((option) => {
          const active = locationFilter === option
          return (
            <button
              key={option}
              onClick={() => setLocationFilter(option)}
              className="px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors"
              style={{
                background: active ? 'var(--color-coral)' : 'var(--color-surface)',
                color: active ? '#fff' : 'var(--color-ink-muted)',
              }}
            >
              {option}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        {data.bills
          .slice()
          .filter((b) => locationFilter === 'all' || b.location === locationFilter)
          .sort((a, b) => a.dueDay - b.dueDay)
          .map((bill) => (
            <BillRow key={bill.id} bill={bill} people={data.people} onUpdate={(u) => updateBill(bill.id, u)} onRemove={() => removeBill(bill.id)} />
          ))}
        {data.bills.length === 0 && !adding && (
          <p className="text-sm text-[var(--color-ink-muted)] text-center py-10">No bills yet. Add one, or import a JSON file shared with you.</p>
        )}
      </div>
    </div>
  )
}

function BillRow({
  bill,
  people,
  onUpdate,
  onRemove,
}: {
  bill: Bill
  people: { id: string; name: string }[]
  onUpdate: (u: Partial<Bill>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'var(--color-surface)' }}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
        <div>
          <p className="font-body text-sm text-[var(--color-ink)]">{bill.name}</p>
          <p className="text-xs text-[var(--color-ink-faint)]">
            {bill.location === 'joint' ? 'Joint' : 'Personal'} · Due day {bill.dueDay}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-[var(--color-ink)]">£{bill.cost.toFixed(2)}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="text-[var(--color-ink-faint)]"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-track)' }}>
          <EditField label="Cost (£)" type="number" value={bill.cost} onChange={(v) => onUpdate({ cost: Number(v) })} />
          <EditField label="Due day" type="number" value={bill.dueDay} onChange={(v) => onUpdate({ dueDay: Number(v) })} />
          <EditField label="Category" type="text" value={bill.category} onChange={(v) => onUpdate({ category: v })} />
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--color-ink-muted)]">Location</span>
            <select
              value={bill.location}
              onChange={(e) => {
                const location = e.target.value as BillLocation
                onUpdate(location === 'joint' ? { location, payee: bill.payee || people[0]?.id || '' } : { location })
              }}
              className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
            >
              <option value="personal">Personal</option>
              <option value="joint">Joint</option>
            </select>
          </label>
          {bill.location === 'joint' && (
            <SplitEditor
              people={people}
              payee={bill.payee || people[0]?.id || ''}
              percent={bill.payeeSharePercent ?? 50}
              onChangePayee={(payee) => onUpdate({ payee })}
              onChangePercent={(payeeSharePercent) => onUpdate({ payeeSharePercent })}
            />
          )}
          {bill.location === 'personal' && (
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs text-[var(--color-ink-muted)]">Owner</span>
              <select
                value={bill.ownerId}
                onChange={(e) => onUpdate({ ownerId: e.target.value })}
                className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 col-span-2 mt-1">
            <input type="checkbox" checked={bill.isStandingOrder} onChange={(e) => onUpdate({ isStandingOrder: e.target.checked })} />
            <span className="text-xs text-[var(--color-ink-muted)]">Standing order</span>
          </label>
        </div>
      )}
    </div>
  )
}

function BillForm({
  people,
  initial,
  onSave,
  onCancel,
}: {
  people: { id: string; name: string }[]
  initial?: Partial<Omit<Bill, 'id'>>
  onSave: (bill: Omit<Bill, 'id'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [cost, setCost] = useState(initial?.cost ? String(initial.cost) : '')
  const [dueDay, setDueDay] = useState(initial?.dueDay ? String(initial.dueDay) : '1')
  const [location, setLocation] = useState<BillLocation>(initial?.location ?? 'personal')
  const [payee, setPayee] = useState(initial?.payee || people[0]?.id || '')
  const [payeeSharePercent, setPayeeSharePercent] = useState(initial?.payeeSharePercent ?? 50)
  const [ownerId, setOwnerId] = useState(initial?.ownerId || people[0]?.id || '')
  const [category, setCategory] = useState(initial?.category ?? '')

  return (
    <div className="rounded-2xl p-4 mb-4 flex flex-col gap-3" style={{ background: 'var(--color-surface)' }}>
      <EditField label="Name" type="text" value={name} onChange={setName} />
      <div className="grid grid-cols-2 gap-3">
        <EditField label="Cost (£)" type="number" value={cost} onChange={setCost} />
        <EditField label="Due day" type="number" value={dueDay} onChange={setDueDay} />
      </div>
      <EditField label="Category" type="text" value={category} onChange={setCategory} />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--color-ink-muted)]">Location</span>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value as BillLocation)}
          className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
        >
          <option value="personal">Personal</option>
          <option value="joint">Joint</option>
        </select>
      </label>
      {location === 'joint' ? (
        <SplitEditor people={people} payee={payee} percent={payeeSharePercent} onChangePayee={setPayee} onChangePercent={setPayeeSharePercent} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-ink-muted)]">Owner</span>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full bg-transparent border-b border-[var(--color-track)] py-1 text-[var(--color-ink)] outline-none"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2 justify-end mt-1">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-ink-muted)]">
          Cancel
        </button>
        <button
          onClick={() => {
            if (!name.trim() || !cost) return
            onSave({
              name: name.trim(),
              cost: Number(cost),
              dueDay: Number(dueDay),
              location,
              payee: location === 'joint' ? payee : '',
              payeeSharePercent: location === 'joint' ? payeeSharePercent : 100,
              category: category || 'Uncategorized',
              ownerId: location === 'personal' ? ownerId : '',
              isStandingOrder: true,
            })
          }}
          className="px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-coral)', color: '#fff' }}
        >
          Add bill
        </button>
      </div>
    </div>
  )
}

