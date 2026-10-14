// The API sits under /api on the app's own origin: the Vite proxy in
// development, the reverse proxy in production. Absolute, because requests
// are built from it outside the browser too (the component tests).
export const API_BASE_URL = `${location.origin}/api`;
