#!/bin/bash
# Fly.io Scale Down Check
# Runs 3x daily to ensure expensive machines are scaled down
# Cron: 0 8,14,22 * * * /path/to/fly-scale-down-check.sh

LOG_FILE="/tmp/fly-scale-check.log"
FLY=~/.fly/bin/fly

# Target idle specs
IDLE_SIZE="shared-cpu-1x"
IDLE_RAM_KB=524288  # 512MB in KB

# Meilisearch idle specs
MEILI_IDLE_SIZE="shared-cpu-1x"
MEILI_IDLE_RAM="2048"  # 2GB

# Machine IDs
CPF_LOOKUP_MACHINE="90807561f37668"
CPF_LOOKUP_APP="cpf-lookup-api"

MEILISEARCH_MACHINE="17817965fd0678"
MEILISEARCH_APP="ibvi-meilisearch-v2"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_and_scale_cpf() {
    local current=$($FLY machines list -a $CPF_LOOKUP_APP 2>/dev/null | grep -E "^[a-z0-9]" | awk '{print $NF}')

    if [[ "$current" != *"$IDLE_SIZE"* ]] || [[ "$current" != *"512MB"* ]]; then
        log "CPF Lookup API not at idle specs ($current). Scaling down..."
        $FLY machine update $CPF_LOOKUP_MACHINE --vm-size $IDLE_SIZE --vm-memory 512 -a $CPF_LOOKUP_APP --yes 2>/dev/null
        log "CPF Lookup API scaled down to $IDLE_SIZE:512MB"
    else
        log "CPF Lookup API OK ($current)"
    fi
}

check_and_scale_meili() {
    local current=$($FLY machines list -a $MEILISEARCH_APP 2>/dev/null | grep -E "^[a-z0-9]" | awk '{print $NF}')

    # Check if it's bigger than idle specs (1x:2GB)
    if [[ "$current" != *"$MEILI_IDLE_SIZE"* ]] || [[ "$current" != *"${MEILI_IDLE_RAM}MB"* ]]; then
        log "Meilisearch not at idle specs ($current). Scaling down..."
        $FLY machine update $MEILISEARCH_MACHINE --vm-size $MEILI_IDLE_SIZE --vm-memory $MEILI_IDLE_RAM -a $MEILISEARCH_APP --yes 2>/dev/null
        log "Meilisearch scaled down to $MEILI_IDLE_SIZE:${MEILI_IDLE_RAM}MB"
    else
        log "Meilisearch OK ($current)"
    fi
}

log "=== Fly.io Scale Down Check Started ==="

check_and_scale_cpf
check_and_scale_meili

log "=== Check Complete ==="
echo ""
