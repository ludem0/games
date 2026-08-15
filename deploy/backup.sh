#!/usr/bin/env bash
# Ночной архив игровых данных в S3.
#
# Зачем: users.json + seasons.json + 20 с лишним файлов игр — вся история сезонов.
# Живут только на этом сервере, в git их нет. Архив весит килобайты, копия
# стоит ровно ничего.
set -euo pipefail

cd "$(dirname "$0")/.."

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
KEY="backups-games/games-${STAMP}.tar.gz"
TMP=$(mktemp /tmp/games-backup.XXXXXX.tar.gz)
trap 'rm -f "$TMP"' EXIT

tar czf "$TMP" ./*.json

# Пустой или битый архив хуже отсутствия бэкапа: он создаёт видимость защиты.
# Список пишем в файл: grep -q обрывает пайп, и tar под pipefail валит скрипт.
gzip -t "$TMP"
LIST=$(mktemp /tmp/games-backup-list.XXXXXX)
trap 'rm -f "$TMP" "$LIST"' EXIT
tar tzf "$TMP" > "$LIST"
COUNT=$(wc -l < "$LIST")
if [ "$COUNT" -lt 5 ]; then
  echo "ОТМЕНА: в архиве всего $COUNT файлов" >&2
  exit 1
fi
for MUST in users.json seasons.json; do
  if ! grep -q "$MUST" "$LIST"; then
    echo "ОТМЕНА: в архиве нет $MUST" >&2
    exit 1
  fi
done

# aws-sdk и S3-креды живут в контейнере memories — заливаем через него.
# mktemp даёт 600, а node в контейнере не root — без chmod он файл не откроет.
chmod 644 "$TMP"
docker cp "$TMP" memories-app-1:/app/games-backup.tar.gz
docker cp deploy/backup-upload.js memories-app-1:/app/games-backup-upload.js
docker exec memories-app-1 node /app/games-backup-upload.js /app/games-backup.tar.gz "$KEY"
# docker cp кладёт файлы root-ом, поэтому и убирать их надо root-ом
docker exec -u 0 memories-app-1 rm -f /app/games-backup.tar.gz /app/games-backup-upload.js

echo "OK: $KEY ($COUNT файлов)"
