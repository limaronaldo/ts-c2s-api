#!/bin/bash
# Fly.io Machine Scaling Script
# Scale machines up for heavy workloads, down when idle

FLY=~/.fly/bin/fly

# Machine configs
CPF_LOOKUP_MACHINE="90807561f37668"
CPF_LOOKUP_APP="cpf-lookup-api"

MEILISEARCH_MACHINE="17817965fd0678"
MEILISEARCH_APP="ibvi-meilisearch-v2"

# Idle specs (minimal)
CPF_IDLE_SIZE="shared-cpu-1x"
CPF_IDLE_RAM="512"

MEILI_IDLE_SIZE="shared-cpu-1x"
MEILI_IDLE_RAM="2048"

# Active specs (for heavy workloads)
CPF_ACTIVE_SIZE="shared-cpu-4x"
CPF_ACTIVE_RAM="8192"

MEILI_ACTIVE_SIZE="shared-cpu-4x"
MEILI_ACTIVE_RAM="8192"

usage() {
    echo "Usage: $0 <command> [app]"
    echo ""
    echo "Commands:"
    echo "  up <app>     Scale up for heavy workload"
    echo "  down <app>   Scale down to idle"
    echo "  status       Show current sizes"
    echo ""
    echo "Apps: cpf, meilisearch, all"
    echo ""
    echo "Examples:"
    echo "  $0 up cpf           # Scale up CPF Lookup API"
    echo "  $0 up meilisearch   # Scale up Meilisearch"
    echo "  $0 up all           # Scale up both"
    echo "  $0 down all         # Scale down both"
    echo "  $0 status           # Show current status"
}

scale_cpf_up() {
    echo "Scaling CPF Lookup API UP to $CPF_ACTIVE_SIZE:${CPF_ACTIVE_RAM}MB..."
    $FLY machine update $CPF_LOOKUP_MACHINE --vm-size $CPF_ACTIVE_SIZE --vm-memory $CPF_ACTIVE_RAM -a $CPF_LOOKUP_APP --yes 2>/dev/null
    echo "Done!"
}

scale_cpf_down() {
    echo "Scaling CPF Lookup API DOWN to $CPF_IDLE_SIZE:${CPF_IDLE_RAM}MB..."
    $FLY machine update $CPF_LOOKUP_MACHINE --vm-size $CPF_IDLE_SIZE --vm-memory $CPF_IDLE_RAM -a $CPF_LOOKUP_APP --yes 2>/dev/null
    echo "Done!"
}

scale_meili_up() {
    echo "Scaling Meilisearch UP to $MEILI_ACTIVE_SIZE:${MEILI_ACTIVE_RAM}MB..."
    $FLY machine update $MEILISEARCH_MACHINE --vm-size $MEILI_ACTIVE_SIZE --vm-memory $MEILI_ACTIVE_RAM -a $MEILISEARCH_APP --yes 2>/dev/null
    echo "Done!"
}

scale_meili_down() {
    echo "Scaling Meilisearch DOWN to $MEILI_IDLE_SIZE:${MEILI_IDLE_RAM}MB..."
    $FLY machine update $MEILISEARCH_MACHINE --vm-size $MEILI_IDLE_SIZE --vm-memory $MEILI_IDLE_RAM -a $MEILISEARCH_APP --yes 2>/dev/null
    echo "Done!"
}

show_status() {
    echo "=== Current Machine Sizes ==="
    echo ""
    echo "CPF Lookup API:"
    $FLY machines list -a $CPF_LOOKUP_APP 2>/dev/null | grep -E "^[a-z0-9]" | awk '{print "  " $NF}'
    echo ""
    echo "Meilisearch:"
    $FLY machines list -a $MEILISEARCH_APP 2>/dev/null | grep -E "^[a-z0-9]" | awk '{print "  " $NF}'
}

case "$1" in
    up)
        case "$2" in
            cpf) scale_cpf_up ;;
            meilisearch|meili) scale_meili_up ;;
            all) scale_cpf_up; echo ""; scale_meili_up ;;
            *) echo "Unknown app: $2"; usage; exit 1 ;;
        esac
        ;;
    down)
        case "$2" in
            cpf) scale_cpf_down ;;
            meilisearch|meili) scale_meili_down ;;
            all) scale_cpf_down; echo ""; scale_meili_down ;;
            *) echo "Unknown app: $2"; usage; exit 1 ;;
        esac
        ;;
    status)
        show_status
        ;;
    *)
        usage
        exit 1
        ;;
esac
