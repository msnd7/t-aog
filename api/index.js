'use strict';
/**
 * مدخل التشغيل على Vercel: المنصة كلها دالة واحدة بلا خادم (Serverless Function)
 * يوجّه إليها ملف vercel.json كل طلب لا يقابله ملف ثابت في مجلد public.
 *
 * انتبه: قرص Vercel للقراءة فقط ويُمحى مع كل نشر، لذلك اضبط قاعدة بيانات
 * libSQL بعيدة (Turso) عبر TURSO_DATABASE_URL و TURSO_AUTH_TOKEN، وإلا فالبيانات
 * مؤقتة تماماً. التفاصيل في DEPLOY.md.
 */

// كل طلبات Vercel عبر HTTPS، فتُؤمَّن ملفات الارتباط افتراضياً.
if (!process.env.COOKIE_SECURE) process.env.COOKIE_SECURE = '1';

const { app, ensureAdmin } = require('../server/index');

// يُنشأ حساب المدير مرة واحدة عند أول تشغيل بارد، والعملية آمنة عند التكرار.
try {
  ensureAdmin();
} catch (err) {
  console.error('تعذّر تجهيز حساب المدير:', err);
}

module.exports = app;
