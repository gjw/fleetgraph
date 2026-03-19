import type {
  Result,
  ShipError,
  ShipIssue,
  ShipIssueDetail,
  ShipIssueParams,
  ShipIssuePatch,
  ShipSprint,
  ShipSprintIssue,
  ShipScopeChanges,
  ShipProject,
  ShipProjectSprint,
  ShipProgram,
  ShipDocument,
  ShipDocumentAssociations,
  ShipCreateDocument,
  ShipUpdateDocument,
  ShipComment,
  ShipCreateComment,
  ShipTeamGrid,
  ShipTeamGridParams,
  ShipMyWork,
  ShipAccountabilityItems,
  ShipStandupStatus,
} from './types.js';

type AuthMode =
  | { type: 'token'; token: string }
  | { type: 'cookie'; cookie: string };

export class ShipClient {
  private constructor(
    private readonly baseUrl: string,
    private readonly auth: AuthMode,
  ) {}

  static withToken(baseUrl: string, token: string): ShipClient {
    return new ShipClient(baseUrl, { type: 'token', token });
  }

  static withCookie(baseUrl: string, cookie: string): ShipClient {
    return new ShipClient(baseUrl, { type: 'cookie', cookie });
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    if (this.auth.type === 'token') {
      return { Authorization: `Bearer ${this.auth.token}` };
    }
    return { Cookie: this.auth.cookie };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Result<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      ...this.authHeaders(),
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      return {
        data: null,
        error: {
          status: 0,
          message: err instanceof Error ? err.message : 'Network error',
          code: 'NETWORK_ERROR',
        },
      };
    }

    if (!response.ok) {
      let message = response.statusText;
      let details: unknown = undefined;
      try {
        const errBody = (await response.json()) as { error?: string; message?: string; details?: unknown };
        message = errBody.error ?? errBody.message ?? message;
        details = errBody.details;
      } catch {
        // non-JSON error body — keep statusText
      }
      return {
        data: null,
        error: { status: response.status, message, details },
      };
    }

    try {
      const data = (await response.json()) as T;
      return { data, error: null };
    } catch {
      return {
        data: null,
        error: { status: response.status, message: 'Invalid JSON response' },
      };
    }
  }

  private get<T>(path: string): Promise<Result<T>> {
    return this.request<T>('GET', path);
  }

  private post<T>(path: string, body: unknown): Promise<Result<T>> {
    return this.request<T>('POST', path, body);
  }

  private patch<T>(path: string, body: unknown): Promise<Result<T>> {
    return this.request<T>('PATCH', path, body);
  }

  private queryString(params: Record<string, string | number | boolean | undefined | null>): string {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        search.set(k, String(v));
      }
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }

  // ── Issues ───────────────────────────────────────────────────────────────

  getIssues(params?: ShipIssueParams): Promise<Result<ShipIssue[]>> {
    const qs = params ? this.queryString({ ...params }) : '';
    return this.get(`/api/issues${qs}`);
  }

  getIssue(id: string): Promise<Result<ShipIssueDetail>> {
    return this.get(`/api/issues/${id}`);
  }

  updateIssue(id: string, patch: ShipIssuePatch): Promise<Result<ShipIssue>> {
    return this.patch(`/api/issues/${id}`, patch);
  }

  // ── Sprints (Weeks) ──────────────────────────────────────────────────────

  getSprint(id: string): Promise<Result<ShipSprint>> {
    return this.get(`/api/weeks/${id}`);
  }

  getSprintIssues(id: string): Promise<Result<ShipSprintIssue[]>> {
    return this.get(`/api/weeks/${id}/issues`);
  }

  getSprintScopeChanges(id: string): Promise<Result<ShipScopeChanges>> {
    return this.get(`/api/weeks/${id}/scope-changes`);
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  getProjects(): Promise<Result<ShipProject[]>> {
    return this.get(`/api/projects`);
  }

  getProject(id: string): Promise<Result<ShipProject>> {
    return this.get(`/api/projects/${id}`);
  }

  getProjectIssues(id: string): Promise<Result<ShipIssue[]>> {
    return this.get(`/api/projects/${id}/issues`);
  }

  getProjectSprints(id: string): Promise<Result<ShipProjectSprint[]>> {
    return this.get(`/api/projects/${id}/sprints`);
  }

  // ── Programs ─────────────────────────────────────────────────────────────

  getPrograms(): Promise<Result<ShipProgram[]>> {
    return this.get(`/api/programs`);
  }

  getProgram(id: string): Promise<Result<ShipProgram>> {
    return this.get(`/api/programs/${id}`);
  }

  // ── Documents ────────────────────────────────────────────────────────────

  getDocuments(params?: { type?: string }): Promise<Result<ShipDocument[]>> {
    const qs = params ? this.queryString({ ...params }) : '';
    return this.get(`/api/documents${qs}`);
  }

  getDocument(id: string): Promise<Result<ShipDocument>> {
    return this.get(`/api/documents/${id}`);
  }

  getDocumentAssociations(id: string): Promise<Result<ShipDocumentAssociations>> {
    return this.get(`/api/documents/${id}/associations`);
  }

  createDocument(body: ShipCreateDocument): Promise<Result<ShipDocument>> {
    return this.post(`/api/documents`, body);
  }

  updateDocument(id: string, patch: ShipUpdateDocument): Promise<Result<ShipDocument>> {
    return this.patch(`/api/documents/${id}`, patch);
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  createComment(documentId: string, body: ShipCreateComment): Promise<Result<ShipComment>> {
    return this.post(`/api/documents/${documentId}/comments`, body);
  }

  // ── Team ─────────────────────────────────────────────────────────────────

  getTeamGrid(params?: ShipTeamGridParams): Promise<Result<ShipTeamGrid>> {
    const qs = params ? this.queryString({ ...params }) : '';
    return this.get(`/api/team/grid${qs}`);
  }

  // ── Dashboard ────────────────────────────────────────────────────────────

  getMyWork(): Promise<Result<ShipMyWork>> {
    return this.get(`/api/dashboard/my-work`);
  }

  // ── Accountability ───────────────────────────────────────────────────────

  getAccountabilityItems(): Promise<Result<ShipAccountabilityItems>> {
    return this.get(`/api/accountability/action-items`);
  }

  // ── Standups ─────────────────────────────────────────────────────────────

  getStandupStatus(): Promise<Result<ShipStandupStatus>> {
    return this.get(`/api/standups/status`);
  }
}
