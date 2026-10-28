// Minimal Anthropic Messages streaming fixture matching LlmService's installed SDK.
// Tests transport/error handling, not the model's Vietnamese extraction accuracy.
const http = require('node:http');
http.createServer((req, res) => {
  if (req.url !== '/v1/messages' || req.method !== 'POST') {
    res.writeHead(501).end('Endpoint not modeled');
    return;
  }
  const body = req.body;
  if (!body?.stream || !body.messages?.[0]?.content || !body.model) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Expected streaming Messages request' } }));
    return;
  }
  const input = JSON.parse(body.messages[0].content).text;
  if (input === 'UPSTREAM_ERROR') {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Synthetic upstream failure' } }));
    return;
  }
  const value = input === 'MALFORMED'
    ? { rows: [{ quantity: -10 }], warnings: [] }
    : { rows: [{ assetType: 'cash', symbol: 'VND', quantity: 50000000, avgCost: 1, sourceText: input, warnings: [] }], warnings: [] };
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const send = (type, fields) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
  send('message_start', { message: { id: 'msg_simulated', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: JSON.stringify(value) } });
  send('content_block_stop', { index: 0 });
  send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 30 } });
  send('message_stop', {});
  res.end();
}).listen(process.env.PORT);
