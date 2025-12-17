/**
 * Normalize income value with multiplier (default 1.9x as per Rust implementation)
 * This multiplier adjusts reported income to estimated real income
 */
export function normalizeIncome(renda: string | number | undefined | null, multiplier: number = 1.9): number | null {
  if (renda === undefined || renda === null || renda === '') {
    return null
  }

  let value: number

  if (typeof renda === 'string') {
    // Remove currency symbols, dots (thousands), and replace comma with dot
    const cleaned = renda.replace(/[R$\s.]/g, '').replace(',', '.')
    value = parseFloat(cleaned)
  } else {
    value = renda
  }

  if (isNaN(value) || value <= 0) {
    return null
  }

  // Apply the multiplier (default 1.9x)
  return Math.round(value * multiplier * 100) / 100
}

/**
 * Normalize CPF to digits only
 */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '').padStart(11, '0')
}

/**
 * Validate CPF format and check digit
 */
export function isValidCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf)

  if (digits.length !== 11) return false

  // Check for known invalid patterns
  if (/^(\d)\1+$/.test(digits)) return false

  // Validate check digits
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i)
  }
  let remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  if (remainder !== parseInt(digits[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  if (remainder !== parseInt(digits[10])) return false

  return true
}

/**
 * Format CPF for display: XXX.XXX.XXX-XX
 */
export function formatCpf(cpf: string): string {
  const digits = normalizeCpf(cpf)
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/**
 * Normalize name (capitalize, remove extra spaces)
 */
export function normalizeName(name: string | undefined | null): string | null {
  if (!name) return null

  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
}

/**
 * Normalize email to lowercase and trim
 */
export function normalizeEmail(email: string | undefined | null): string | null {
  if (!email) return null
  return email.trim().toLowerCase()
}
