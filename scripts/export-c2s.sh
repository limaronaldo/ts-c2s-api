#!/bin/bash
# C2S to PostgreSQL Export Script
# Usage: ./export-c2s.sh [start_page]

C2S_TOKEN="4ecfcda34202be88a3f8ef70a79b097035621cca7dfe36b8b3"
DB_CONN="postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require"
BATCH=100
DELAY=10  # 10 seconds between requests to avoid rate limits
START_PAGE=${1:-45}
END_PAGE=365
PROGRESS_FILE="/tmp/c2s_export_progress.txt"

echo "═══════════════════════════════════════════════════════════════"
echo "  C2S → PostgreSQL Export (Shell Version)"
echo "═══════════════════════════════════════════════════════════════"
echo "Starting from page $START_PAGE"

for ((page=START_PAGE; page<=END_PAGE; page++)); do
    # Fetch page from C2S
    response=$(curl -s "https://api.contact2sale.com/integration/leads?limit=$BATCH&page=$page" \
        -H "Authorization: Bearer $C2S_TOKEN" \
        -H "Content-Type: application/json")

    # Check for rate limit
    if echo "$response" | grep -q "429\|rate\|Too Many"; then
        echo ""
        echo "⏳ Rate limited at page $page. Waiting 60s..."
        sleep 60
        ((page--))
        continue
    fi

    # Extract leads and insert
    leads=$(echo "$response" | jq -c '.data[]' 2>/dev/null)
    count=0

    while IFS= read -r lead; do
        [ -z "$lead" ] && continue

        id=$(echo "$lead" | jq -r '.id')
        internal_id=$(echo "$lead" | jq -r '.internal_id // empty')
        name=$(echo "$lead" | jq -r '.attributes.customer.name // empty' | sed "s/'/''/g")
        email=$(echo "$lead" | jq -r '.attributes.customer.email // empty' | sed "s/'/''/g")
        phone=$(echo "$lead" | jq -r '.attributes.customer.phone // empty')
        seller=$(echo "$lead" | jq -r '.attributes.seller.name // empty' | sed "s/'/''/g")
        product=$(echo "$lead" | jq -r '.attributes.product.description // empty' | sed "s/'/''/g")
        source=$(echo "$lead" | jq -r '.attributes.lead_source.name // empty' | sed "s/'/''/g")
        channel=$(echo "$lead" | jq -r '.attributes.channel.name // empty')
        status=$(echo "$lead" | jq -r '.attributes.lead_status.alias // empty')
        created=$(echo "$lead" | jq -r '.attributes.created_at // empty')
        updated=$(echo "$lead" | jq -r '.attributes.updated_at // empty')

        # Normalize phone
        phone_norm=$(echo "$phone" | tr -cd '0-9')
        if [[ ${#phone_norm} -ge 12 ]] && [[ $phone_norm == 55* ]]; then
            phone_norm=${phone_norm:2}
        fi

        sql="INSERT INTO c2s.leads (id, internal_id, customer_name, customer_email, customer_phone, customer_phone_normalized, seller_name, product_description, lead_source, channel, lead_status, created_at, updated_at) VALUES ('$id', ${internal_id:-NULL}, '${name}', '${email}', '${phone}', '${phone_norm}', '${seller}', '${product}', '${source}', '${channel}', '${status}', '${created}', '${updated}') ON CONFLICT (id) DO NOTHING;"

        PGPASSWORD=npg_quYSE3haoz2e psql "$DB_CONN" -c "$sql" > /dev/null 2>&1
        ((count++))
    done <<< "$leads"

    # Save progress
    echo "$page" > "$PROGRESS_FILE"

    printf "\r📥 Page %d/%d | Batch: %d leads   " "$page" "$END_PAGE" "$count"

    sleep $DELAY
done

# Final count
final=$(PGPASSWORD=npg_quYSE3haoz2e psql "$DB_CONN" -t -c "SELECT COUNT(*) FROM c2s.leads;" 2>/dev/null | tr -d ' ')
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Complete! Total leads: $final"
