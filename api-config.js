export const API_BASE = 'https://hoja-financiera-api.onrender.com';
export async function apiRequest(path,{method='GET',data,adminToken,sheetToken}={}) {
  let response;
  try {
    // El servicio Render puede necesitar tiempo para iniciar.
    response=await fetch(API_BASE+path,{
      method,cache:'no-store',signal:AbortSignal.timeout(45000),
      headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),
        ...(adminToken?{'X-Admin-Capability':adminToken}:{}),
        ...(sheetToken?{'X-Sheet-Capability':sheetToken}:{})},
      body:data===undefined?undefined:JSON.stringify(data)
    });
  } catch(error) {
    if(error?.name==='TimeoutError'||error?.name==='AbortError')
      throw Error('El servicio tardó demasiado en responder. Intenta nuevamente.');
    throw Error('No fue posible conectar con el servicio. Revisa tu conexión e intenta nuevamente.');
  }
  let payload;
  try{payload=await response.json();}catch{payload={};}
  if(!response.ok)throw Error(payload.error||'Error HTTP '+response.status);
  return payload;
}

