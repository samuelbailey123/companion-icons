#!/bin/bash
# Nightly Companion config backup to the storage drive; keeps 30 days.
set -euo pipefail
DEST=/mnt/storage/companion-backups
[ -d "$DEST" ] || { echo "companion-backup: $DEST missing (drive not mounted?)" >&2; exit 1; }
STAMP=$(date +%Y%m%d-%H%M%S)
tar czf "$DEST/companion-config-$STAMP.tar.gz" -C /home/companion .config
find "$DEST" -name 'companion-config-*.tar.gz' -mtime +30 -delete
echo "companion-backup: wrote companion-config-$STAMP.tar.gz"
