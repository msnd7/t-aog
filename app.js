'use strict';
/**
 * مدخل التشغيل للاستضافات التي تتوقع ملفاً باسم app.js في جذر المشروع
 * (مثل «Setup Node.js App» في cPanel وبيئات Passenger).
 * التشغيل المعتاد على الخوادم الأخرى: npm start
 */
const { app, ensureAdmin } = require('./server/index');

ensureAdmin();

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`منصة رياض القرآن تعمل على المنفذ ${port}`);
});
