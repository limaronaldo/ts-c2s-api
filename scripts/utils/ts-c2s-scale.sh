#!/bin/bash
# ts-c2s-api - Scale on Demand
#
# Usage:
#   ./ts-c2s-scale.sh up     # Scale to 8GB for heavy workload
#   ./ts-c2s-scale.sh down   # Scale to 512MB for normal operation
#   ./ts-c2s-scale.sh status # Check current config
#
# Cost optimization: Run 'up' before batch enrichment, 'down' after

APP="ts-c2s-api"
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
    echo "Done! API ready for heavy enrichment workload."
    ;;

  down)
    echo "Scaling $APP DOWN to normal operation..."
    echo "  -> shared-cpu-1x + 512MB RAM"
    $FLY scale vm shared-cpu-1x -a $APP
    $FLY scale memory 512 -a $APP
    echo ""
    echo "Done! API back to normal operation mode."
    ;;

  medium)
    echo "Scaling $APP to MEDIUM configuration..."
    echo "  -> shared-cpu-2x + 2GB RAM"
    $FLY scale vm shared-cpu-2x -a $APP
    $FLY scale memory 2048 -a $APP
    echo ""
    echo "Done! API in medium performance mode."
    ;;

  status)
    echo "Current $APP configuration:"
    echo ""
    $FLY status -a $APP
    echo ""
    echo "Detailed machine info:"
    $FLY machine list -a $APP
    ;;

  *)
    echo "ts-c2s-api - Scale on Demand"
    echo ""
    echo "Usage: $0 {up|medium|down|status}"
    echo ""
    echo "  up     - Scale to 8GB RAM + performance CPU (for batch operations)"
    echo "  medium - Scale to 2GB RAM + shared-2x CPU (moderate load)"
    echo "  down   - Scale to 512MB RAM + shared-1x CPU (normal operation)"
    echo "  status - Show current configuration"
    echo ""
    echo "Cost estimate (approximate):"
    echo "  up     = ~\$0.05/hour (performance-2x + 8GB)"
    echo "  medium = ~\$0.015/hour (shared-cpu-2x + 2GB)"
    echo "  down   = ~\$0.006/hour (shared-cpu-1x + 512MB)"
    echo ""
    echo "Current config: 8GB + performance-2x (via fly.toml)"
    ;;
esac
