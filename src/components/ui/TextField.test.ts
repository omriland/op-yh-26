import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PasswordField, revealedPasswordInputProps } from './TextField'

describe('revealedPasswordInputProps', () => {
  it('leaves a masked password alone and forces LTR only when revealed', () => {
    expect(revealedPasswordInputProps(false)).toEqual({})
    expect(revealedPasswordInputProps(true)).toEqual({
      dir: 'ltr',
      'data-revealed-password': '',
    })
  })

  it('does not mark the masked login field as a revealed password', () => {
    const html = renderToStaticMarkup(
      createElement(PasswordField, {
        label: 'סיסמה',
        name: 'password',
        value: 'Secret1!',
        onChange: () => undefined,
      }),
    )
    expect(html).toContain('type="password"')
    expect(html).not.toContain('data-revealed-password')
  })
})
