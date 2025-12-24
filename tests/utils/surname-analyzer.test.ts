import { describe, expect, test } from 'bun:test';
import {
  extractSurnames,
  analyzeSurname,
  analyzeFullName,
  detectFamilyConnection,
  detectConcatenatedName,
  isInternationalPhone,
  calculateLeadScore,
} from '../../src/utils/surname-analyzer';

describe('surname-analyzer', () => {
  describe('extractSurnames', () => {
    test('extracts surnames from full name', () => {
      const surnames = extractSurnames('João da Silva Santos');
      expect(surnames).toContain('silva');
      expect(surnames).toContain('santos');
      expect(surnames).not.toContain('da');
    });

    test('handles single name', () => {
      const surnames = extractSurnames('João');
      expect(surnames).toHaveLength(0);
    });

    test('removes prepositions', () => {
      const surnames = extractSurnames('Maria de Souza e Lima');
      expect(surnames).not.toContain('de');
      expect(surnames).not.toContain('e');
      expect(surnames).toContain('souza');
      expect(surnames).toContain('lima');
    });
  });

  describe('analyzeSurname', () => {
    test('detects notable family - Rudge', () => {
      const result = analyzeSurname('Rudge');
      expect(result.isNotableFamily).toBe(true);
      expect(result.isRare).toBe(true);
      expect(result.familyContext).toContain('bancária');
    });

    test('detects notable family - Safra', () => {
      const result = analyzeSurname('Safra');
      expect(result.isNotableFamily).toBe(true);
      expect(result.relatedPeople).toContain('Banco Safra');
    });

    test('detects rare surname - Passafaro', () => {
      const result = analyzeSurname('Passafaro');
      expect(result.isRare).toBe(true);
      expect(result.isNotableFamily).toBe(false);
    });

    test('detects rare surname - Falabella', () => {
      const result = analyzeSurname('Falabella');
      expect(result.isRare).toBe(true);
    });

    test('detects common surname - Silva', () => {
      const result = analyzeSurname('Silva');
      expect(result.isRare).toBe(false);
      expect(result.isNotableFamily).toBe(false);
    });

    test('detects common surname - Santos', () => {
      const result = analyzeSurname('Santos');
      expect(result.isRare).toBe(false);
    });
  });

  describe('detectFamilyConnection', () => {
    test('detects spouse with same surname', () => {
      const result = detectFamilyConnection('Luiz Godinho', 'Adriana Godinho');
      expect(result.type).toBe('spouse');
      expect(result.sharedSurname).toBe('godinho');
      expect(result.confidence).toBeGreaterThan(80);
    });

    test('returns none when no shared surname', () => {
      const result = detectFamilyConnection('João Silva', 'Maria Santos');
      expect(result.type).toBe('none');
    });

    test('detects connection with compound surname', () => {
      const result = detectFamilyConnection(
        'Lucia Leal Rudge',
        'José Antonio Rudge'
      );
      expect(result.type).toBe('spouse');
      expect(result.sharedSurname).toBe('rudge');
    });
  });

  describe('detectConcatenatedName', () => {
    test('detects CamelCase concatenation', () => {
      const result = detectConcatenatedName('MartaRabello');
      expect(result.detected).toBe(true);
      expect(result.firstName).toBe('Marta');
      expect(result.lastName).toBe('Rabello');
    });

    test('detects lowercase concatenation with known surname', () => {
      const result = detectConcatenatedName('martarabello');
      expect(result.detected).toBe(true);
      expect(result.firstName?.toLowerCase()).toBe('marta');
      expect(result.lastName?.toLowerCase()).toBe('rabello');
    });

    test('returns not detected for normal name', () => {
      const result = detectConcatenatedName('João Silva');
      expect(result.detected).toBe(false);
    });

    test('returns not detected for single short name', () => {
      const result = detectConcatenatedName('João');
      expect(result.detected).toBe(false);
    });
  });

  describe('isInternationalPhone', () => {
    test('detects South African phone', () => {
      const result = isInternationalPhone('+27123456789');
      expect(result.isInternational).toBe(true);
      expect(result.country).toBe('África do Sul');
    });

    test('detects US phone', () => {
      const result = isInternationalPhone('+1234567890');
      expect(result.isInternational).toBe(true);
      expect(result.country).toBe('Estados Unidos/Canadá');
    });

    test('detects Brazilian phone as not international', () => {
      const result = isInternationalPhone('+5511999998888');
      expect(result.isInternational).toBe(false);
    });

    test('handles phone without plus sign', () => {
      const result = isInternationalPhone('5511999998888');
      expect(result.isInternational).toBe(false);
    });
  });

  describe('calculateLeadScore', () => {
    test('calculates platinum tier for notable family', () => {
      const result = calculateLeadScore({
        hasRareSurname: true,
        isNotableFamily: true,
        hasFamilyConnection: true,
        isInternational: false,
        income: 20000,
      });
      expect(result.tier).toBe('platinum');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    test('calculates gold tier for high income with rare surname', () => {
      const result = calculateLeadScore({
        hasRareSurname: true,
        isNotableFamily: false,
        hasFamilyConnection: false,
        isInternational: false,
        income: 15000,
      });
      expect(result.tier).toBe('gold');
    });

    test('calculates silver tier for international lead', () => {
      const result = calculateLeadScore({
        hasRareSurname: false,
        isNotableFamily: false,
        hasFamilyConnection: true,
        isInternational: true,
        income: 5000,
      });
      expect(result.tier).toBe('silver');
    });

    test('calculates bronze tier for basic lead', () => {
      const result = calculateLeadScore({
        hasRareSurname: false,
        isNotableFamily: false,
        hasFamilyConnection: false,
        isInternational: false,
        income: 5000,
      });
      expect(result.tier).toBe('bronze');
    });

    test('adds property count bonus', () => {
      const withProperties = calculateLeadScore({
        hasRareSurname: false,
        isNotableFamily: false,
        hasFamilyConnection: false,
        isInternational: false,
        propertyCount: 5,
      });

      const withoutProperties = calculateLeadScore({
        hasRareSurname: false,
        isNotableFamily: false,
        hasFamilyConnection: false,
        isInternational: false,
        propertyCount: 0,
      });

      expect(withProperties.score).toBeGreaterThan(withoutProperties.score);
    });
  });
});
