/**
 * Phone Validation Utilities Tests
 * TSC-28: Unit tests for phone utilities
 */
import { describe, expect, test } from 'bun:test'
import { validateBrazilianPhone, normalizePhone, formatPhone } from '../../src/utils/phone'

describe('validateBrazilianPhone', () => {
  test('validates mobile number with 11 digits', () => {
    const result = validateBrazilianPhone('11987654321')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('11987654321')
    expect(result.isMobile).toBe(true)
    expect(result.countryCode).toBe('55')
  })

  test('validates landline number with 10 digits', () => {
    const result = validateBrazilianPhone('1132654321')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('1132654321')
    expect(result.isMobile).toBe(false)
  })

  test('validates number with +55 prefix', () => {
    const result = validateBrazilianPhone('+5511987654321')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('11987654321')
  })

  test('validates number with 55 prefix (no +)', () => {
    const result = validateBrazilianPhone('5511987654321')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('11987654321')
  })

  test('validates formatted number with parentheses and dashes', () => {
    const result = validateBrazilianPhone('(11) 98765-4321')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('11987654321')
  })

  test('rejects too short number', () => {
    const result = validateBrazilianPhone('123456')
    expect(result.isValid).toBe(false)
    expect(result.normalized).toBeNull()
  })

  test('rejects empty string', () => {
    const result = validateBrazilianPhone('')
    expect(result.isValid).toBe(false)
  })

  test('handles number with spaces', () => {
    const result = validateBrazilianPhone('11 9 8765 4321')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('11987654321')
  })
})

describe('normalizePhone', () => {
  test('removes country code 55', () => {
    expect(normalizePhone('5511987654321')).toBe('11987654321')
  })

  test('removes +55 prefix', () => {
    expect(normalizePhone('+5511987654321')).toBe('11987654321')
  })

  test('removes formatting characters', () => {
    expect(normalizePhone('(11) 98765-4321')).toBe('11987654321')
  })

  test('keeps number without country code unchanged', () => {
    expect(normalizePhone('11987654321')).toBe('11987654321')
  })

  test('handles landline number', () => {
    expect(normalizePhone('1132654321')).toBe('1132654321')
  })
})

describe('formatPhone', () => {
  test('formats mobile number (11 digits)', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321')
  })

  test('formats landline number (10 digits)', () => {
    expect(formatPhone('1132654321')).toBe('(11) 3265-4321')
  })

  test('handles already formatted input', () => {
    expect(formatPhone('(11) 98765-4321')).toBe('(11) 98765-4321')
  })

  test('returns original for invalid length', () => {
    expect(formatPhone('123')).toBe('123')
  })
})
