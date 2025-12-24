import { describe, expect, test } from 'bun:test';
import {
  formatInsightMessage,
  createFamilyConnectionInsight,
  createRareSurnameInsight,
  createNotableFamilyInsight,
  createHighIncomeInsight,
  createInternationalInsight,
  createMultiplePropertiesInsight,
  createConcatenatedNameInsight,
  type LeadInsight,
  type InsightContext,
} from '../../src/utils/insight-formatter';

describe('insight-formatter', () => {
  describe('createFamilyConnectionInsight', () => {
    test('creates family connection insight', () => {
      const insight = createFamilyConnectionInsight(
        'Luiz Godinho',
        'Adriana Godinho',
        'Provável cônjuge',
        'godinho'
      );

      expect(insight.type).toBe('family_connection');
      expect(insight.confidence).toBe(85);
      expect(insight.title).toContain('Familiar');
      expect(insight.details).toContain('Lead: Luiz Godinho');
      expect(insight.details).toContain('CPF encontrado: Adriana Godinho');
    });
  });

  describe('createNotableFamilyInsight', () => {
    test('creates notable family insight', () => {
      const insight = createNotableFamilyInsight(
        'rudge',
        'Família bancária tradicional',
        ['José Rudge', 'Lala Rudge']
      );

      expect(insight.type).toBe('notable_family');
      expect(insight.confidence).toBe(95);
      expect(insight.title).toContain('Rudge');
      expect(insight.recommendation).toContain('PRIORITÁRIO');
    });
  });

  describe('createHighIncomeInsight', () => {
    test('creates high income insight', () => {
      const insight = createHighIncomeInsight(25000, 30000);

      expect(insight.type).toBe('high_income');
      expect(insight.confidence).toBe(95);
      expect(insight.details[0]).toContain('R$');
      expect(insight.details[0]).toContain('25.000');
    });

    test('includes tier for ultra-high income', () => {
      const insight = createHighIncomeInsight(60000);
      expect(insight.details.some((d) => d.includes('Ultra-alto'))).toBe(true);
    });
  });

  describe('createRareSurnameInsight', () => {
    test('creates rare surname insight', () => {
      const insight = createRareSurnameInsight('Passafaro');

      expect(insight.type).toBe('rare_surname');
      expect(insight.title).toContain('Incomum');
      expect(insight.details[0]).toContain('Passafaro');
    });

    test('includes context if provided', () => {
      const insight = createRareSurnameInsight(
        'Falabella',
        'Origem italiana'
      );

      expect(insight.details).toContain('Origem italiana');
    });
  });

  describe('createInternationalInsight', () => {
    test('creates international insight', () => {
      const insight = createInternationalInsight(
        'África do Sul',
        '+27123456789'
      );

      expect(insight.type).toBe('international');
      expect(insight.title).toContain('Internacional');
      expect(insight.title).toContain('África do Sul');
    });
  });

  describe('createMultiplePropertiesInsight', () => {
    test('creates multiple properties insight', () => {
      const insight = createMultiplePropertiesInsight(7, [
        'São Paulo',
        'Rio de Janeiro',
      ]);

      expect(insight.type).toBe('multiple_properties');
      expect(insight.details[0]).toContain('7 imóveis');
      expect(insight.recommendation).toContain('Investidor');
    });
  });

  describe('createConcatenatedNameInsight', () => {
    test('creates concatenated name insight', () => {
      const insight = createConcatenatedNameInsight(
        'Martarabello',
        'Marta',
        'Rabello'
      );

      expect(insight.type).toBe('concatenated_name');
      expect(insight.details).toContain('Nome recebido: Martarabello');
      expect(insight.details).toContain('Interpretação: Marta Rabello');
    });
  });

  describe('formatInsightMessage', () => {
    test('formats multiple insights into message', () => {
      const insights: LeadInsight[] = [
        createHighIncomeInsight(20000),
        createRareSurnameInsight('Falabella'),
      ];

      const context: InsightContext = {
        leadName: 'João Falabella',
        income: 20000,
        tier: 'gold',
      };

      const message = formatInsightMessage(insights, context);

      expect(message).toContain('INSIGHT AUTOMÁTICO');
      expect(message).toContain('Perfil Descoberto');
      expect(message).toContain('R$');
      expect(message).toContain('Confiança');
      expect(message).toContain('🥇'); // Gold tier emoji
    });

    test('includes indicators section', () => {
      const insights: LeadInsight[] = [createHighIncomeInsight(15000)];

      const context: InsightContext = {
        leadName: 'Test User',
        income: 15000,
        propertyCount: 3,
        addressCount: 5,
      };

      const message = formatInsightMessage(insights, context);

      expect(message).toContain('Indicadores');
      expect(message).toContain('Renda');
      expect(message).toContain('Imóveis');
      expect(message).toContain('Endereços');
    });

    test('returns empty string for no insights', () => {
      const message = formatInsightMessage([], { leadName: 'Test' });
      expect(message).toBe('');
    });

    test('includes recommendation from insights', () => {
      const insights: LeadInsight[] = [
        createNotableFamilyInsight('Safra', 'Família bancária', ['Banco Safra']),
      ];

      const context: InsightContext = {
        leadName: 'Test Safra',
        tier: 'platinum',
      };

      const message = formatInsightMessage(insights, context);

      expect(message).toContain('Recomendação');
      expect(message).toContain('PRIORITÁRIO');
    });

    test('calculates average confidence', () => {
      const insights: LeadInsight[] = [
        { type: 'high_income', confidence: 90, title: 'Test', details: [] },
        { type: 'rare_surname', confidence: 70, title: 'Test', details: [] },
      ];

      const context: InsightContext = { leadName: 'Test' };
      const message = formatInsightMessage(insights, context);

      expect(message).toContain('80%'); // Average of 90 and 70
    });
  });
});
