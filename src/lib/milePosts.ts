import { padBbox, pointInBbox, type LatLngBbox } from './mapCatalogView'
import { formatNumber } from './format'

export const MILE_POSTS_URL = '/data/mile-posts.json'
export const MILE_POST_MIN_ZOOM = 14
export const MILE_POST_DENSE_ZOOM = 15
export const MILE_POST_VIEW_CAP = 400
export const MILE_POST_LAYER_LOAD_ERROR = 'טעינת השכבה נכשלה. בדקו את החיבור ונסו שוב.'

export type MilePost = {
  road: string
  km: number
  lat: number
  lng: number
}

export function isNumberedRoadType(typeRoad: string): boolean {
  const value = typeRoad.trim()
  if (value.includes('רמפה')) return false
  return value.includes('כביש')
}

export function isMilePost(value: unknown): value is MilePost {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.road === 'string' &&
    row.road.trim() !== '' &&
    typeof row.km === 'number' &&
    Number.isInteger(row.km) &&
    row.km >= 1 &&
    typeof row.lat === 'number' &&
    Number.isFinite(row.lat) &&
    typeof row.lng === 'number' &&
    Number.isFinite(row.lng)
  )
}

export function parseMilePosts(value: unknown): MilePost[] {
  if (!Array.isArray(value)) return []
  return value.filter(isMilePost).map((row) => ({
    road: row.road.trim(),
    km: row.km,
    lat: row.lat,
    lng: row.lng,
  }))
}

export function milePostTooltip(post: MilePost): string {
  return `כביש ${post.road} · ק״מ ${formatNumber(post.km)}`
}

export function shouldShowMilePosts(layerOn: boolean, zoom: number, inViewCount: number): boolean {
  if (!layerOn || inViewCount <= 0) return false
  if (zoom < MILE_POST_MIN_ZOOM) return false
  if (inViewCount > MILE_POST_VIEW_CAP && zoom < MILE_POST_DENSE_ZOOM) return false
  return true
}

export function milePostsInView(posts: readonly MilePost[], bbox: LatLngBbox): MilePost[] {
  const padded = padBbox(bbox)
  return posts.filter((post) => pointInBbox(post.lat, post.lng, padded))
}

export async function fetchMilePosts(): Promise<MilePost[]> {
  const response = await fetch(MILE_POSTS_URL)
  if (!response.ok) throw new Error(MILE_POST_LAYER_LOAD_ERROR)
  return parseMilePosts(await response.json())
}
