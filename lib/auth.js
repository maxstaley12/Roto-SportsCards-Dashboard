// Shared by the middleware (Edge runtime) and the login route. Uses Web Crypto only.
export async function authToken() {
  const pw = process.env.DASHBOARD_PASSWORD || '';
  const salt = process.env.AUTH_SALT || 'rw-sportscards-dashboard';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw + ':' + salt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const COOKIE = 'rw_dash_auth';
