// Cliente del servidor privado en 127.0.0.1. No contiene claves ni Firebase Authentication.
const token = document.querySelector('meta[name="local-admin-token"]')?.content;
if (!token) throw new Error('Inicia el administrador mediante iniciar-administrador.cmd.');

async function request(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: {
      'X-Local-Admin': token,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error HTTP ' + response.status);
  return result;
}
export function ref(_db, path) { return {path}; }
export async function get(node) {
  const result = await request('/api/read?path=' + encodeURIComponent(node.path));
  return {val: () => result.value ?? null, exists: () => result.value != null};
}
export function push(node) {
  // Únicamente genera claves de historial; el servidor valida rutas de escritura.
  return {key:'local-' + crypto.randomUUID().replaceAll('-', ''), path:node.path};
}
export async function update(node, changes) {
  await request('/api/update', 'POST', {path:node.path, changes});
}
export async function postPeriodChange(action, incoming) {
  return request('/api/period-change', 'POST', {action, incoming});
}
export function onValue(node, onData, onError) {
  let active=true, pending=false;
  async function refresh() {
    if (!active || pending) return;
    pending=true;
    try {
      const snapshot=await get(node);
      if (active) onData(snapshot);
    } catch (error) {
      if (active) {
        active=false;
        clearInterval(timer);
        onError?.(error);
      }
    } finally {
      pending=false;
    }
  }
  const timer=setInterval(refresh, 7000);
  void refresh();
  return () => {active=false;clearInterval(timer);};
}
