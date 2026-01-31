# Fly.io Scaling Guide

**Data:** Janeiro 30, 2026  
**Mantido por:** Ronaldo Lima + Claude AI

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Métodos de Scaling](#métodos-de-scaling)
- [Configuração Permanente (fly.toml)](#configuração-permanente-flytoml)
- [Scaling Via CLI](#scaling-via-cli)
- [Script Helper Automatizado](#script-helper-automatizado)
- [Auto-Scaling Programático](#auto-scaling-programático)
- [VM Sizes e Custos](#vm-sizes-e-custos)
- [Monitoramento](#monitoramento)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Este guia ensina como configurar e escalar aplicações no Fly.io, permitindo ajustar CPU e memória de acordo com a carga de trabalho.

### Quando Escalar?

**Escalar UP (8GB+) quando:**
- ✅ Processamento batch de grandes volumes
- ✅ Muitos requests simultâneos (>50/min)
- ✅ Timeouts frequentes
- ✅ Alto uso de memória (>80%)
- ✅ Operações intensivas (busca em DuckDB, ML, etc)

**Manter DOWN (512MB-2GB) quando:**
- ✅ Webhook mode (requisições ocasionais)
- ✅ Baixo tráfego (<10 req/min)
- ✅ Operação normal do dia-a-dia
- ✅ Economia de custos é prioridade

---

## 🔧 Métodos de Scaling

Existem 4 formas de escalar uma aplicação no Fly.io:

| Método | Tipo | Quando Usar | Persistência |
|--------|------|-------------|--------------|
| **1. fly.toml** | Declarativo | Configuração padrão da app | ✅ Permanente |
| **2. Fly CLI** | Imperativo | Mudanças rápidas/temporárias | ⚠️ Até próximo deploy |
| **3. Script Helper** | Automação | Operações recorrentes | ⚠️ Temporário |
| **4. Auto-Scaling API** | Programático | Scaling dinâmico baseado em carga | 🔄 Dinâmico |

---

## 1. Configuração Permanente (fly.toml)

### 📝 Estrutura Básica

```toml
# fly.toml
app = "seu-app"
primary_region = "gru"  # São Paulo

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 100
    soft_limit = 80

[[vm]]
  cpu_kind = "shared"      # shared | performance
  cpus = 1                 # 1, 2, 4, 8
  memory_mb = 512          # 256, 512, 1024, 2048, 4096, 8192, 16384
```

### 📊 Configurações Recomendadas

#### Desenvolvimento / Low Traffic
```toml
[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```
**Custo:** ~$0.006/hora (~$4.32/mês)

#### Produção Normal
```toml
[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 2048
```
**Custo:** ~$0.015/hora (~$10.80/mês)

#### High Performance (8GB)
```toml
[[vm]]
  cpu_kind = "performance"
  cpus = 2
  memory_mb = 8192
```
**Custo:** ~$0.05/hora (~$36/mês)

#### Ultra High Performance (16GB)
```toml
[[vm]]
  cpu_kind = "performance"
  cpus = 4
  memory_mb = 16384
```
**Custo:** ~$0.10/hora (~$72/mês)

### 🚀 Aplicar Configuração

```bash
# 1. Editar fly.toml
vim fly.toml

# 2. Deploy com nova configuração
fly deploy -a seu-app

# 3. Verificar
fly status -a seu-app
```

---

## 2. Scaling Via CLI

### ⚡ Comandos Rápidos

```bash
# Ver status atual
fly status -a seu-app

# Listar máquinas
fly machine list -a seu-app

# Escalar memória
fly scale memory 8192 -a seu-app

# Escalar VM size (CPU + RAM)
fly scale vm performance-2x -a seu-app

# Escalar ambos (recomendado)
fly scale vm performance-2x -a seu-app
fly scale memory 8192 -a seu-app
```

### 🎚️ VM Sizes Disponíveis

```bash
# Shared CPU (econômico)
fly scale vm shared-cpu-1x -a seu-app   # 1 vCPU shared, 256MB-2GB
fly scale vm shared-cpu-2x -a seu-app   # 2 vCPU shared, 512MB-4GB
fly scale vm shared-cpu-4x -a seu-app   # 4 vCPU shared, 1GB-8GB

# Performance CPU (dedicado)
fly scale vm performance-1x -a seu-app  # 1 vCPU dedicated, 2GB-8GB
fly scale vm performance-2x -a seu-app  # 2 vCPU dedicated, 4GB-16GB
fly scale vm performance-4x -a seu-app  # 4 vCPU dedicated, 8GB-32GB
fly scale vm performance-8x -a seu-app  # 8 vCPU dedicated, 16GB-64GB
```

### 🔄 Update Machine Direto

```bash
# Pegar MACHINE_ID
fly machine list -a seu-app

# Update com todas as opções
fly machine update <MACHINE_ID> \
  --vm-size performance-2x \
  --vm-memory 8192 \
  -a seu-app

# Exemplo real
fly machine update 90807561f37668 \
  --vm-size performance-2x \
  --vm-memory 8192 \
  -a cpf-lookup-api
```

---

## 3. Script Helper Automatizado

### 📜 Criar Script de Scaling

Crie `scripts/utils/scale.sh`:

```bash
#!/bin/bash
# Scale Helper Script
#
# Usage:
#   ./scale.sh up     # Scale to 8GB for heavy workload
#   ./scale.sh medium # Scale to 2GB for moderate load
#   ./scale.sh down   # Scale to 512MB for normal operation
#   ./scale.sh status # Check current config

APP="seu-app"
FLY="$HOME/.fly/bin/fly"

case "$1" in
  up)
    echo "🚀 Scaling $APP UP for heavy workload..."
    echo "   -> performance-2x CPU + 8GB RAM"
    $FLY scale vm performance-2x -a $APP
    $FLY scale memory 8192 -a $APP
    echo ""
    echo "⏳ Waiting for machine to restart..."
    sleep 5
    echo "🔍 Testing health..."
    curl -s "https://$APP.fly.dev/health" | jq '.' 2>/dev/null || echo "OK"
    echo ""
    echo "✅ Done! API ready for heavy workload."
    ;;

  medium)
    echo "📈 Scaling $APP to MEDIUM configuration..."
    echo "   -> shared-cpu-2x + 2GB RAM"
    $FLY scale vm shared-cpu-2x -a $APP
    $FLY scale memory 2048 -a $APP
    echo ""
    echo "✅ Done! API in medium performance mode."
    ;;

  down)
    echo "📉 Scaling $APP DOWN to normal operation..."
    echo "   -> shared-cpu-1x + 512MB RAM"
    $FLY scale vm shared-cpu-1x -a $APP
    $FLY scale memory 512 -a $APP
    echo ""
    echo "✅ Done! API back to normal operation mode."
    ;;

  status)
    echo "📊 Current $APP configuration:"
    echo ""
    $FLY status -a $APP
    echo ""
    echo "🖥️  Detailed machine info:"
    $FLY machine list -a $APP
    ;;

  *)
    echo "Scale Helper Script"
    echo ""
    echo "Usage: $0 {up|medium|down|status}"
    echo ""
    echo "  up     - Scale to 8GB RAM + performance CPU (heavy workload)"
    echo "  medium - Scale to 2GB RAM + shared-2x CPU (moderate load)"
    echo "  down   - Scale to 512MB RAM + shared-1x CPU (normal operation)"
    echo "  status - Show current configuration"
    echo ""
    echo "💰 Cost estimate (approximate):"
    echo "  up     = ~\$0.05/hour (~\$36/month)"
    echo "  medium = ~\$0.015/hour (~\$10.80/month)"
    echo "  down   = ~\$0.006/hour (~\$4.32/month)"
    ;;
esac
```

### 🔐 Tornar Executável

```bash
chmod +x scripts/utils/scale.sh
```

### 🎮 Usar o Script

```bash
# Escalar para 8GB
./scripts/utils/scale.sh up

# Escalar para 2GB
./scripts/utils/scale.sh medium

# Voltar para 512MB
./scripts/utils/scale.sh down

# Ver status
./scripts/utils/scale.sh status
```

---

## 4. Auto-Scaling Programático

### 🤖 Via Fly.io API

Crie `src/services/fly-scale.service.ts`:

```typescript
/**
 * Fly.io Auto-Scale Service
 * Automatically scales machines based on workload
 */

interface ScaleConfig {
  cpu_kind: string;
  cpus: number;
  memory_mb: number;
}

const SCALE_CONFIGS = {
  up: {
    cpu_kind: "performance",
    cpus: 2,
    memory_mb: 8192,
  },
  down: {
    cpu_kind: "shared",
    cpus: 1,
    memory_mb: 512,
  },
} as const;

export class FlyScaleService {
  private readonly apiToken: string;
  private readonly appName: string;
  private readonly machineId: string;
  private readonly baseUrl = "https://api.machines.dev/v1";

  // Auto scale-down timer
  private scaleDownTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly scaleDownDelayMs = 5 * 60 * 1000; // 5 minutes

  constructor(apiToken: string, appName: string, machineId: string) {
    this.apiToken = apiToken;
    this.appName = appName;
    this.machineId = machineId;
  }

  /**
   * Scale machine up for heavy workload
   */
  async scaleUp(): Promise<boolean> {
    console.log("🚀 Scaling UP to 8GB...");
    
    const config = SCALE_CONFIGS.up;
    const success = await this.updateMachine(config);
    
    if (success) {
      console.log("✅ Scaled UP successfully");
      // Cancel any pending scale-down
      if (this.scaleDownTimer) {
        clearTimeout(this.scaleDownTimer);
        this.scaleDownTimer = null;
      }
    }
    
    return success;
  }

  /**
   * Scale machine down for cost savings
   */
  async scaleDown(): Promise<boolean> {
    console.log("📉 Scaling DOWN to 512MB...");
    
    const config = SCALE_CONFIGS.down;
    const success = await this.updateMachine(config);
    
    if (success) {
      console.log("✅ Scaled DOWN successfully");
    }
    
    return success;
  }

  /**
   * Schedule automatic scale-down after delay
   */
  scheduleScaleDown(delayMs: number = this.scaleDownDelayMs): void {
    // Cancel existing timer
    if (this.scaleDownTimer) {
      clearTimeout(this.scaleDownTimer);
    }

    console.log(`⏰ Scheduling scale-down in ${delayMs / 1000}s`);

    this.scaleDownTimer = setTimeout(async () => {
      await this.scaleDown();
      this.scaleDownTimer = null;
    }, delayMs);
  }

  /**
   * Update machine configuration via Fly.io API
   */
  private async updateMachine(config: ScaleConfig): Promise<boolean> {
    const url = `${this.baseUrl}/apps/${this.appName}/machines/${this.machineId}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: {
            guest: {
              cpu_kind: config.cpu_kind,
              cpus: config.cpus,
              memory_mb: config.memory_mb,
            },
          },
        }),
      });

      if (!response.ok) {
        console.error(`❌ Fly.io API error: ${response.status}`);
        return false;
      }

      // Wait for machine to restart
      await this.waitForReady();
      return true;
    } catch (error) {
      console.error("❌ Failed to scale machine:", error);
      return false;
    }
  }

  /**
   * Wait for machine to be ready after scaling
   */
  private async waitForReady(maxRetries = 10): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Check health endpoint
      try {
        const healthUrl = `https://${this.appName}.fly.dev/health`;
        const response = await fetch(healthUrl);
        if (response.ok) {
          console.log("✅ Machine ready");
          return;
        }
      } catch {
        // Continue retrying
      }
    }
    
    console.warn("⚠️ Machine may not be ready yet");
  }
}
```

### 🎯 Uso do Auto-Scaling

```typescript
import { FlyScaleService } from './services/fly-scale.service';

const scaler = new FlyScaleService(
  process.env.FLY_API_TOKEN!,
  "seu-app",
  "machine-id-aqui"
);

// Antes de operação pesada
async function batchEnrichment() {
  // Scale UP
  await scaler.scaleUp();
  
  try {
    // Fazer processamento pesado
    await processLargeDataset();
  } finally {
    // Agendar scale-down automático
    scaler.scheduleScaleDown(); // 5 min depois
  }
}
```

### 🔑 Variáveis de Ambiente

```bash
# .env
FLY_API_TOKEN=fm2_xxxxxxxxx
FLY_APP_NAME=seu-app
FLY_MACHINE_ID=90807561f37668
FLY_AUTO_SCALE=true
```

### 🔐 Gerar Fly.io API Token

```bash
# Criar token
fly tokens create scale-automation -x 999999h

# Configurar no app
fly secrets set FLY_API_TOKEN="fm2_xxxxx" -a seu-app
```

---

## 📊 VM Sizes e Custos

### Tabela Completa

| VM Size | vCPU | Tipo | RAM Mín | RAM Máx | Custo/hora | Custo/mês | Uso |
|---------|------|------|---------|---------|------------|-----------|-----|
| `shared-cpu-1x` | 1 | shared | 256MB | 2GB | $0.0015 | $1.08 | Dev/Test |
| `shared-cpu-2x` | 2 | shared | 512MB | 4GB | $0.015 | $10.80 | Produção leve |
| `shared-cpu-4x` | 4 | shared | 1GB | 8GB | $0.03 | $21.60 | Produção média |
| `performance-1x` | 1 | dedicated | 2GB | 8GB | $0.025 | $18 | Produção |
| `performance-2x` | 2 | dedicated | 4GB | 16GB | $0.05 | $36 | **8GB recomendado** |
| `performance-4x` | 4 | dedicated | 8GB | 32GB | $0.10 | $72 | Alto desempenho |
| `performance-8x` | 8 | dedicated | 16GB | 64GB | $0.20 | $144 | Máximo |

**Nota:** Custos são aproximados e variam por região.

### 💡 Dicas de Otimização de Custos

1. **Auto-scaling:** Escale UP apenas quando necessário
2. **Auto-stop:** Use `auto_stop_machines = true`
3. **Schedule:** Escale DOWN durante baixo tráfego (noite/fim de semana)
4. **Monitoring:** Configure alertas de uso de memória
5. **Region:** Use região mais barata quando possível

**Exemplo de economia:**
```
Cenário: App que precisa 8GB apenas 4h/dia para batch jobs

Opção 1 (sempre 8GB):
  24h × $0.05 = $1.20/dia = $36/mês

Opção 2 (auto-scaling):
  4h × $0.05 + 20h × $0.006 = $0.32/dia = $9.60/mês
  
Economia: $26.40/mês (73%)
```

---

## 📈 Monitoramento

### Via Dashboard

```bash
# Abrir dashboard web
fly dashboard -a seu-app

# Ver métricas
fly dashboard metrics -a seu-app
```

### Via CLI

```bash
# Status geral
fly status -a seu-app

# Logs em tempo real
fly logs -a seu-app

# Logs filtrados
fly logs -a seu-app --grep "memory"

# Histórico de deploys
fly releases -a seu-app

# Ver máquinas
fly machine list -a seu-app

# SSH na máquina
fly ssh console -a seu-app

# Dentro da máquina
htop          # Ver uso de CPU/RAM
free -h       # Ver memória
df -h         # Ver disco
```

### Métricas Importantes

```bash
# Via curl (se expor /metrics)
curl https://seu-app.fly.dev/metrics

# Exemplo de métricas Prometheus
process_resident_memory_bytes
nodejs_heap_size_total_bytes
http_request_duration_seconds
```

---

## 🚨 Troubleshooting

### Problema 1: Deploy Falha Após Aumentar Memória

**Erro:**
```
Error: insufficient resources
```

**Solução:**
```bash
# Verificar limites da conta
fly platform vm-sizes

# Tentar região diferente
fly regions list
fly regions set gru,scl -a seu-app  # Adicionar Santiago como fallback
```

### Problema 2: OOM (Out of Memory)

**Sintomas:**
- App crashando aleatoriamente
- Logs: "out of memory" ou "killed"

**Diagnóstico:**
```bash
# Ver uso atual
fly ssh console -a seu-app
# Rodar: free -h

# Ver logs de crash
fly logs -a seu-app --grep "memory"
```

**Solução:**
```bash
# Aumentar memória temporariamente
fly scale memory 2048 -a seu-app

# Ou permanentemente (fly.toml)
[[vm]]
  memory_mb = 2048
```

### Problema 3: Scaling Não Aplica

**Sintomas:**
- `fly scale memory 8192` executa mas não muda

**Solução:**
```bash
# Forçar restart
fly apps restart -a seu-app

# OU destruir e recriar
fly machine destroy <MACHINE_ID> -a seu-app
fly deploy -a seu-app

# Verificar se fly.toml sobrescreve
cat fly.toml | grep memory_mb
```

### Problema 4: Custo Alto Inesperado

**Sintomas:**
- Fatura maior que esperado

**Diagnóstico:**
```bash
# Ver máquinas ativas
fly machine list -a seu-app

# Ver apps rodando
fly apps list

# Ver billing
fly dashboard billing
```

**Solução:**
```bash
# Parar máquinas não usadas
fly machine stop <MACHINE_ID> -a seu-app

# Escalar down apps não críticos
fly scale memory 256 -a dev-app

# Deletar apps não usados
fly apps destroy unused-app
```

---

## 📚 Referências

### Documentação Oficial

- [Fly.io Scaling Guide](https://fly.io/docs/apps/scale-machine/)
- [VM Sizes](https://fly.io/docs/about/pricing/#virtual-machines)
- [Machines API](https://fly.io/docs/machines/api/)
- [Auto-scaling](https://fly.io/docs/launch/autoscale-by-metric/)

### Comandos Fly CLI

```bash
fly help scale          # Ver comandos de scaling
fly help machine        # Ver comandos de máquina
fly help secrets        # Gerenciar secrets
fly help status         # Ver status
```

### API REST

```bash
# Base URL
https://api.machines.dev/v1

# Endpoints úteis
GET  /apps/{app}/machines
GET  /apps/{app}/machines/{id}
POST /apps/{app}/machines/{id}  # Update config
DELETE /apps/{app}/machines/{id}
```

---

## ✅ Checklist de Implementação

Para configurar scaling em uma nova app:

- [ ] 1. Definir configuração inicial no `fly.toml`
- [ ] 2. Criar script helper `scripts/utils/scale.sh`
- [ ] 3. Tornar script executável (`chmod +x`)
- [ ] 4. Gerar Fly.io API token (`fly tokens create`)
- [ ] 5. Configurar secrets (`fly secrets set FLY_API_TOKEN`)
- [ ] 6. Implementar `FlyScaleService` (se usar auto-scaling)
- [ ] 7. Testar scaling: `./scale.sh up` e `./scale.sh down`
- [ ] 8. Configurar monitoramento de custos
- [ ] 9. Documentar processo no README do projeto
- [ ] 10. Configurar alertas de billing no Fly.io dashboard

---

**Última Atualização:** Janeiro 30, 2026  
**Mantido por:** Ronaldo Lima + Claude AI
