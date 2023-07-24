import axios, { AxiosRequestConfig, AxiosStatic } from 'axios';

import {
    AuthModes,
    OAuth1Credentials,
    OAuth2Credentials,
    ProxyConfiguration,
    GetRecordsRequestConfig,
    BasicApiCredentials,
    ApiKeyCredentials,
    Connection
} from './types.js';
import { validateProxyConfiguration, validateSyncRecordConfiguration } from './utils.js';

export const stagingHost = 'https://api-staging.nango.dev';
export const prodHost = 'https://api.nango.dev';

interface NangoProps {
    host?: string;
    secretKey: string;
    connectionId?: string;
    providerConfigKey?: string;
    isSync?: boolean;
    dryRun?: boolean;
    activityLogId?: number;
    proxyCaller?: AxiosStatic;
}

interface CreateConnectionOAuth1 extends OAuth1Credentials {
    connection_id: string;
    provider_config_key: string;
    type: AuthModes.OAuth1;
}

interface OAuth1Token {
    oAuthToken: string;
    oAuthTokenSecret: string;
}

interface CreateConnectionOAuth2 extends OAuth2Credentials {
    connection_id: string;
    provider_config_key: string;
    type: AuthModes.OAuth2;
}

interface CustomHeaders {
    [key: string]: string | number | boolean;
}

export enum SyncType {
    INITIAL = 'INITIAL',
    INCREMENTAL = 'INCREMENTAL'
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted?: number;
}

export interface NangoSyncWebhookBody {
    connectionId: string;
    providerConfigKey: string;
    syncName: string;
    model: string;
    responseResults: SyncResult;
    syncType: SyncType;
    queryTimeStamp: string;
}

export class Nango {
    serverUrl: string;
    secretKey: string;
    connectionId?: string;
    providerConfigKey?: string;
    isSync = false;
    dryRun = false;
    activityLogId?: number;
    proxyCaller: AxiosStatic;

    constructor(config: NangoProps) {
        config.host = config.host || prodHost;
        this.serverUrl = config.host;
        this.proxyCaller = axios;

        if (this.serverUrl.slice(-1) === '/') {
            this.serverUrl = this.serverUrl.slice(0, -1);
        }

        if (!config.secretKey) {
            throw new Error('You must specify a secret key (cf. documentation).');
        }

        try {
            new URL(this.serverUrl);
        } catch (err) {
            throw new Error(`Invalid URL provided for the Nango host: ${this.serverUrl}`);
        }

        this.secretKey = config.secretKey;
        this.connectionId = config.connectionId || '';
        this.providerConfigKey = config.providerConfigKey || '';

        if (config.isSync) {
            this.isSync = config.isSync;
        }

        if (config.dryRun) {
            this.dryRun = config.dryRun;
        }

        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }

        if (config.proxyCaller) {
            this.proxyCaller = config.proxyCaller;
        }
    }

    /**
     * For OAuth 2: returns the access token directly as a string.
     * For OAuth 2: If you want to obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true."
     * For OAuth 1: returns an object with 'oAuthToken' and 'oAuthTokenSecret' fields.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     * */
    public async getToken(
        providerConfigKey: string,
        connectionId: string,
        forceRefresh?: boolean
    ): Promise<string | OAuth1Token | BasicApiCredentials | ApiKeyCredentials> {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);

        switch (response.data.credentials.type) {
            case AuthModes.OAuth2:
                return response.data.credentials.access_token;
            case AuthModes.OAuth1:
                return { oAuthToken: response.data.credentials.oauth_token, oAuthTokenSecret: response.data.credentials.oauth_token_secret };
            default:
                return response.data.credentials;
        }
    }

    /**
     * Get the full (fresh) credentials payload returned by the external API,
     * which also contains access credentials.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     * */
    public async getRawTokenResponse(providerConfigKey: string, connectionId: string, forceRefresh?: boolean) {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);
        return response.data.credentials.raw;
    }

    /**
     * Get the Connection object, which also contains access credentials and full credentials payload
     * returned by the external API.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     * @param [refreshToken] - When set this returns the refresh token as part of the response
     */
    public async getConnection(providerConfigKey: string, connectionId: string, forceRefresh?: boolean, refreshToken?: boolean): Promise<Connection> {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh, refreshToken);
        return response.data;
    }

    public async proxy(config: ProxyConfiguration) {
        if (!config.connectionId && this.connectionId) {
            config.connectionId = this.connectionId;
        }

        if (!config.providerConfigKey && this.providerConfigKey) {
            config.providerConfigKey = this.providerConfigKey;
        }

        validateProxyConfiguration(config);

        const { providerConfigKey, connectionId, method, retries, headers: customHeaders, baseUrlOverride } = config;

        const url = `${this.serverUrl}/proxy/${config.endpoint}`;

        const customPrefixedHeaders: CustomHeaders =
            customHeaders && Object.keys(customHeaders as CustomHeaders).length > 0
                ? Object.keys(customHeaders as CustomHeaders).reduce((acc: CustomHeaders, key: string) => {
                      acc[`Nango-Proxy-${key}`] = customHeaders[key] as string;
                      return acc;
                  }, {})
                : ({} as CustomHeaders);

        const headers: Record<string, string | number | boolean | CustomHeaders> = {
            'Connection-Id': connectionId as string,
            'Provider-Config-Key': providerConfigKey as string,
            'Base-Url-Override': baseUrlOverride || '',
            'Nango-Is-Sync': this.isSync,
            'Nango-Is-Dry-Run': this.dryRun,
            'Nango-Activity-Log-Id': this.activityLogId || '',
            ...customPrefixedHeaders
        };

        if (retries) {
            headers['Retries'] = retries;
        }

        const options: AxiosRequestConfig = {
            headers: this.enrichHeaders(headers as Record<string, string | number | boolean>)
        };

        if (config.params) {
            options.params = config.params;
        }

        if (config.paramsSerializer) {
            options.paramsSerializer = config.paramsSerializer;
        }

        if (this.dryRun) {
            console.log(`Nango Proxy Request: ${method?.toUpperCase()} ${url}`);
        }

        if (method?.toUpperCase() === 'POST') {
            return this.proxyCaller.post(url, config.data, options);
        } else if (method?.toUpperCase() === 'PATCH') {
            return this.proxyCaller.patch(url, config.data, options);
        } else if (method?.toUpperCase() === 'PUT') {
            return this.proxyCaller.put(url, config.data, options);
        } else if (method?.toUpperCase() === 'DELETE') {
            return this.proxyCaller.delete(url, options);
        } else {
            return this.proxyCaller.get(url, options);
        }
    }

    public async get(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'GET'
        });
    }

    public async post(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'POST'
        });
    }

    public async patch(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'PATCH'
        });
    }

    public async delete(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'DELETE'
        });
    }

    public async getRecords(config: GetRecordsRequestConfig) {
        const { connectionId, providerConfigKey, model, delta, offset, limit } = config;
        validateSyncRecordConfiguration(config);

        const url = `${this.serverUrl}/sync/records/?model=${model}&delta=${delta || ''}&offset=${offset || ''}&limit=${limit || ''}`;
        const headers: Record<string, string | number | boolean> = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        const options = {
            headers: this.enrichHeaders(headers)
        };

        const response = await axios.get(url, options);

        return response.data;
    }

    private async getConnectionDetails(providerConfigKey: string, connectionId: string, forceRefresh = false, refreshToken = false, additionalHeader = {}) {
        const url = `${this.serverUrl}/connection/${connectionId}`;

        const headers = {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'application/json'
        };

        if (additionalHeader) {
            Object.assign(headers, additionalHeader);
        }

        const params = {
            provider_config_key: providerConfigKey,
            force_refresh: forceRefresh,
            refresh_token: refreshToken
        };

        return axios.get(url, { params: params, headers: this.enrichHeaders(headers) });
    }

    /**
     * Get the list of Connections, which does not contain access credentials.
     */
    public async listConnections(connectionId?: string) {
        const response = await this.listConnectionDetails(connectionId);
        return response.data;
    }

    public async getIntegration(providerConfigKey: string, includeIntegrationCredetials = false) {
        const url = `${this.serverUrl}/config/${providerConfigKey}`;
        const response = await axios.get(url, { headers: this.enrichHeaders({}), params: { include_creds: includeIntegrationCredetials } });
        return response.data;
    }

    public async setFieldMapping(fieldMapping: Record<string, string>, optionalProviderConfigKey?: string, optionalConnectionId?: string) {
        const providerConfigKey = optionalProviderConfigKey || this.providerConfigKey;
        const connectionId = optionalConnectionId || this.connectionId;
        const url = `${this.serverUrl}/connection/${connectionId}/field-mapping?provider_config_key=${providerConfigKey}`;

        const headers: Record<string, string | number | boolean> = {
            'Provider-Config-Key': providerConfigKey as string
        };

        return axios.post(url, fieldMapping, { headers: this.enrichHeaders(headers) });
    }

    public async getFieldMapping(optionalProviderConfigKey?: string, optionalConnectionId?: string) {
        const providerConfigKey = optionalProviderConfigKey || this.providerConfigKey;
        const connectionId = optionalConnectionId || this.connectionId;

        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!connectionId) {
            throw new Error('Connection Id is required');
        }

        const response = await this.getConnectionDetails(providerConfigKey, connectionId, false, false, {
            'Nango-Is-Sync': true,
            'Nango-Is-Dry-Run': this.dryRun
        });

        return response.data.field_mappings;
    }

    public async triggerSync({ connectionId, providerConfigKey }: { connectionId: string; providerConfigKey: string }) {
        const url = `${this.serverUrl}/sync/trigger`;

        const headers = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        return axios.post(url, {}, { headers: this.enrichHeaders(headers) });
    }

    public async createConnection(_connectionArgs: CreateConnectionOAuth1 | (CreateConnectionOAuth2 & { metadata: string; connection_config: string })) {
        throw new Error(
            'This method has been deprecated, please use the REST API to create a connection. See https://docs.nango.dev/api-reference/connection/post'
        );
    }

    private async listConnectionDetails(connectionId?: string) {
        let url = `${this.serverUrl}/connection?`;
        if (connectionId) {
            url = url.concat(`connectionId=${connectionId}`);
        }

        const headers = {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'application/json'
        };

        return axios.get(url, { headers: this.enrichHeaders(headers) });
    }

    private enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
        headers['Authorization'] = 'Bearer ' + this.secretKey;

        return headers;
    }
}
