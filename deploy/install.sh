#!/usr/bin/env bash
# تثبيت منصة تحفيز طلاب رياض القرآن على خادم Linux (Ubuntu / Debian)
# التشغيل:  sudo bash deploy/install.sh quran.example.com 05xxxxxxxx
set -euo pipefail

DOMAIN="${1:-}"
ADMIN_PHONE="${2:-0500000000}"
APP_DIR="/srv/riyad-quran"
REPO="https://github.com/msnd7/t-aog.git"

if [[ $EUID -ne 0 ]]; then echo "شغّل السكربت بصلاحية root (sudo)"; exit 1; fi

echo "== تثبيت المتطلبات =="
apt-get update -y
apt-get install -y curl git nginx
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "== جلب المشروع =="
id riyad &>/dev/null || adduser --system --group --home "$APP_DIR" riyad
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u riyad git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
  chown -R riyad:riyad "$APP_DIR"
fi
cd "$APP_DIR"
sudo -u riyad npm ci --omit=dev
sudo -u riyad mkdir -p "$APP_DIR/data"

echo "== خدمة النظام =="
sed "s/^Environment=ADMIN_PHONE=.*$//" deploy/riyad-quran.service > /etc/systemd/system/riyad-quran.service
sed -i "/Environment=TZ=Asia\/Riyadh/a Environment=ADMIN_PHONE=${ADMIN_PHONE}" /etc/systemd/system/riyad-quran.service
systemctl daemon-reload
systemctl enable --now riyad-quran
systemctl restart riyad-quran

if [[ -n "$DOMAIN" ]]; then
  echo "== إعداد Nginx و HTTPS للنطاق $DOMAIN =="
  sed "s/quran.example.com/${DOMAIN}/g" deploy/nginx.conf > /etc/nginx/sites-available/riyad-quran
  ln -sf /etc/nginx/sites-available/riyad-quran /etc/nginx/sites-enabled/riyad-quran
  # قبل إصدار الشهادة نبقي المنفذ 80 فقط حتى لا يفشل اختبار nginx
  sed -i '/listen 443/,$d' /etc/nginx/sites-available/riyad-quran
  printf 'server {\n  listen 80;\n  server_name %s;\n  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Real-IP $remote_addr; }\n}\n' "$DOMAIN" > /etc/nginx/sites-available/riyad-quran
  nginx -t && systemctl reload nginx
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || \
    echo "تعذّر إصدار الشهادة تلقائياً — نفّذ لاحقاً: certbot --nginx -d $DOMAIN"
fi

echo
echo "تم التثبيت ✅"
echo "  الرابط:        ${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://<عنوان-الخادم>:3000}"
echo "  دخول المدير:   رقم الجوال ${ADMIN_PHONE} — الرمز المؤقت 1234"
echo "  حالة الخدمة:   systemctl status riyad-quran"
