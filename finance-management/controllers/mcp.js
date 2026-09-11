const logger = require('../helpers/logger');
const { findTool, listToolDefinitions } = require('../services/mcp/tools');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'finan', title: 'Finan', version: '1.0.0' };

const result = (id, payload) => ({ jsonrpc: '2.0', id, result: payload });
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const callTool = async (id, params, context) => {
  const tool = findTool(params?.name);
  if (!tool) return failure(id, INVALID_PARAMS, `Unknown tool: ${params?.name}`);
  if (!context.scopes.includes(tool.scope)) {
    return failure(id, INVALID_PARAMS, `This connection lacks the ${tool.scope} scope`);
  }

  try {
    const payload = await tool.handler(context.userId, params.arguments || {});
    return result(id, {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: false,
    });
  } catch (error) {
    logger.error(`MCP tool ${tool.name} failed: ${error.message}`);
    return result(id, {
      content: [{ type: 'text', text: `${tool.name} could not be completed.` }],
      isError: true,
    });
  }
};

const dispatch = async (message, context) => {
  const { id, method, params } = message;

  switch (method) {
    case 'initialize':
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: listToolDefinitions(context.scopes) });
    case 'tools/call':
      return callTool(id, params, context);
    default:
      return failure(id, METHOD_NOT_FOUND, `Unsupported method: ${method}`);
  }
};

// Streamable HTTP without SSE: this server only answers requests, so a JSON
// response is a complete implementation of the transport for it.
const postMcp = async (req, res) => {
  const body = req.body;
  const messages = Array.isArray(body) ? body : [body];

  if (!messages.length || messages.some(m => !m || m.jsonrpc !== '2.0' || typeof m.method !== 'string')) {
    return res.status(400).json(failure(null, INVALID_REQUEST, 'Expected JSON-RPC 2.0'));
  }

  try {
    // A notification carries no id and gets no body back, only an accepted status.
    const requests = messages.filter(m => m.id !== undefined && m.id !== null);
    if (!requests.length) return res.status(202).end();

    const responses = [];
    for (const message of requests) responses.push(await dispatch(message, req.mcp));

    res.set('MCP-Protocol-Version', PROTOCOL_VERSION);
    return res.json(Array.isArray(body) ? responses : responses[0]);
  } catch (error) {
    logger.error(`MCP dispatch error: ${error.message}`);
    return res.status(500).json(failure(null, INTERNAL_ERROR, 'Internal error'));
  }
};

// No server-initiated messages, so there is no stream to open.
const getMcp = (req, res) => res.status(405).set('Allow', 'POST').json(
  failure(null, INVALID_REQUEST, 'This server does not open SSE streams; POST JSON-RPC instead')
);

module.exports = { postMcp, getMcp, PROTOCOL_VERSION };
