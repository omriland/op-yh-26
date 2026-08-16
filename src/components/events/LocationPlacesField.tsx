import { useEffect, useId, useRef, useState } from 'react'
import { emptyLocationPlaceFields, type LocationPlaceFields } from '../../lib/systemDistricts'
import {
  fetchPlaceDetails,
  fetchPlacePredictions,
  hasGoogleMapsApiKey,
  newPlacesSessionToken,
  type PlacePrediction,
} from '../../lib/googlePlaces'

type LocationPlacesFieldProps = {
  value: LocationPlaceFields
  onChange: (next: LocationPlaceFields) => void
  onBlurCommit?: () => void
  error?: string
  required?: boolean
  label?: string
  placeholder?: string
  /** Events keep a free-text first row. User addresses must pick a Google place. */
  allowFreeText?: boolean
  onAutocompleteUnavailable?: () => void
}

export function LocationPlacesField({
  value,
  onChange,
  onBlurCommit,
  error,
  required,
  label = 'מיקום',
  placeholder = 'הקלידו כתובת או שם מקום',
  allowFreeText = true,
  onAutocompleteUnavailable,
}: LocationPlacesFieldProps) {
  const fieldId = useId()
  const listboxId = `${fieldId}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef(newPlacesSessionToken())
  const warnedRef = useRef(false)
  const lastGoogleRef = useRef<LocationPlaceFields>(value)
  const unavailableRef = useRef(onAutocompleteUnavailable)
  unavailableRef.current = onAutocompleteUnavailable
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [query, setQuery] = useState(value.location)

  useEffect(() => {
    if (value.location_place_id) lastGoogleRef.current = value
  }, [value])

  useEffect(() => {
    setQuery(value.location)
  }, [value.location])

  function notifyUnavailable() {
    if (warnedRef.current) return
    warnedRef.current = true
    unavailableRef.current?.()
  }

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (!open || !trimmed) {
      setPredictions([])
      return
    }
    if (!hasGoogleMapsApiKey()) {
      notifyUnavailable()
      setPredictions([])
      return
    }

    let cancelled = false
    const handle = window.setTimeout(() => {
      void fetchPlacePredictions(trimmed, sessionRef.current).then((result) => {
        if (cancelled) return
        if (!result.ok) {
          notifyUnavailable()
          setPredictions([])
          return
        }
        setPredictions(result.predictions)
      })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
    // notifyUnavailable reads refs; intentionally omit callback from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/query only
  }, [query, open])

  const freeTextLabel = query.trim()
    ? `שימוש ב־"${query.trim()}" כפי שהוזן`
    : 'שימוש בטקסט שהוזן'

  const optionCount = (allowFreeText ? 1 : 0) + predictions.length

  function commitFreeText(text: string) {
    const trimmed = text.trim()
    sessionRef.current = newPlacesSessionToken()
    onChange({
      location: trimmed,
      location_place_id: null,
      location_lat: null,
      location_lng: null,
    })
    setQuery(trimmed)
    setOpen(false)
  }

  function revertPlacesOnly() {
    const last = lastGoogleRef.current
    if (last.location_place_id) {
      onChange(last)
      setQuery(last.location)
    } else {
      onChange(emptyLocationPlaceFields())
      setQuery('')
    }
    setOpen(false)
  }

  async function commitGoogle(prediction: PlacePrediction) {
    const details = await fetchPlaceDetails(prediction.placeId, sessionRef.current)
    sessionRef.current = newPlacesSessionToken()
    if (!details.ok) {
      if (allowFreeText) {
        commitFreeText(
          [prediction.primaryText, prediction.secondaryText].filter(Boolean).join(', '),
        )
      }
      notifyUnavailable()
      return
    }
    onChange({
      location: details.place.label,
      location_place_id: details.place.placeId,
      location_lat: details.place.lat,
      location_lng: details.place.lng,
    })
    setQuery(details.place.label)
    setOpen(false)
  }

  function selectIndex(index: number) {
    if (allowFreeText) {
      if (index <= 0) {
        commitFreeText(query)
        return
      }
      const prediction = predictions[index - 1]
      if (prediction) void commitGoogle(prediction)
      return
    }
    const prediction = predictions[index]
    if (prediction) void commitGoogle(prediction)
  }

  return (
    <div className="field location-places" ref={rootRef}>
      <label className="field__label" htmlFor={fieldId}>
        {label}
        {required ? <span className="visually-hidden"> שדה חובה</span> : null}
      </label>
      <div className="field__control location-places__control">
        <input
          id={fieldId}
          className="field__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listboxId}-opt-${highlight}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          required={required}
          data-blank={required && !query.trim() ? 'true' : undefined}
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          onChange={(event) => {
            const next = event.target.value
            setQuery(next)
            setOpen(true)
            setHighlight(0)
            onChange({
              location: next,
              location_place_id: null,
              location_lat: null,
              location_lng: null,
            })
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                if (allowFreeText) {
                  if (query.trim() && query.trim() !== value.location.trim()) {
                    commitFreeText(query)
                  } else if (query.trim() && !value.location_place_id) {
                    commitFreeText(query)
                  }
                } else if (!query.trim()) {
                  onChange(emptyLocationPlaceFields())
                  setQuery('')
                } else if (!value.location_place_id) {
                  revertPlacesOnly()
                }
                setOpen(false)
                onBlurCommit?.()
              }
            }, 0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setHighlight((current) => Math.min(current + 1, optionCount - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlight((current) => Math.max(current - 1, 0))
            } else if (event.key === 'Enter' && open) {
              event.preventDefault()
              selectIndex(highlight)
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        {open && query.trim() ? (
          <ul id={listboxId} className="location-places__list" role="listbox" aria-label="הצעות מיקום">
            {allowFreeText ? (
            <li
              id={`${listboxId}-opt-0`}
              role="option"
              aria-selected={highlight === 0}
              className={[
                'location-places__option',
                'location-places__option--free',
                highlight === 0 ? 'location-places__option--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={(event) => {
                event.preventDefault()
                selectIndex(0)
              }}
            >
              {freeTextLabel}
            </li>
            ) : null}
            {predictions.map((prediction, index) => {
              const optionIndex = allowFreeText ? index + 1 : index
              return (
                <li
                  key={prediction.placeId}
                  id={`${listboxId}-opt-${optionIndex}`}
                  role="option"
                  aria-selected={highlight === optionIndex}
                  className={[
                    'location-places__option',
                    highlight === optionIndex ? 'location-places__option--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectIndex(optionIndex)
                  }}
                >
                  <span className="location-places__primary">{prediction.primaryText}</span>
                  {prediction.secondaryText ? (
                    <span className="location-places__secondary">{prediction.secondaryText}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p id={`${fieldId}-error`} className="field__hint field__hint--error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
