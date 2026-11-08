import { describe, expect, it } from 'vitest'
import { comboboxInput, comboboxKeyDown, isHandled, type ComboboxState } from './comboboxKeys'

const open = (active = -1, query = 'דני'): ComboboxState => ({ open: true, active, query })
const key = (k: string, extra: Record<string, boolean> = {}) => ({ key: k, ...extra })

describe('comboboxKeyDown', () => {
  it('ArrowDown from nothing highlighted goes to the first option, ArrowUp to the last', () => {
    expect(comboboxKeyDown(open(), key('ArrowDown'), 4)).toMatchObject({ type: 'move', state: { active: 0 } })
    expect(comboboxKeyDown(open(), key('ArrowUp'), 4)).toMatchObject({ type: 'move', state: { active: 3 } })
  })
  it('moves through one flat list and wraps at both ends', () => {
    expect(comboboxKeyDown(open(1), key('ArrowDown'), 4)).toMatchObject({ state: { active: 2 } })
    expect(comboboxKeyDown(open(3), key('ArrowDown'), 4)).toMatchObject({ state: { active: 0 } })
    expect(comboboxKeyDown(open(0), key('ArrowUp'), 4)).toMatchObject({ state: { active: 3 } })
  })
  it('an arrow on a closed panel opens it without highlighting', () => {
    expect(comboboxKeyDown({ open: false, active: -1, query: 'x' }, key('ArrowDown'), 4)).toMatchObject({
      type: 'move',
      state: { open: true, active: -1 },
    })
  })
  it('with no options the arrows keep nothing highlighted', () => {
    expect(comboboxKeyDown(open(), key('ArrowDown'), 0)).toMatchObject({ state: { active: -1 } })
  })
  it('Enter opens the highlighted option', () => {
    expect(comboboxKeyDown(open(2), key('Enter'), 4)).toMatchObject({ type: 'pick', index: 2, state: { open: false } })
  })
  it('Enter with nothing highlighted runs the full search', () => {
    expect(comboboxKeyDown(open(), key('Enter'), 4)).toMatchObject({ type: 'submit' })
    expect(comboboxKeyDown({ open: false, active: -1, query: 'x' }, key('Enter'), 0)).toMatchObject({ type: 'submit' })
  })
  it('⌘Enter and Ctrl+Enter open the results page even with a row highlighted', () => {
    expect(comboboxKeyDown(open(1), key('Enter', { metaKey: true }), 4)).toMatchObject({ type: 'results' })
    expect(comboboxKeyDown(open(1), key('Enter', { ctrlKey: true }), 4)).toMatchObject({ type: 'results' })
  })
  it('Escape closes the panel first, then clears the field, then does nothing', () => {
    const first = comboboxKeyDown(open(1), key('Escape'), 4)
    expect(first).toMatchObject({ type: 'close', state: { open: false, query: 'דני' } })
    if (first.type !== 'close') throw new Error('expected close')
    expect(comboboxKeyDown(first.state, key('Escape'), 4)).toMatchObject({ type: 'clear', state: { query: '' } })
    expect(isHandled(comboboxKeyDown({ open: false, active: -1, query: '' }, key('Escape'), 0))).toBe(false)
  })
  it('Tab closes the panel and is not handled, so focus moves on', () => {
    const action = comboboxKeyDown(open(2), key('Tab'), 4)
    expect(action).toMatchObject({ type: 'close', state: { open: false, active: -1 } })
    expect(comboboxKeyDown({ open: false, active: -1, query: 'x' }, key('Tab'), 4).type).toBe('none')
  })
  it('Home and End jump only while a row is highlighted, so the caret still moves in the text', () => {
    expect(comboboxKeyDown(open(2), key('End'), 4)).toMatchObject({ state: { active: 3 } })
    expect(comboboxKeyDown(open(2), key('Home'), 4)).toMatchObject({ state: { active: 0 } })
    expect(comboboxKeyDown(open(), key('Home'), 4).type).toBe('none')
  })
  it('ignores keys while an IME composes and other keys', () => {
    expect(comboboxKeyDown(open(1), key('Enter', { isComposing: true }), 4).type).toBe('none')
    expect(comboboxKeyDown(open(1), key('a'), 4).type).toBe('none')
  })
})

describe('comboboxInput', () => {
  it('reopens the panel and drops the highlight', () => {
    expect(comboboxInput('דנ')).toEqual({ open: true, active: -1, query: 'דנ' })
  })
})
