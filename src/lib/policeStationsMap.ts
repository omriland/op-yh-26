import type {
  GoogleMap,
  GoogleMapData,
  GoogleMapDataFeature,
  MapsApi,
  MapsEventListener,
} from './googleMaps'
import {
  isPoliceStationProps,
  policeStationHoverLabel,
  POLICE_STATIONS_GEOJSON_URL,
} from './policeStations'

export const POLICE_STATION_HOVER_FILL_OPACITY = 0.16

function accentColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return value || '#1d4e89'
}

export function stylePoliceStationData(data: GoogleMapData): void {
  const accent = accentColor()
  data.setStyle({
    fillColor: accent,
    fillOpacity: 0,
    strokeColor: accent,
    strokeWeight: 1.25,
    strokeOpacity: 0.85,
  })
}

function stationPropsFromFeature(feature: GoogleMapDataFeature) {
  return {
    TahanaName: feature.getProperty('TahanaName'),
    TahanaShortName: feature.getProperty('TahanaShortName'),
    MerhavName: feature.getProperty('MerhavName'),
    MahozName: feature.getProperty('MahozName'),
  }
}

export function isMapPinHoverTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return (target as Element).closest('.user-map-pin') != null
}

export function mapPinHoldsTooltip(host: ParentNode): boolean {
  return host.querySelector('.user-map-pin:hover, .user-map-pin:focus-visible') != null
}

function placeStationTip(tip: HTMLElement, host: HTMLElement, event: MouseEvent) {
  const box = host.getBoundingClientRect()
  tip.style.left = `${event.clientX - box.left}px`
  tip.style.top = `${event.clientY - box.top}px`
}

export function attachPoliceStationLayer(
  _maps: MapsApi,
  map: GoogleMap,
): { data: GoogleMapData; setVisible: (visible: boolean) => void; detach: () => void } {
  const data = map.data
  data.loadGeoJson(POLICE_STATIONS_GEOJSON_URL)
  stylePoliceStationData(data)

  const host = map.getDiv().parentElement ?? map.getDiv()
  const tip = document.createElement('div')
  tip.className = 'user-map__station-tip'
  tip.hidden = true
  host.append(tip)

  let hoveredFeature: GoogleMapDataFeature | null = null

  function hideTip() {
    tip.hidden = true
    tip.textContent = ''
  }

  function showTip(label: string, event: MouseEvent) {
    if (mapPinHoldsTooltip(host) || isMapPinHoverTarget(event.target)) {
      hideTip()
      return
    }
    tip.textContent = label
    tip.hidden = false
    placeStationTip(tip, host, event)
  }

  function labelForFeature(feature: GoogleMapDataFeature): string | null {
    const raw = stationPropsFromFeature(feature)
    return isPoliceStationProps(raw) ? policeStationHoverLabel(raw) : null
  }

  function restoreStationTip(event: MouseEvent) {
    if (!hoveredFeature || mapPinHoldsTooltip(host) || isMapPinHoverTarget(event.target)) {
      hideTip()
      return
    }
    const label = labelForFeature(hoveredFeature)
    if (!label) {
      hideTip()
      return
    }
    showTip(label, event)
  }

  function onHostMove(event: MouseEvent) {
    if (mapPinHoldsTooltip(host) || isMapPinHoverTarget(event.target)) {
      hideTip()
      return
    }
    if (hoveredFeature && tip.hidden) restoreStationTip(event)
    else if (!tip.hidden) placeStationTip(tip, host, event)
  }

  function onPinPriorityChange(event: Event) {
    if (mapPinHoldsTooltip(host) || isMapPinHoverTarget(event.target)) {
      hideTip()
      return
    }
    if (event instanceof MouseEvent) restoreStationTip(event)
  }

  host.addEventListener('mousemove', onHostMove)
  host.addEventListener('pointerover', onPinPriorityChange, true)
  host.addEventListener('pointerout', onPinPriorityChange, true)
  host.addEventListener('focusin', onPinPriorityChange)
  host.addEventListener('focusout', onPinPriorityChange)

  const over: MapsEventListener = data.addListener('mouseover', (event) => {
    hoveredFeature = event.feature
    data.overrideStyle(event.feature, { fillOpacity: POLICE_STATION_HOVER_FILL_OPACITY })
    const label = labelForFeature(event.feature)
    if (!label || !event.domEvent) return
    showTip(label, event.domEvent)
  })
  const out: MapsEventListener = data.addListener('mouseout', (event) => {
    if (hoveredFeature === event.feature) hoveredFeature = null
    data.revertStyle(event.feature)
    hideTip()
  })

  return {
    data,
    setVisible(visible: boolean) {
      if (!visible) {
        hoveredFeature = null
        data.revertStyle()
        hideTip()
      }
      data.setMap(visible ? map : null)
    },
    detach() {
      host.removeEventListener('mousemove', onHostMove)
      host.removeEventListener('pointerover', onPinPriorityChange, true)
      host.removeEventListener('pointerout', onPinPriorityChange, true)
      host.removeEventListener('focusin', onPinPriorityChange)
      host.removeEventListener('focusout', onPinPriorityChange)
      over.remove()
      out.remove()
      hoveredFeature = null
      hideTip()
      tip.remove()
      data.setMap(null)
    },
  }
}
