import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { eventGeocodeQuery } from '../../lib/eventGeocode'
import { emptyLocationPlaceFields, type LocationPlaceFields } from '../../lib/systemDistricts'
import {
  fetchPlaceDetails,
  fetchPlacePredictions,
  hasGoogleMapsApiKey,
  newPlacesSessionToken,
  type PlacePrediction,
} from '../../lib/googlePlaces'
import {
  junctionLocationLabel,
  junctionPlaceId,
  searchHighwayJunctions,
  type HighwayJunction,
} from '../../lib/highwayJunctions'
import {
  rankLocationSuggestions,
  searchLocationSuggestionsCombined,
} from '../../lib/locationSuggestions'
import { FieldLabel } from '../ui/FieldLabel'

type LocationPlacesFieldProps = {
  value: LocationPlaceFields
  onChange: (next: LocationPlaceFields) => void
  /** Fired only after a Google place is chosen (not on each keystroke). */
  onPlaceCommit?: (next: LocationPlaceFields) => void
  /** Fired after a closed-list junction is chosen. */
  onJunctionCommit?: (junction: HighwayJunction) => void
  onBlurCommit?: () => void
  error?: string
  required?: boolean
  label?: string
  placeholder?: string
  /** Hide the visible label (keep it for assistive tech). */
  hideLabel?: boolean
  /** When set, Google autocomplete is queried as road + typed location. */
  roadName?: string | null
  /** Events keep a free-text first row. User addresses must pick a Google place. */
  allowFreeText?: boolean
  onAutocompleteUnavailable?: () => void
  /** Event location field only: also search public.highway_junctions alongside Places. */
  allowJunctions?: boolean
}

export function LocationPlacesField({
  value,
  onChange,
  onPlaceCommit,
  onJunctionCommit,
  onBlurCommit,
  error,
  required,
  label = 'מיקום',
  placeholder = 'הקלידו כתובת או שם מקום',
  hideLabel = false,
  roadName = null,
  allowFreeText = true,
  onAutocompleteUnavailable,
  allowJunctions = false,
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
  const [junctions, setJunctions] = useState<HighwayJunction[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [localSearchFailed, setLocalSearchFailed] = useState(false)
  const [query, setQuery] = useState(value.location)

  useEffect(() => {
    if (
      value.location_place_id ||
      (value.location.trim() && value.location_lat != null && value.location_lng != null)
    ) {
      lastGoogleRef.current = value
    }
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
    if (allowJunctions) return
    const trimmed = query.trim()
    const googleQuery = eventGeocodeQuery(roadName, trimmed)
    const fetchWhileClosed = roadName != null
    if (!googleQuery || (!open && !fetchWhileClosed)) {
      if (!open && !fetchWhileClosed) setPredictions([])
      if (!googleQuery) setPredictions([])
      return
    }
    if (!hasGoogleMapsApiKey()) {
      notifyUnavailable()
      setPredictions([])
      return
    }

    let cancelled = false
    const handle = window.setTimeout(() => {
      void fetchPlacePredictions(googleQuery, sessionRef.current).then((result) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/query/roadName only
  }, [allowJunctions, query, open, roadName])

  useEffect(() => {
    if (!allowJunctions) {
      setJunctions([])
      setIsSearching(false)
      setLocalSearchFailed(false)
      return
    }
    const trimmed = query.trim()
    if (!open || !trimmed) {
      setJunctions([])
      setPredictions([])
      setIsSearching(false)
      setLocalSearchFailed(false)
      return
    }
    const googleQuery = eventGeocodeQuery(roadName, trimmed)
    if (!googleQuery) return

    let cancelled = false
    setJunctions([])
    setPredictions([])
    setIsSearching(true)
    setLocalSearchFailed(false)
    const handle = window.setTimeout(() => {
      void searchLocationSuggestionsCombined({
        localQuery: trimmed,
        googleQuery,
        sessionToken: sessionRef.current,
        searchJunctions: searchHighwayJunctions,
        searchPlaces: fetchPlacePredictions,
      })
        .then((result) => {
          if (cancelled) return
          if (result.localError) {
            console.error('searchHighwayJunctions failed', result.localError)
          }
          setLocalSearchFailed(Boolean(result.localError))
          setJunctions(result.junctions)
          if (!result.places.ok) {
            notifyUnavailable()
            setPredictions([])
          } else {
            setPredictions(result.places.predictions)
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
    // notifyUnavailable reads refs; intentionally omit callback from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search inputs only
  }, [allowJunctions, query, open, roadName])

  const freeTextLabel = query.trim()
    ? `שימוש ב־"${query.trim()}" כפי שהוזן`
    : 'שימוש בטקסט שהוזן'

  const rankedOptions = allowJunctions
    ? rankLocationSuggestions(junctions, predictions, query, allowFreeText)
    : [
        ...(allowFreeText && query.trim()
          ? [{ kind: 'free_text' as const, text: query.trim() }]
          : []),
        ...predictions.map((prediction) => ({ kind: 'google' as const, prediction })),
      ]
  const optionCount = rankedOptions.length

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
    if (last.location_place_id || last.location.trim()) {
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
    const next = {
      location: details.place.label,
      location_place_id: details.place.placeId,
      location_lat: details.place.lat,
      location_lng: details.place.lng,
    }
    onChange(next)
    onPlaceCommit?.(next)
    setQuery(details.place.label)
    setOpen(false)
  }

  function commitJunction(junction: HighwayJunction) {
    const location = junctionLocationLabel(junction.name_he, query)
    const next = {
      location,
      location_place_id: junctionPlaceId(junction.id),
      location_lat: junction.lat,
      location_lng: junction.lng,
    }
    onChange(next)
    onPlaceCommit?.(next)
    onJunctionCommit?.(junction)
    setQuery(location)
    setOpen(false)
  }

  function selectIndex(index: number) {
    const option = rankedOptions[index]
    if (!option) return
    if (option.kind === 'junction') commitJunction(option.junction)
    else if (option.kind === 'google') void commitGoogle(option.prediction)
    else commitFreeText(option.text)
  }

  return (
    <div
      className={['field', 'location-places', hideLabel ? 'location-places--compact' : '']
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      <FieldLabel htmlFor={fieldId} required={required} hide={hideLabel}>
        {label}
      </FieldLabel>
      <div className="field__control location-places__control">
        <input
          id={fieldId}
          className="field__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            open && optionCount > 0 ? `${listboxId}-opt-${highlight}` : undefined
          }
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
              if (optionCount > 0) {
                setHighlight((current) => Math.min(current + 1, optionCount - 1))
              }
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
            {isSearching ? (
              <li className="location-places__status" role="presentation">
                <span role="status">מחפשים צמתים ומקומות…</span>
              </li>
            ) : null}
            {localSearchFailed ? (
              <li className="location-places__status" role="presentation">
                <span role="status">חיפוש הצמתים אינו זמין כרגע.</span>
              </li>
            ) : null}
            {rankedOptions.map((option, index) => {
              const previousKind = rankedOptions[index - 1]?.kind
              const showGroupLabel =
                option.kind !== 'free_text' && option.kind !== previousKind
              const groupLabel =
                option.kind === 'junction' ? 'צמתים ומחלפים' : 'תוצאות ממפות Google'
              return (
                <Fragment
                  key={
                    option.kind === 'junction'
                      ? `junction-${option.junction.id}`
                      : option.kind === 'google'
                        ? `google-${option.prediction.placeId}`
                        : 'free-text'
                  }
                >
                  {showGroupLabel ? (
                    <li className="location-places__group-label" role="presentation">
                      {groupLabel}
                    </li>
                  ) : null}
                  <li
                    id={`${listboxId}-opt-${index}`}
                    role="option"
                    aria-selected={highlight === index}
                    className={[
                      'location-places__option',
                      option.kind === 'junction' ? 'location-places__option--junction' : '',
                      option.kind === 'free_text' ? 'location-places__option--free' : '',
                      highlight === index ? 'location-places__option--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      selectIndex(index)
                    }}
                  >
                    {option.kind === 'junction' ? (
                      <>
                        <span className="location-places__primary">
                          {option.junction.name_he}
                        </span>
                        {option.junction.roads ? (
                          <span className="location-places__secondary">
                            כביש {option.junction.roads}
                          </span>
                        ) : null}
                      </>
                    ) : option.kind === 'google' ? (
                      <>
                        <span className="location-places__primary">
                          {option.prediction.primaryText}
                        </span>
                        {option.prediction.secondaryText ? (
                          <span className="location-places__secondary">
                            {option.prediction.secondaryText}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      freeTextLabel
                    )}
                  </li>
                </Fragment>
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
