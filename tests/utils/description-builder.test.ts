import { describe, expect, test } from 'bun:test'
import { buildDescription, buildSimpleDescription } from '../../src/utils/description-builder'
import type { WorkApiPerson } from '../../src/services/work-api.service'

describe('buildDescription', () => {
  test('builds description with all fields', () => {
    const person: WorkApiPerson = {
      cpf: '12345678909',
      nome: 'João Silva',
      dataNascimento: '1990-01-15',
      sexo: 'M',
      nomeMae: 'Maria Silva',
      renda: 5000,
      patrimonio: 100000,
      profissao: 'Engenheiro',
      escolaridade: 'Superior Completo',
      estadoCivil: 'Casado',
      telefones: [{ numero: '11999998888', tipo: 'celular' }],
      emails: [{ email: 'joao@email.com' }],
      enderecos: [
        {
          logradouro: 'Rua das Flores',
          numero: '123',
          bairro: 'Centro',
          cidade: 'São Paulo',
          uf: 'SP',
          cep: '01234-567',
        },
      ],
    }

    const description = buildDescription(person, 'Campanha Teste')

    expect(description).toContain('=== DADOS ENRIQUECIDOS ===')
    expect(description).toContain('CPF: 123.456.789-09')
    expect(description).toContain('Nome: João Silva')
    expect(description).toContain('Renda: R$')
    expect(description).toContain('Profissão: Engenheiro')
    expect(description).toContain('(11) 99999-8888')
    expect(description).toContain('joao@email.com')
    expect(description).toContain('Rua das Flores')
    expect(description).toContain('Campanha: Campanha Teste')
    expect(description).toContain('=== FIM DOS DADOS ===')
  })

  test('handles minimal data', () => {
    const person: WorkApiPerson = {
      cpf: '12345678909',
      nome: 'João Silva',
    }

    const description = buildDescription(person)

    expect(description).toContain('CPF: 123.456.789-09')
    expect(description).toContain('Nome: João Silva')
    expect(description).not.toContain('Campanha:')
  })
})

describe('buildSimpleDescription', () => {
  test('builds simple description', () => {
    const description = buildSimpleDescription('João Silva', '11999998888', 'joao@email.com', 'Campanha Teste')

    expect(description).toContain('=== LEAD NÃO ENRIQUECIDO ===')
    expect(description).toContain('Nome: João Silva')
    expect(description).toContain('Telefone: (11) 99999-8888')
    expect(description).toContain('Email: joao@email.com')
    expect(description).toContain('Campanha: Campanha Teste')
  })

  test('handles missing optional fields', () => {
    const description = buildSimpleDescription('João Silva')

    expect(description).toContain('Nome: João Silva')
    expect(description).not.toContain('Telefone:')
    expect(description).not.toContain('Email:')
  })
})
