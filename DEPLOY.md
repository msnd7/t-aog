# تفعيل الموقع ونشره

المنصة خادم Node.js مع قاعدة بيانات SQLite في ملف واحد. المهم في أي استضافة أمران:

1. **قرص دائم** لمجلد `data/` (فيه `app.db` وصور الطلاب والجوائز) — بدونه تُفقد البيانات مع كل تحديث.
2. **HTTPS** — لازم لتثبيت المنصة كتطبيق (PWA) ولحماية جلسات الدخول، ومعه `COOKIE_SECURE=1`.

المستودع جاهز للنشر: `Dockerfile` و`fly.toml` و`render.yaml` وملفات `deploy/` للخادم الخاص،
إضافة إلى فحص تلقائي للاختبارات في GitHub Actions مع كل رفعة.

---

## الخيار الأول: Fly.io — الأنسب (قرص دائم ونطاق فرعي مجاني بـ HTTPS)

```bash
# مرة واحدة على جهازك
curl -L https://fly.io/install.sh | sh
fly auth login

# داخل مجلد المشروع
fly launch --copy-config --no-deploy      # يقرأ fly.toml؛ اختر اسم التطبيق والمنطقة
fly volumes create riyad_data --size 1    # القرص الدائم لقاعدة البيانات
fly secrets set ADMIN_PHONE=05xxxxxxxx    # رقم جوال المدير الأول
fly deploy
fly open                                  # يفتح https://<اسم-التطبيق>.fly.dev
```

للربط بـ GitHub بحيث يُنشر كل تحديث تلقائياً: أنشئ رمزاً بـ `fly tokens create deploy`،
ثم أضفه في المستودع تحت **Settings ← Secrets and variables ← Actions** باسم `FLY_API_TOKEN`،
وفعّل ملف `.github/workflows/deploy-fly.yml` (موجود في المستودع ومعطّل حتى تضيف الرمز).

## الخيار الثاني: Render — ربط مباشر بالمستودع بضغطة

1. ادخل [render.com](https://render.com) ← **New ← Blueprint**، واختر مستودع `msnd7/t-aog`.
2. سيقرأ Render ملف `render.yaml` وينشئ الخدمة مع قرص دائم على `/data`.
3. أضف المتغير `ADMIN_PHONE` برقم جوال المدير، ثم **Apply**.
4. كل رفعة إلى الفرع المربوط تُنشر تلقائياً (`autoDeploy: true`).

> تنبيه: خطة Render المجانية بلا قرص دائم وتُوقف الخدمة عند الخمول، لذا الملف يستخدم خطة `starter`
> المدفوعة (نحو ٧ دولارات شهرياً) لتبقى البيانات محفوظة.

## الخيار الثالث: خادم خاص (VPS) — الأقوى للاستخدام اليومي في المجمع

```bash
# على الخادم (Ubuntu مثلاً)
sudo apt update && sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx git
sudo adduser --system --group --home /srv/riyad-quran riyad

sudo -u riyad git clone https://github.com/msnd7/t-aog.git /srv/riyad-quran
cd /srv/riyad-quran && sudo -u riyad npm ci --omit=dev

sudo cp deploy/riyad-quran.service /etc/systemd/system/
sudo systemctl enable --now riyad-quran

sudo cp deploy/nginx.conf /etc/nginx/sites-available/riyad-quran
sudo ln -s /etc/nginx/sites-available/riyad-quran /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d quran.example.com          # شهادة HTTPS مجانية
```

التحديث لاحقاً: `sudo -u riyad git pull && sudo -u riyad npm ci --omit=dev && sudo systemctl restart riyad-quran`.

## عبر Docker (أي استضافة تدعم الحاويات)

```bash
docker build -t riyad-quran .
docker run -d --name riyad-quran -p 3000:3000 \
  -v riyad-data:/data -e ADMIN_PHONE=05xxxxxxxx -e TZ=Asia/Riyadh \
  --restart unless-stopped riyad-quran
```

## استضافة موجودة لديك مسبقاً

### لوحة cPanel (خيار «Setup Node.js App»)

1. ارفع المشروع إلى مجلد على الاستضافة (أو استورده من GitHub عبر Git Version Control في cPanel).
2. من cPanel افتح **Setup Node.js App ← Create Application**:
   - **Node.js version**: ٢٢ فأحدث إن توفّرت (وإلا اقرأ التنبيه أدناه).
   - **Application root**: مجلد المشروع.
   - **Application URL**: النطاق أو النطاق الفرعي.
   - **Application startup file**: `app.js` (موجود في جذر المشروع لهذا الغرض).
3. أضف متغيرات البيئة: `ADMIN_PHONE=05xxxxxxxx` و `DATA_DIR=/home/USER/riyad-data` و `COOKIE_SECURE=1` و `TZ=Asia/Riyadh`.
4. اضغط **Run NPM Install** ثم **Restart**.

> **تنبيه الإصدار**: المنصة تستخدم قاعدة SQLite المدمجة في Node.js 22.5 فأحدث.
> إن كانت استضافتك على إصدار أقدم (١٨ أو ٢٠) فشغّل `npm install better-sqlite3` مرة واحدة،
> وسيستخدمها النظام تلقائياً بديلاً عن المدمجة.

### خادم Linux خاص بك — أمر واحد

```bash
git clone https://github.com/msnd7/t-aog.git && cd t-aog
sudo bash deploy/install.sh quran.example.com 05xxxxxxxx
```

يثبّت Node.js والخدمة وNginx وشهادة HTTPS، ويطبع رابط الموقع وبيانات دخول المدير.
التحديث لاحقاً: أعد تشغيل السكربت نفسه.

### استضافة تدعم Docker

استخدم أوامر Docker في القسم السابق، مع تركيب مجلد دائم على `/data`.

---

## بعد النشر مباشرة

1. افتح الموقع وسجّل الدخول برقم جوال المدير والرمز المؤقت `1234`، ثم اختر رمزك الجديد.
2. من **الإعدادات**: اسم المجمع والشعار وقيم بنود الشيكات وحسابات المشرفين.
3. من **المجموعات** أضف الحلقات، ومن **الأفراد** أضف الطلاب بالاسم ورقم الجوال.
4. اطبع بطاقات الباركود، وافتح `‎/screen.html` على شاشة القاعة.

## النسخ الاحتياطي

كل شيء داخل مجلد `data/`:

```bash
# خادم خاص أو Docker
tar czf backup-$(date +%F).tar.gz -C /srv/riyad-quran data
# Fly.io
fly ssh console -C "tar czf - -C /data ." > backup-$(date +%F).tar.gz
```

اجعلها مهمة أسبوعية في `cron`، واحتفظ بنسخة خارج الخادم.
