#!/usr/bin/env python3
"""
Meilisearch Company Network Analyzer
Analisa conexões entre empresas e sócios no Meilisearch IBVI
"""

import json
import requests
from collections import defaultdict
from typing import List, Dict, Set

MEILISEARCH_URL = "https://ibvi-meilisearch-v2.fly.dev"
MEILISEARCH_KEY = "+irW8+WB+vRVb2pYxvEfR0Cili9zVK/VQY5osx8ejCw="

headers = {
    "Authorization": f"Bearer {MEILISEARCH_KEY}",
    "Content-Type": "application/json"
}

def search_companies(query: str, limit: int = 100) -> List[Dict]:
    """Busca empresas no Meilisearch"""
    url = f"{MEILISEARCH_URL}/indexes/companies/search"
    payload = {
        "q": query,
        "limit": limit
    }

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        return response.json().get("hits", [])
    return []

def get_company_by_cnpj(cnpj: str) -> Dict:
    """Busca empresa específica por CNPJ"""
    url = f"{MEILISEARCH_URL}/indexes/companies/search"
    payload = {
        "filter": f"cnpj = {cnpj}",
        "limit": 1
    }

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        hits = response.json().get("hits", [])
        return hits[0] if hits else None
    return None

def find_companies_by_cpf(cpf: str, limit: int = 50) -> List[Dict]:
    """Busca empresas onde CPF aparece como sócio"""
    url = f"{MEILISEARCH_URL}/indexes/companies/search"
    payload = {
        "q": cpf,
        "limit": limit,
        "attributesToSearchOn": ["socios_cpfs"]
    }

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        return response.json().get("hits", [])
    return []

def build_network(seed_query: str, max_depth: int = 2) -> Dict:
    """
    Constrói rede de conexões a partir de uma empresa seed

    Args:
        seed_query: CNPJ ou nome da empresa inicial
        max_depth: Profundidade máxima de busca

    Returns:
        Dict com empresas, sócios e conexões
    """
    network = {
        "companies": {},
        "socios": {},
        "connections": []
    }

    processed_cnpjs = set()
    processed_cpfs = set()

    # Buscar empresas iniciais
    initial_companies = search_companies(seed_query, limit=10)

    print(f"🔍 Encontradas {len(initial_companies)} empresas iniciais")

    for company in initial_companies:
        cnpj = company["cnpj"]

        if cnpj in processed_cnpjs:
            continue

        processed_cnpjs.add(cnpj)

        # Adicionar empresa à rede
        network["companies"][cnpj] = {
            "cnpj": cnpj,
            "razao_social": company["razao_social"],
            "nome_fantasia": company.get("nome_fantasia"),
            "capital_social": company.get("capital_social", 0),
            "uf": company.get("uf"),
            "situacao": company.get("situacao_cadastral"),
            "socios_count": len(company.get("socios", []))
        }

        # Processar sócios
        for socio in company.get("socios", []):
            cpf = socio.get("cpf")
            if not cpf:
                continue

            # Adicionar sócio à rede
            if cpf not in network["socios"]:
                network["socios"][cpf] = {
                    "cpf": cpf,
                    "nome": socio.get("nome"),
                    "companies": []
                }

            # Adicionar conexão
            network["connections"].append({
                "cnpj": cnpj,
                "cpf": cpf,
                "qualificacao": socio.get("qualificacao"),
                "data_entrada": socio.get("data_entrada"),
                "percentual": socio.get("percentual")
            })

            network["socios"][cpf]["companies"].append(cnpj)

    print(f"\n📊 Rede construída:")
    print(f"   - Empresas: {len(network['companies'])}")
    print(f"   - Sócios: {len(network['socios'])}")
    print(f"   - Conexões: {len(network['connections'])}")

    return network

def analyze_network(network: Dict):
    """Analisa métricas da rede"""

    print("\n" + "="*80)
    print("📈 ANÁLISE DA REDE DE EMPRESAS E SÓCIOS")
    print("="*80)

    # Sócios com mais empresas
    socios_by_companies = sorted(
        network["socios"].items(),
        key=lambda x: len(x[1]["companies"]),
        reverse=True
    )[:10]

    print("\n🏆 TOP 10 SÓCIOS COM MAIS EMPRESAS:")
    for cpf, data in socios_by_companies:
        print(f"   {data['nome'][:40]:40} - {len(data['companies'])} empresas")

    # Empresas com mais sócios
    companies_by_socios = sorted(
        network["companies"].items(),
        key=lambda x: x[1]["socios_count"],
        reverse=True
    )[:10]

    print("\n🏢 TOP 10 EMPRESAS COM MAIS SÓCIOS:")
    for cnpj, data in companies_by_socios:
        razao = data['razao_social'][:50]
        print(f"   {razao:50} - {data['socios_count']} sócios")

    # Empresas com maior capital social
    companies_by_capital = sorted(
        network["companies"].items(),
        key=lambda x: x[1]["capital_social"] or 0,
        reverse=True
    )[:10]

    print("\n💰 TOP 10 EMPRESAS POR CAPITAL SOCIAL:")
    for cnpj, data in companies_by_capital:
        razao = data['razao_social'][:50]
        capital = data['capital_social'] or 0
        print(f"   {razao:50} - R$ {capital:,.2f}")

def export_to_json(network: Dict, filename: str):
    """Exporta rede para JSON"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(network, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Rede exportada para: {filename}")

def main():
    import sys

    if len(sys.argv) < 2:
        print("Uso: python meilisearch-company-network.py <query>")
        print("\nExemplos:")
        print("  python meilisearch-company-network.py MBRAS")
        print("  python meilisearch-company-network.py 16728568000163")
        print("  python meilisearch-company-network.py 'BANCO DO BRASIL'")
        sys.exit(1)

    query = " ".join(sys.argv[1:])

    print(f"🔍 Buscando empresas: {query}\n")

    # Construir rede
    network = build_network(query, max_depth=1)

    # Analisar
    analyze_network(network)

    # Exportar
    output_file = f"company_network_{query.replace(' ', '_')}.json"
    export_to_json(network, output_file)

    print("\n✅ Análise concluída!")

if __name__ == "__main__":
    main()
