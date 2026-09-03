export const DELETE_DATA_PATH = '/delete-data'

export function isDeleteDataPath(pathname: string): boolean {
  return pathname === DELETE_DATA_PATH || pathname === `${DELETE_DATA_PATH}/`
}
