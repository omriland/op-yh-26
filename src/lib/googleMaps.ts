import { hasGoogleMapsApiKey } from './googlePlaces'

export type MapsApi = {
  Map: new (
    el: HTMLElement,
    opts: {
      center: { lat: number; lng: number }
      zoom: number
      mapTypeControl?: boolean
      streetViewControl?: boolean
      fullscreenControl?: boolean
      fullscreenControlOptions?: { position?: number }
      gestureHandling?: string
    },
  ) => GoogleMap
  ControlPosition?: { RIGHT_BOTTOM: number }
  LatLng: new (lat: number, lng: number) => GoogleLatLng
  LatLngBounds: new () => GoogleBounds
  OverlayView: {
    new (): GoogleOverlay
  }
  Point: new (x: number, y: number) => { x: number; y: number }
  InfoWindow: new (opts?: { content?: string }) => GoogleInfoWindow
}

export type MapsEventListener = {
  remove: () => void
}

type GoogleLatLng = { lat: () => number; lng: () => number }

export type GoogleMapDataFeature = {
  getProperty: (name: string) => unknown
}

export type GoogleMapDataMouseEvent = {
  feature: GoogleMapDataFeature
  latLng: GoogleLatLng | null
  domEvent?: MouseEvent
}

export type GoogleMapDataStyle = {
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeWeight?: number
  strokeOpacity?: number
}

export type GoogleMapData = {
  loadGeoJson: (url: string) => void
  setStyle: (style: GoogleMapDataStyle) => void
  overrideStyle: (feature: GoogleMapDataFeature, style: GoogleMapDataStyle) => void
  revertStyle: (feature?: GoogleMapDataFeature) => void
  setMap: (map: GoogleMap | null) => void
  addListener: (
    eventName: string,
    handler: (event: GoogleMapDataMouseEvent) => void,
  ) => MapsEventListener
}

export type GoogleInfoWindow = {
  setContent: (content: string) => void
  setPosition: (position: { lat: number; lng: number }) => void
  open: (map: GoogleMap) => void
  close: () => void
}

export type GoogleMap = {
  fitBounds: (bounds: GoogleBounds, padding?: number) => void
  panTo: (center: { lat: number; lng: number }) => void
  setZoom: (zoom: number) => void
  addListener: (eventName: string, handler: () => void) => MapsEventListener
  getDiv: () => HTMLElement
  data: GoogleMapData
}

type GoogleBounds = {
  extend: (point: GoogleLatLng | { lat: number; lng: number }) => void
  isEmpty: () => boolean
}

type GoogleOverlay = {
  setMap: (map: GoogleMap | null) => void
  getPanes: () => { overlayMouseTarget: HTMLElement } | null
  getProjection: () => {
    fromLatLngToDivPixel: (latLng: GoogleLatLng) => { x: number; y: number } | null
    fromDivPixelToLatLng: (point: { x: number; y: number }) => GoogleLatLng | null
  }
  onAdd(): void
  draw(): void
  onRemove(): void
}

declare global {
  interface Window {
    google?: { maps: MapsApi }
  }
}

let loadPromise: Promise<MapsApi> | null = null

export const ISRAEL_CENTER = { lat: 31.5, lng: 34.85 }

export function loadGoogleMaps(): Promise<MapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (loadPromise) return loadPromise
  if (!hasGoogleMapsApiKey()) {
    return Promise.reject(new Error('missing_key'))
  }
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-yahpaz-maps="js"]')
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.maps) resolve(window.google.maps)
        else reject(new Error('maps_load_failed'))
      })
      existing.addEventListener('error', () => reject(new Error('maps_load_failed')))
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=he&region=IL&v=weekly`
    script.async = true
    script.dataset.yahpazMaps = 'js'
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps)
      else reject(new Error('maps_load_failed'))
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error('maps_load_failed'))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}

export type MapPinOverlay = {
  setMap: (map: GoogleMap | null) => void
  setPosition: (position: { lat: number; lng: number }) => void
  setCopy: (label: string, tooltipText?: string) => void
}

const LIVE_CAR_PATH =
  'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2'

function appendLiveCarIcon(dot: HTMLElement) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('class', 'user-map-pin__icon')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.75')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  const body = document.createElementNS(ns, 'path')
  body.setAttribute('d', LIVE_CAR_PATH)
  const wheelStart = document.createElementNS(ns, 'circle')
  wheelStart.setAttribute('cx', '7')
  wheelStart.setAttribute('cy', '17')
  wheelStart.setAttribute('r', '2')
  const axle = document.createElementNS(ns, 'path')
  axle.setAttribute('d', 'M9 17h6')
  const wheelEnd = document.createElementNS(ns, 'circle')
  wheelEnd.setAttribute('cx', '17')
  wheelEnd.setAttribute('cy', '17')
  wheelEnd.setAttribute('r', '2')
  svg.append(body, wheelStart, axle, wheelEnd)
  dot.append(svg)
}

export function createLabeledPin(
  maps: MapsApi,
  position: { lat: number; lng: number },
  label: string,
  title: string,
  variant: 'user' | 'search' | 'event' | 'live' = 'user',
  onClick?: () => void,
  tooltip?: { text: string; alert?: boolean; live?: boolean },
  unavailable = false,
  onDragEnd?: (next: { lat: number; lng: number }) => void,
): MapPinOverlay {
  class LabeledPin extends maps.OverlayView {
    private el: HTMLDivElement | null = null
    private latLng: GoogleLatLng

    constructor() {
      super()
      this.latLng = new maps.LatLng(position.lat, position.lng)
    }

    onAdd() {
      const el = document.createElement('div')
      el.className = [
        'user-map-pin',
        variant === 'search' ? 'user-map-pin--search' : '',
        variant === 'event' ? 'user-map-pin--event' : '',
        variant === 'live' ? 'user-map-pin--live' : '',
        unavailable ? 'user-map-pin--unavailable' : '',
        onClick || onDragEnd ? 'user-map-pin--hit' : '',
        onDragEnd ? 'user-map-pin--draggable' : '',
      ]
        .filter(Boolean)
        .join(' ')
      if (tooltip) {
        el.setAttribute('tabindex', '0')
        el.setAttribute('aria-label', `${label}. ${tooltip.text}`)
      } else {
        el.title = title
      }
      if (onDragEnd) {
        el.setAttribute('aria-grabbed', 'false')
        let dragging = false
        let moved = false
        let startX = 0
        let startY = 0
        let origin = this.latLng
        el.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          dragging = true
          moved = false
          startX = event.clientX
          startY = event.clientY
          origin = this.latLng
          el.classList.add('user-map-pin--dragging')
          el.setAttribute('aria-grabbed', 'true')
          el.setPointerCapture(event.pointerId)
        })
        el.addEventListener('pointermove', (event) => {
          if (!dragging) return
          const dx = event.clientX - startX
          const dy = event.clientY - startY
          if (!moved && dx * dx + dy * dy < 64) return
          moved = true
          const proj = this.getProjection()
          const startPx = proj.fromLatLngToDivPixel(origin)
          if (!startPx) return
          const next = proj.fromDivPixelToLatLng(new maps.Point(startPx.x + dx, startPx.y + dy))
          if (!next) return
          this.latLng = next
          this.draw()
        })
        el.addEventListener('pointerup', (event) => {
          if (!dragging) return
          dragging = false
          el.classList.remove('user-map-pin--dragging')
          el.setAttribute('aria-grabbed', 'false')
          try {
            el.releasePointerCapture(event.pointerId)
          } catch {
            /* already released */
          }
          if (moved) {
            onDragEnd({ lat: this.latLng.lat(), lng: this.latLng.lng() })
          } else {
            onClick?.()
          }
        })
      } else if (onClick) {
        el.addEventListener('click', onClick)
      }
      const dot = document.createElement('span')
      dot.className = 'user-map-pin__dot'
      if (variant === 'live') appendLiveCarIcon(dot)
      const text = document.createElement('span')
      text.className = 'user-map-pin__label'
      text.textContent = label
      if (unavailable) {
        text.setAttribute('data-theme', 'field')
      }
      el.append(dot, text)
      if (tooltip) {
        const tip = document.createElement('span')
        tip.className = [
          'user-map-pin__tip',
          tooltip.alert ? 'user-map-pin__tip--alert' : '',
          tooltip.live ? 'user-map-pin__tip--live' : '',
        ]
          .filter(Boolean)
          .join(' ')
        tip.textContent = tooltip.text
        el.append(tip)
      }
      this.el = el
      this.getPanes()?.overlayMouseTarget.appendChild(el)
    }

    draw() {
      if (!this.el) return
      const point = this.getProjection().fromLatLngToDivPixel(this.latLng)
      if (!point) return
      this.el.style.left = `${point.x}px`
      this.el.style.top = `${point.y}px`
    }

    onRemove() {
      this.el?.remove()
      this.el = null
    }

    setPosition(next: { lat: number; lng: number }) {
      this.latLng = new maps.LatLng(next.lat, next.lng)
      this.draw()
    }

    setCopy(nextLabel: string, tooltipText?: string) {
      if (!this.el) return
      const text = this.el.querySelector('.user-map-pin__label')
      if (text) text.textContent = nextLabel
      const tip = this.el.querySelector('.user-map-pin__tip')
      if (tip && tooltipText) tip.textContent = tooltipText
      if (tooltipText) this.el.setAttribute('aria-label', `${nextLabel}. ${tooltipText}`)
      else this.el.title = title
    }
  }

  return new LabeledPin()
}
