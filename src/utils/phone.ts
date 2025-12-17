/**
 * Normalize phone number by removing country code and non-digits
 * External APIs expect phone without 55 prefix
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')

  // Remove Brazil country code if present
  if (digits.startsWith('55') && digits.length > 10) {
    digits = digits.slice(2)
  }

  return digits
}

/**
 * Format phone for display (with mask)
 */
export function formatPhone(phone: string): string {
  const digits = normalizePhone(phone)

  if (digits.length === 11) {
    // Mobile: (XX) XXXXX-XXXX
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  } else if (digits.length === 10) {
    // Landline: (XX) XXXX-XXXX
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return digits
}

/**
 * Validate if phone has valid Brazilian format
 */
export function isValidPhone(phone: string): boolean {
  const digits = normalizePhone(phone)
  return digits.length >= 10 && digits.length <= 11
}

/**
 * Format phone with country code for storage
 */
export function formatPhoneWithCountryCode(phone: string): string {
  const digits = normalizePhone(phone)
  return `55${digits}`
}
