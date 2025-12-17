import { describe, expect, test } from 'bun:test'
import { normalizePhone, formatPhone, isValidPhone, formatPhoneWithCountryCode } from '../../src/utils/phone'

describe('normalizePhone', () => {
  test('removes country code 55', () => {
    expect(normalizePhone('5511999998888')).toBe('11999998888')
    expect(normalizePhone('55 11 99999-8888')).toBe('11999998888')
  })

  test('removes non-digit characters', () => {
    expect(normalizePhone('(11) 99999-8888')).toBe('11999998888')
    expect(normalizePhone('11.99999.8888')).toBe('11999998888')
  })

  test('keeps number without country code', () => {
    expect(normalizePhone('11999998888')).toBe('11999998888')
    expect(normalizePhone('1133334444')).toBe('1133334444')
  })
})

describe('formatPhone', () => {
  test('formats mobile number', () => {
    expect(formatPhone('11999998888')).toBe('(11) 99999-8888')
  })

  test('formats landline number', () => {
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444')
  })
})

describe('isValidPhone', () => {
  test('validates correct phone numbers', () => {
    expect(isValidPhone('11999998888')).toBe(true)
    expect(isValidPhone('1133334444')).toBe(true)
  })

  test('rejects invalid phone numbers', () => {
    expect(isValidPhone('123')).toBe(false)
    expect(isValidPhone('123456789012')).toBe(false)
  })
})

describe('formatPhoneWithCountryCode', () => {
  test('adds country code 55', () => {
    expect(formatPhoneWithCountryCode('11999998888')).toBe('5511999998888')
    expect(formatPhoneWithCountryCode('5511999998888')).toBe('5511999998888')
  })
})
