/**
 * Description Builder Tests
 * TSC-28: Unit tests for enrichment description builder
 */
import { describe, expect, test } from 'bun:test'
import { buildEnrichmentDescription } from '../../src/utils/description-builder'
import type { WorkApiResponse } from '../../src/services/work-api.service'

describe('buildEnrichmentDescription', () => {
  test('builds description with basic data', () => {
    const data: WorkApiResponse = {
      DadosBasicos: {
        nome: 'João Silva',
        cpf: '12345678909',
        dataNascimento: '15/05/1985',
        sexo: 'M',
        nomeMae: 'Maria Silva'
      }
    }

    const result = buildEnrichmentDescription(data)

    expect(result).toContain('DADOS BASICOS')
    expect(result).toContain('Nome: João Silva')
    expect(result).toContain('CPF: 123.456.789-09')
    expect(result).toContain('Nascimento: 15/05/1985')
    expect(result).toContain('Sexo: M')
    expect(result).toContain('Mae: Maria Silva')
  })

  test('applies income multiplier to economic data', () => {
    const data: WorkApiResponse = {
      DadosEconomicos: {
        renda: '1000',
        poderAquisitivo: {
          poderAquisitivoDescricao: 'MEDIO'
        }
      }
    }

    const result = buildEnrichmentDescription(data, { incomeMultiplier: 1.9 })

    expect(result).toContain('DADOS ECONOMICOS')
    expect(result).toContain('1.900,00') // 1000 * 1.9 = 1900
    expect(result).toContain('Fator aplicado: 1.9x')
    expect(result).toContain('Poder Aquisitivo: MEDIO')
  })

  test('includes phone numbers', () => {
    const data: WorkApiResponse = {
      telefones: [
        { telefone: '11987654321', tipo: 'CELULAR', operadora: 'VIVO', whatsapp: 'S' },
        { telefone: '1132654321', tipo: 'FIXO' }
      ]
    }

    const result = buildEnrichmentDescription(data)

    expect(result).toContain('TELEFONES')
    expect(result).toContain('11987654321')
    expect(result).toContain('CELULAR')
    expect(result).toContain('VIVO')
    expect(result).toContain('WhatsApp')
    expect(result).toContain('1132654321')
    expect(result).toContain('FIXO')
  })

  test('limits phones to 5 and shows count', () => {
    const data: WorkApiResponse = {
      telefones: Array(8).fill(null).map((_, i) => ({
        telefone: `1198765432${i}`
      }))
    }

    const result = buildEnrichmentDescription(data)

    expect(result).toContain('... e mais 3 telefone(s)')
  })

  test('includes email addresses', () => {
    const data: WorkApiResponse = {
      emails: [
        { email: 'joao@gmail.com', prioridade: '1', qualidade: 'BOM' },
        { email: 'joao.silva@work.com' }
      ]
    }

    const result = buildEnrichmentDescription(data)

    expect(result).toContain('EMAILS')
    expect(result).toContain('joao@gmail.com')
    expect(result).toContain('Prioridade: 1')
    expect(result).toContain('[BOM]')
    expect(result).toContain('joao.silva@work.com')
  })

  test('includes addresses', () => {
    const data: WorkApiResponse = {
      enderecos: [{
        logradouro: 'Rua das Flores',
        logradouroNumero: '123',
        bairro: 'Centro',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '01234567'
      }]
    }

    const result = buildEnrichmentDescription(data)

    expect(result).toContain('ENDERECOS')
    expect(result).toContain('Rua das Flores')
    expect(result).toContain('123')
    expect(result).toContain('Centro')
    expect(result).toContain('São Paulo')
    expect(result).toContain('SP')
  })

  test('includes companies', () => {
    const data: WorkApiResponse = {
      empresas: [{
        cnpj: '12345678000190',
        razaoSocial: 'Empresa LTDA',
        relacao: 'SOCIO'
      }]
    }

    const result = buildEnrichmentDescription(data)

    expect(result).toContain('EMPRESAS')
    expect(result).toContain('Empresa LTDA')
    expect(result).toContain('SOCIO')
  })

  test('truncates to maxLength', () => {
    const data: WorkApiResponse = {
      DadosBasicos: {
        nome: 'A'.repeat(1000)
      },
      telefones: Array(100).fill(null).map((_, i) => ({
        telefone: `1198765432${i}`
      }))
    }

    const result = buildEnrichmentDescription(data, { maxLength: 500 })

    expect(result.length).toBeLessThanOrEqual(500)
    expect(result).toEndWith('...')
  })

  test('includes header and footer', () => {
    const data: WorkApiResponse = {}
    const result = buildEnrichmentDescription(data)

    expect(result).toContain('=== DADOS ENRIQUECIDOS ===')
    expect(result).toContain('===========================')
    expect(result).toContain('Enriquecido em:')
  })

  test('handles empty data gracefully', () => {
    const data: WorkApiResponse = {}
    const result = buildEnrichmentDescription(data)

    expect(result).toContain('=== DADOS ENRIQUECIDOS ===')
    expect(result.length).toBeGreaterThan(0)
  })
})
