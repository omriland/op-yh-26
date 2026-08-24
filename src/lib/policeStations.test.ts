import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  coversIsraelPoliceStations,
  defaultOpsMapLayers,
  isPoliceStationProps,
  policeStationCaption,
  policeStationHoverLabel,
  summarizePoliceStationGeoJson,
  type GeoJsonFeatureCollection,
} from './policeStations'

function loadBundledStations(): GeoJsonFeatureCollection {
  const raw = readFileSync(
    resolve(process.cwd(), 'public/data/police-station-boundaries.geojson'),
    'utf8',
  )
  return JSON.parse(raw) as GeoJsonFeatureCollection
}

describe('defaultOpsMapLayers', () => {
  it('shows police stations until the user unchecks them', () => {
    expect(defaultOpsMapLayers()).toEqual({ policeStations: true })
  })
})

describe('bundled police station boundaries', () => {
  const geo = loadBundledStations()
  const summary = summarizePoliceStationGeoJson(geo)

  it('is a national station-jurisdiction layer, not a handful of points', () => {
    expect(geo.type).toBe('FeatureCollection')
    expect(summary.featureCount).toBe(89)
    expect(coversIsraelPoliceStations(summary)).toBe(true)
    expect(summary.names).toContain('תחנת חיפה')
    expect(summary.names).toContain('תחנת באר שבע')
    expect(summary.names).toContain('תחנת לב תל אביב')
    expect(summary.names).toContain('תחנת לב הבירה')
    expect(summary.names).toContain('מרחב אילת')
  })

  it('keeps Hebrew station names and district fields', () => {
    const first = geo.features[0]?.properties
    expect(isPoliceStationProps(first)).toBe(true)
    if (!isPoliceStationProps(first)) return
    expect(policeStationCaption(first)).toContain(first.TahanaName)
    expect(policeStationCaption(first)).toContain(first.MahozName)
    expect(policeStationHoverLabel(first)).toMatch(/^תחנת /)
  })

  it('labels hover as תחנת X even when the feature is a merhav', () => {
    const eilat = geo.features.find((row) => row.properties.TahanaName === 'מרחב אילת')
    expect(eilat).toBeTruthy()
    if (!isPoliceStationProps(eilat?.properties)) return
    expect(policeStationHoverLabel(eilat.properties)).toMatch(/^תחנת /)
  })
})
