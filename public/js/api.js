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

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, form, method = 'POST') => request(path, { method, form }),

  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me')
};
