import { useEffect, useId, useRef, useState } from 'react'
import { Layers } from 'lucide-react'
import { Checkbox } from '../ui/Checkbox'
import type { OpsMapLayers } from '../../lib/policeStations'

type MapLayersControlProps = {
  layers: OpsMapLayers
  onChange: (next: OpsMapLayers) => void
}

export function MapLayersControl({ layers, onChange }: MapLayersControlProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const checkboxId = useId()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className="user-map__layers"
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="icon-btn user-map__layers-btn"
        aria-label="שכבות מפה"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <Layers size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open ? (
        <div id={menuId} className="menu user-map__layers-menu" role="dialog" aria-label="שכבות מפה">
          <Checkbox
            id={checkboxId}
            label="תחנות משטרה"
            checked={layers.policeStations}
            onChange={(checked) => onChange({ ...layers, policeStations: checked })}
          />
        </div>
      ) : null}
    </div>
  )
}
