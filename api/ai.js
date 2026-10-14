// Disabled packaging endpoint; no external AI connection.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(501).json({ error: 'AI_PROXY_NOT_IMPLEMENTED' });
}
