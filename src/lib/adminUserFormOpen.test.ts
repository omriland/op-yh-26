import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyOpenAdminUserForm,
  clearOpenAdminUserForm,
  readOpenAdminUserForm,
  writeOpenAdminUserForm,
} from './adminUserFormOpen'

const edit = {
  id: 'user-9',
  full_name: 'דנה כהן',
  email: 'dana@example.com',
  callsign: 'D1',
  phone: '050-1234567',
}

function installStorage() {
  const map = new Map<string, string>()
  const store: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  }
  vi.stubGlobal('window', { sessionStorage: store })
  return map
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('open admin user form', () => {
  it('reopens an edit that was still on screen', () => {
    installStorage()
    writeOpenAdminUserForm(edit)
    expect(readOpenAdminUserForm()).toEqual(edit)
  })

  it('reopens a create form that has no user id', () => {
    installStorage()
    const create = { ...edit, id: undefined, full_name: 'חדש' }
    writeOpenAdminUserForm(create)
    expect(readOpenAdminUserForm()).toMatchObject({ full_name: 'חדש' })
    expect(readOpenAdminUserForm()).not.toHaveProperty('id')
  })

  it('drops the marker when the form is closed on purpose', () => {
    installStorage()
    writeOpenAdminUserForm(edit)
    clearOpenAdminUserForm()
    expect(readOpenAdminUserForm()).toBeNull()
  })

  it('ignores a corrupt snapshot', () => {
    const map = installStorage()
    map.set('yahpaz.adminUserForm.open', '{')
    expect(readOpenAdminUserForm()).toBeNull()
    map.set('yahpaz.adminUserForm.open', JSON.stringify({ full_name: 4 }))
    expect(readOpenAdminUserForm()).toBeNull()
  })

  it('applies a stored edit onto an empty form, including the user id', () => {
    const base = { ...edit, id: undefined, full_name: '' }
    expect(applyOpenAdminUserForm(base, edit)).toMatchObject({
      id: 'user-9',
      full_name: 'דנה כהן',
    })
    expect(applyOpenAdminUserForm(base, null)).toBeNull()
    expect(applyOpenAdminUserForm(base, { id: 4, full_name: 'x' })).toBeNull()
  })
})
