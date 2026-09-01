import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { padBbox, type LatLngBbox } from './mapCatalogView'
import {
  isNumberedRoadType,
  milePostTooltip,
  milePostsInView,
  parseMilePosts,
  shouldShowMilePosts,
  type MilePost,
} from './milePosts'

const telAviv: LatLngBbox = {
  south: 32.0,
  west: 34.7,
  north: 32.2,
  east: 34.9,
}

describe('isNumberedRoadType', () => {
  it('keeps כביש and drops רמפה', () => {
    expect(isNumberedRoadType('כביש')).toBe(true)
    expect(isNumberedRoadType('רמפה')).toBe(false)
    expect(isNumberedRoadType('  כביש  ')).toBe(true)
  })
})

describe('milePostTooltip', () => {
  it('uses כביש n · ק״מ k', () => {
    expect(milePostTooltip({ road: '4', km: 42, lat: 32, lng: 34.8 })).toBe('כביש 4 · ק״מ 42')
  })
})

describe('shouldShowMilePosts', () => {
  it('stays off when the layer is unchecked', () => {
    expect(shouldShowMilePosts(false, 14, 10)).toBe(false)
  })

  it('waits for street zoom, not city zoom', () => {
    expect(shouldShowMilePosts(true, 13, 10)).toBe(false)
    expect(shouldShowMilePosts(true, 14, 10)).toBe(true)
  })

  it('hides a dense zoom-14 viewport until zoom 15', () => {
    expect(shouldShowMilePosts(true, 14, 400)).toBe(true)
    expect(shouldShowMilePosts(true, 14, 401)).toBe(false)
    expect(shouldShowMilePosts(true, 15, 401)).toBe(true)
  })
})

describe('parseMilePosts', () => {
  it('keeps valid rows and drops junk', () => {
    expect(
      parseMilePosts([
        { road: '90', km: 12, lat: 31.2, lng: 35.1 },
        { road: '', km: 1, lat: 31, lng: 35 },
        { km: 1, lat: 31, lng: 35 },
        { road: '1', km: 0, lat: 31, lng: 35 },
        { road: '4', km: 2.4, lat: 31, lng: 35 },
      ]),
    ).toEqual([{ road: '90', km: 12, lat: 31.2, lng: 35.1 }])
  })
})

describe('milePostsInView', () => {
  it('uses the padded catalog bbox', () => {
    const posts = [
      { road: '2', km: 10, lat: 32.1, lng: 34.8 },
      { road: '4', km: 1, lat: 29.5, lng: 34.9 },
    ]
    const inView = milePostsInView(posts, telAviv)
    expect(inView.map((row) => row.road)).toEqual(['2'])
    const padded = padBbox(telAviv)
    expect(inView[0]!.lat).toBeGreaterThanOrEqual(padded.south)
  })
})

describe('bundled mile posts', () => {
  const posts = parseMilePosts(
    JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/mile-posts.json'), 'utf8')),
  ) as MilePost[]

  it('is numbered roads only, inside Israel', () => {
    expect(posts).toHaveLength(6325)
    expect(posts.every((row) => Number.isInteger(row.km) && row.km >= 1)).toBe(true)
    expect(posts.some((row) => row.road === '1')).toBe(true)
    expect(posts.some((row) => row.road === '90')).toBe(true)
    const lats = posts.map((row) => row.lat)
    const lngs = posts.map((row) => row.lng)
    expect(Math.min(...lats)).toBeGreaterThan(29.4)
    expect(Math.max(...lats)).toBeLessThan(33.4)
    expect(Math.min(...lngs)).toBeGreaterThan(34.2)
    expect(Math.max(...lngs)).toBeLessThan(35.9)
  })

  it('matches EPSG:2039→WGS84 for a known SHP sample (not bare TM)', () => {
    // road 444 km 14 — SHP 195131.4718, 661328.9367 via cs2cs EPSG:2039 EPSG:4326
    const sample = posts.find((row) => row.road === '444' && row.km === 14)
    expect(sample).toEqual({ road: '444', km: 14, lat: 32.044924, lng: 34.946894 })
  })
})
