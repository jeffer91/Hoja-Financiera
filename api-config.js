export const API_BASE = 'https://hoja-financiera-api.onrender.com';
export async function apiRequest(path,{method='GET',data,adminToken,sheetToken}={}) {
  const response=await fetch(API_BASE+path,{
    method,cache:'no-store',
    headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),
      ...(adminToken?{'X-Admin-Capability':adminToken}:{}),
      ...(sheetToken?{'X-Sheet-Capability':sheetToken}:{})},
    body:data===undefined?undefined:JSON.stringify(data)
  });
  let payload;
  try{payload=await response.json();}catch{payload={};}
  if(!response.ok)throw Error(payload.error||'Error HTTP '+response.status);
  return payload;
}
