/**
 * Data Normalization Utilities Tests
 * TSC-28: Unit tests for normalize utilities
 */
import { describe, expect, test } from 'bun:test'
import {
  normalizeName,
  normalizeCpf,
  validateCpf,
  normalizeIncome,
  parseBrazilianDate,
  normalizeAddress,
  formatCpf
} from '../../src/utils/normalize'

describe('normalizeName', () => {
  test('converts to uppercase', () => {
    expect(normalizeName('João Silva')).toBe('JOAO SILVA')
  })

  test('removes accents', () => {
    expect(normalizeName('José María Ñoño')).toBe('JOSE MARIA NONO')
  })

  test('collapses multiple spaces', () => {
    expect(normalizeName('João   da   Silva')).toBe('JOAO DA SILVA')
  })

  test('trims whitespace', () => {
    expect(normalizeName('  João Silva  ')).toBe('JOAO SILVA')
  })

  test('returns null for empty string', () => {
    expect(normalizeName('')).toBeNull()
  })

  test('returns null for null input', () => {
    expect(normalizeName(null)).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(normalizeName(undefined)).toBeNull()
  })
})

describe('normalizeCpf', () => {
  test('extracts digits from formatted CPF', () => {
    expect(normalizeCpf('123.456.789-09')).toBe('12345678909')
  })

  test('keeps valid 11-digit CPF', () => {
    expect(normalizeCpf('12345678909')).toBe('12345678909')
  })

  test('returns null for wrong length', () => {
    expect(normalizeCpf('123456789')).toBeNull()
    expect(normalizeCpf('123456789012')).toBeNull()
  })

  test('returns null for all same digits', () => {
    expect(normalizeCpf('11111111111')).toBeNull()
    expect(normalizeCpf('00000000000')).toBeNull()
  })

  test('returns null for null/undefined', () => {
    expect(normalizeCpf(null)).toBeNull()
    expect(normalizeCpf(undefined)).toBeNull()
  })
})

describe('validateCpf', () => {
  test('validates correct CPF', () => {
    // Valid CPFs (generated for testing)
    expect(validateCpf('529.982.247-25')).toBe(true)
    expect(validateCpf('52998224725')).toBe(true)
  })

  test('rejects invalid check digits', () => {
    expect(validateCpf('123.456.789-00')).toBe(false)
    expect(validateCpf('12345678900')).toBe(false)
  })

  test('rejects all same digits', () => {
    expect(validateCpf('111.111.111-11')).toBe(false)
    expect(validateCpf('000.000.000-00')).toBe(false)
  })

  test('rejects wrong length', () => {
    expect(validateCpf('123')).toBe(false)
  })
})

describe('normalizeIncome', () => {
  test('applies 1.9x multiplier by default', () => {
    expect(normalizeIncome(1000)).toBe(1900)
  })

  test('parses Brazilian currency format', () => {
    expect(normalizeIncome('R$ 1.000,00')).toBe(1900)
  })

  test('parses string with comma decimal', () => {
    expect(normalizeIncome('1500,50')).toBe(2850.95)
  })

  test('accepts custom multiplier', () => {
    expect(normalizeIncome(1000, 2.0)).toBe(2000)
  })

  test('returns null for null/undefined', () => {
    expect(normalizeIncome(null)).toBeNull()
    expect(normalizeIncome(undefined)).toBeNull()
  })

  test('returns null for zero or negative', () => {
    expect(normalizeIncome(0)).toBeNull()
    expect(normalizeIncome(-100)).toBeNull()
  })

  test('returns null for invalid string', () => {
    expect(normalizeIncome('abc')).toBeNull()
  })
})

describe('parseBrazilianDate', () => {
  test('parses DD/MM/YYYY format', () => {
    const result = parseBrazilianDate('25/12/1990')
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(1990)
    expect(result!.getMonth()).toBe(11) // December = 11
    expect(result!.getDate()).toBe(25)
  })

  test('parses YYYY-MM-DD format', () => {
    const result = parseBrazilianDate('1990-12-25')
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(1990)
  })

  test('returns null for invalid format', () => {
    expect(parseBrazilianDate('12-25-1990')).toBeNull()
    expect(parseBrazilianDate('invalid')).toBeNull()
  })

  test('returns null for null/undefined', () => {
    expect(parseBrazilianDate(null)).toBeNull()
    expect(parseBrazilianDate(undefined)).toBeNull()
  })
})

describe('normalizeAddress', () => {
  test('normalizes all address fields', () => {
    const result = normalizeAddress({
      logradouro: 'Rua das Flores',
      logradouroNumero: '123',
      complemento: 'Apto 45',
      bairro: 'Centro',
      cidade: 'São Paulo',
      uf: 'sp',
      cep: '01234-567'
    })

    expect(result.street).toBe('RUA DAS FLORES')
    expect(result.number).toBe('123')
    expect(result.complement).toBe('Apto 45')
    expect(result.neighborhood).toBe('CENTRO')
    expect(result.city).toBe('SAO PAULO')
    expect(result.state).toBe('SP')
    expect(result.zipCode).toBe('01234567')
  })

  test('handles missing fields', () => {
    const result = normalizeAddress({
      cidade: 'Rio de Janeiro',
      uf: 'RJ'
    })

    expect(result.street).toBeNull()
    expect(result.number).toBeNull()
    expect(result.city).toBe('RIO DE JANEIRO')
    expect(result.state).toBe('RJ')
  })

  test('uses numero as fallback for number', () => {
    const result = normalizeAddress({
      numero: '456'
    })
    expect(result.number).toBe('456')
  })
})

describe('formatCpf', () => {
  test('formats 11 digits to XXX.XXX.XXX-XX', () => {
    expect(formatCpf('12345678909')).toBe('123.456.789-09')
  })

  test('returns original for wrong length', () => {
    expect(formatCpf('123')).toBe('123')
  })

  test('handles already formatted input', () => {
    expect(formatCpf('123.456.789-09')).toBe('123.456.789-09')
  })
})
