#!/usr/bin/env bash
# Sao lưu Postgres hằng ngày (cron trên server): giữ 14 bản gần nhất.
#   0 3 * * * /home/thangvv/apps/dautu/scripts/backup-db.sh >> /home/thangvv/backups/dautu/backup.log 2>&1
set -euo pipefail
DIR="${BACKUP_DIR:-$HOME/backups/dautu}"
mkdir -p "$DIR"
FILE="$DIR/dautu-$(date +%F-%H%M).sql.gz"
docker exec dautu-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$FILE"
ls -1t "$DIR"/dautu-*.sql.gz | tail -n +15 | xargs -r rm --
echo "$(date '+%F %T') saved $FILE ($(du -h "$FILE" | cut -f1))"
