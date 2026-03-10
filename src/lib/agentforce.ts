/**
 * Salesforce Agentforce API Client
 * TypeScript port of the Python agent_api_client.py
 */

interface AgentMessage {
  type: string;
  id?: string;
  text?: string;
  message?: string;
  actionResult?: {
    actionName: string;
    status: string;
    output?: Record<string, unknown>;
  };
}

interface AgentResponse {
  status: string;
  messages: AgentMessage[];
  sessionId?: string;
}

interface AgentConfig {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
  agentId: string;
}

// Simple in-memory token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get OAuth token using Client Credentials flow
 */
async function getOAuthToken(config: AgentConfig): Promise<string> {
  // Check cache
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const tokenUrl = `${config.instanceUrl}/services/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OAuth Error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const token = result.access_token;

  // Cache token for 25 minutes (tokens typically valid for 30 min)
  cachedToken = {
    token,
    expiresAt: Date.now() + 25 * 60 * 1000,
  };

  return token;
}

/**
 * Make an authenticated API request to Agent API
 */
async function apiRequest(
  endpoint: string,
  accessToken: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    timeout?: number;
  } = {}
): Promise<Record<string, unknown>> {
  const { method = 'GET', body, timeout = 120000 } = options;
  const url = `https://api.salesforce.com/einstein/ai-agent/v1${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

interface ContextVariable {
  name: string;
  type: string;
  value: string;
}

interface StartSessionOptions {
  contextVariables?: ContextVariable[];
}

/**
 * Start a new agent session
 */
export async function startSession(
  config: AgentConfig,
  options: StartSessionOptions = {}
): Promise<string> {
  const token = await getOAuthToken(config);
  const sessionKey = crypto.randomUUID();

  const body: Record<string, unknown> = {
    externalSessionKey: sessionKey,
    instanceConfig: {
      endpoint: config.instanceUrl,
    },
    bypassUser: false,
  };

  // Add context variables if provided
  if (options.contextVariables && options.contextVariables.length > 0) {
    body.variables = options.contextVariables;
  }

  const result = await apiRequest(
    `/agents/${config.agentId}/sessions`,
    token,
    { method: 'POST', body }
  );

  const sessionId = result.sessionId as string;
  console.log(`Session started: ${sessionId}`, options.contextVariables ? `with context: ${JSON.stringify(options.contextVariables)}` : '');
  return sessionId;
}

/**
 * End an agent session
 */
export async function endSession(
  config: AgentConfig,
  sessionId: string
): Promise<void> {
  try {
    const token = await getOAuthToken(config);
    await apiRequest(`/sessions/${sessionId}`, token, { method: 'DELETE' });
    console.log(`Session ended: ${sessionId}`);
  } catch {
    // Session end sometimes fails but session will timeout - ignore error
    console.log(`Session cleanup: ${sessionId}`);
  }
}

/**
 * Send a message and wait for the complete response
 */
export async function sendMessage(
  config: AgentConfig,
  sessionId: string,
  message: string,
  options: {
    pollInterval?: number;
    maxWait?: number;
  } = {}
): Promise<AgentResponse> {
  const { pollInterval = 1000, maxWait = 120000 } = options;
  const token = await getOAuthToken(config);

  const body = {
    message: {
      sequenceId: Date.now(),
      type: 'Text',
      text: message,
    },
  };

  let result = (await apiRequest(
    `/sessions/${sessionId}/messages`,
    token,
    { method: 'POST', body }
  )) as unknown as AgentResponse;

  // Poll for completion if async
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    const status = result.status;

    if (['Completed', 'Error', 'EndSession'].includes(status)) {
      break;
    }

    if (status === 'InProgress') {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      result = (await apiRequest(
        `/sessions/${sessionId}/messages`,
        token,
        { method: 'POST', body }
      )) as unknown as AgentResponse;
    } else {
      break;
    }
  }

  return result;
}

/**
 * Extract the text response from agent messages
 */
export function extractTextResponse(response: AgentResponse): string {
  const texts: string[] = [];

  for (const msg of response.messages || []) {
    // Text messages can have content in 'text' or 'message' field
    if (msg.text) {
      texts.push(msg.text);
    } else if (msg.message) {
      texts.push(msg.message);
    }
  }

  return texts.join('\n\n');
}

/**
 * Get config from environment variables
 */
export function getConfigFromEnv(): AgentConfig {
  const instanceUrl = process.env.SF_INSTANCE_URL;
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  const agentId = process.env.SF_AGENT_ID;

  if (!instanceUrl || !clientId || !clientSecret || !agentId) {
    throw new Error(
      'Missing required environment variables: SF_INSTANCE_URL, SF_CLIENT_ID, SF_CLIENT_SECRET, SF_AGENT_ID'
    );
  }

  return {
    instanceUrl: instanceUrl.replace(/\/$/, ''),
    clientId,
    clientSecret,
    agentId,
  };
}
