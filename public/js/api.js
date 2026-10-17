/** طبقة الاتصال بواجهات المنصة */
async function request(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (form) options.body = form;
  else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    const error = new Error((payload && payload.error) || 'تعذر تنفيذ الطلب');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

/**
 * تصغير الصور في المتصفح قبل رفعها توفيراً للتخزين: أطول ضلع ٨٠٠ بكسل بصيغة WebP
 * (أو JPEG/PNG في المتصفحات التي لا تدعمها). الصورة الصغيرة أصلاً تُرفع كما هي.
 */
const MAX_SIDE = 800;
const KEEP_BELOW = 200 * 1024;

async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_BELOW) { bitmap.close?.(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const encode = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.82));
  let blob = await encode('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await encode(file.type === 'image/png' ? 'image/png' : 'image/jpeg');
  if (!blob || blob.size >= file.size) return file;
  const ext = { 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg' }[blob.type] || '.jpg';
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'image'}${ext}`, { type: blob.type });
}

async function shrinkForm(form) {
  for (const [key, value] of [...form.entries()]) {
    if (value instanceof File && value.size) form.set(key, await shrinkImage(value));
  }
  return form;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: async (path, form, method = 'POST') => request(path, { method, form: await shrinkForm(form) }),

  login: (phone, code) => request('/api/auth/login', { method: 'POST', body: { phone, code } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me')
};
