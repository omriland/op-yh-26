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
      gestureHandling?: string
    },
  ) => GoogleMap
  LatLng: new (lat: number, lng: number) => GoogleLatLng
  LatLngBounds: new () => GoogleBounds
  OverlayView: {
    new (): GoogleOverlay
  }
}

export type GoogleMap = {
  fitBounds: (bounds: GoogleBounds, padding?: number) => void
  panTo: (center: { lat: number; lng: number }) => void
  setZoom: (zoom: number) => void
}

type GoogleLatLng = { lat: () => number; lng: () => number }

type GoogleBounds = {
  extend: (point: GoogleLatLng | { lat: number; lng: number }) => void
  isEmpty: () => boolean
}

type GoogleOverlay = {
  setMap: (map: GoogleMap | null) => void
  getPanes: () => { overlayMouseTarget: HTMLElement } | null
  getProjection: () => {
    fromLatLngToDivPixel: (latLng: GoogleLatLng) => { x: number; y: number } | null
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
}

export function createLabeledPin(
  maps: MapsApi,
  position: { lat: number; lng: number },
  label: string,
  title: string,
  variant: 'user' | 'search' | 'event' = 'user',
  onClick?: () => void,
  tooltip?: { text: string; alert?: boolean },
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
        onClick ? 'user-map-pin--hit' : '',
      ]
        .filter(Boolean)
        .join(' ')
      if (tooltip) {
        el.setAttribute('tabindex', '0')
        el.setAttribute('aria-label', `${label}. ${tooltip.text}`)
      } else {
        el.title = title
      }
      if (onClick) {
        el.addEventListener('click', onClick)
      }
      const dot = document.createElement('span')
      dot.className = 'user-map-pin__dot'
      const text = document.createElement('span')
      text.className = 'user-map-pin__label'
      text.textContent = label
      el.append(dot, text)
      if (tooltip) {
        const tip = document.createElement('span')
        tip.className = tooltip.alert
          ? 'user-map-pin__tip user-map-pin__tip--alert'
          : 'user-map-pin__tip'
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
  }

  return new LabeledPin()
}
