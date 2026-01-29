#!/bin/bash
# CPF Lookup API - Scale on Demand
#
# Usage:
#   ./cpf-lookup-scale.sh up     # Scale to 8GB for heavy searches
#   ./cpf-lookup-scale.sh down   # Scale to 256MB for idle (cost saving)
#   ./cpf-lookup-scale.sh status # Check current config
#
# Cost optimization: Run 'up' before batch operations, 'down' after

APP="cpf-lookup-api"
FLY="$HOME/.fly/bin/fly"

case "$1" in
  up)
    echo "Scaling $APP UP for heavy workload..."
    echo "  -> performance-2x CPU + 8GB RAM"
    $FLY scale vm performance-2x -a $APP
    $FLY scale memory 8192 -a $APP
    echo ""
    echo "Waiting for machine to restart..."
    sleep 5
    echo "Testing health..."
    curl -s "https://$APP.fly.dev/health"
    echo ""
    echo "Done! API ready for heavy searches."
    ;;

  down)
    echo "Scaling $APP DOWN for cost savings..."
    echo "  -> shared-cpu-1x + 256MB RAM"
    $FLY scale vm shared-cpu-1x -a $APP
    $FLY scale memory 256 -a $APP
    echo ""
    echo "Done! API in low-cost idle mode."
    echo "Note: Searches will be slower or may timeout."
    ;;

  status)
    echo "Current $APP configuration:"
    $FLY machine status -a $APP 2>/dev/null | grep -E "(CPU Kind|vCPUs|Memory|State)"
    ;;

  *)
    echo "CPF Lookup API - Scale on Demand"
    echo ""
    echo "Usage: $0 {up|down|status}"
    echo ""
    echo "  up     - Scale to 8GB RAM + performance CPU (for batch operations)"
    echo "  down   - Scale to 256MB RAM + shared CPU (cost saving when idle)"
    echo "  status - Show current configuration"
    echo ""
    echo "Cost estimate:"
    echo "  up   = ~\$0.05/hour (performance-2x + 8GB)"
    echo "  down = ~\$0.003/hour (shared-cpu-1x + 256MB)"
    ;;
esac
