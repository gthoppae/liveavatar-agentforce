export interface ConfigProvider {
  getConfig(): Promise<Record<string, string>>;
  setConfig(updates: Record<string, string>): Promise<void>;
  readonly: boolean;
  providerName: string;
}

class HerokuConfigProvider implements ConfigProvider {
  readonly = false;
  providerName = 'heroku';

  async getConfig(): Promise<Record<string, string>> {
    const apiKey = process.env.HEROKU_API_KEY;
    const appName = process.env.HEROKU_APP_NAME;
    if (!apiKey || !appName) throw new Error('Heroku credentials not configured');

    const response = await fetch(`https://api.heroku.com/apps/${appName}/config-vars`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/vnd.heroku+json; version=3',
      },
    });
    if (!response.ok) throw new Error(`Heroku API error: ${response.status}`);
    return response.json();
  }

  async setConfig(updates: Record<string, string>): Promise<void> {
    const apiKey = process.env.HEROKU_API_KEY;
    const appName = process.env.HEROKU_APP_NAME;
    if (!apiKey || !appName) throw new Error('Heroku credentials not configured');

    const response = await fetch(`https://api.heroku.com/apps/${appName}/config-vars`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/vnd.heroku+json; version=3',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error(`Heroku API error: ${response.status}`);
  }
}

class EnvConfigProvider implements ConfigProvider {
  readonly = true;
  providerName = 'env';

  async getConfig(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  async setConfig(): Promise<void> {
    throw new Error('Read-only: update environment variables in your deployment platform.');
  }
}

let _provider: ConfigProvider | null = null;

export function getConfigProvider(): ConfigProvider {
  if (_provider) return _provider;
  _provider = (process.env.HEROKU_API_KEY && process.env.HEROKU_APP_NAME)
    ? new HerokuConfigProvider()
    : new EnvConfigProvider();
  return _provider;
}
