'use strict';
/**
 * مدخل التشغيل على Vercel: المنصة كلها دالة واحدة بلا خادم (Serverless Function)
 * يوجّه إليها ملف vercel.json كل طلب لا يقابله ملف ثابت في مجلد public.
 *
 * انتبه: قرص Vercel للقراءة فقط ويُمحى مع كل نشر، لذلك لا بد من قاعدة بيانات
 * بعيدة. المنصة تكتشف تلقائياً قاعدة Postgres (POSTGRES_URL/DATABASE_URL —
 * كما في تكامل Neon على Vercel) أو libSQL/Turso (TURSO_DATABASE_URL)، وإلا
 * فالبيانات مؤقتة تماماً. التفاصيل في DEPLOY.md.
 */

// كل طلبات Vercel عبر HTTPS، فتُؤمَّن ملفات الارتباط افتراضياً.
if (!process.env.COOKIE_SECURE) process.env.COOKIE_SECURE = '1';

const { app, ensureAdminReady } = require('../server/index');

// يُنشأ حساب المدير مرة واحدة عند أول تشغيل بارد، والعملية آمنة عند التكرار.
// معالج الطلبات نفسه ينتظر هذا أيضاً كحاجز أمان (server/index.js)، فهذا لتسريع الحالة المعتادة فقط.
ensureAdminReady().catch((err) => console.error('تعذّر تجهيز حساب المدير:', err));

module.exports = app;
