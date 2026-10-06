import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GoogleIdentityService } from '../google/google-identity.service';
import { TrackseeSpreadsheet } from '../models/tracksee.models';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SPREADSHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
const ACTIVE_SPREADSHEET_KEY = 'tracksee.activeSpreadsheet';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveFilesResponse {
  files?: DriveFile[];
  nextPageToken?: string;
}

interface CreatedSpreadsheetResponse {
  spreadsheetId: string;
  properties: { title: string };
}

@Injectable({ providedIn: 'root' })
export class SpreadsheetWorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(GoogleIdentityService);
  readonly available = signal<TrackseeSpreadsheet[]>([]);
  readonly active = signal<TrackseeSpreadsheet | null>(this.readActive());
  readonly discoveryState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly discoveryError = signal<string | null>(null);

  async discover(): Promise<TrackseeSpreadsheet[]> {
    this.discoveryState.set('loading');
    this.discoveryError.set(null);
    try {
      const token = await this.identity.requestAccessToken();
      const files = await this.listFiles(token);
      const matches = files.flatMap((file) => {
        const parsed = this.parseName(file.name);
        return file.id && parsed ? [{ id: file.id, title: file.name, ...parsed }] : [];
      }).sort((a, b) => a.ledgerName.localeCompare(b.ledgerName) || b.version - a.version);

      this.available.set(matches);
      const selected = this.active();
      if (selected) {
        const latest = matches.find((item) => item.id === selected.id);
        if (latest) this.setActive(latest);
        else this.setActive(null);
      }
      this.discoveryState.set('ready');
      return matches;
    } catch (error) {
      this.discoveryState.set('error');
      this.discoveryError.set(error instanceof Error ? error.message : 'Could not search Google Drive.');
      throw error;
    }
  }

  select(spreadsheet: TrackseeSpreadsheet | null): void {
    this.setActive(spreadsheet);
  }

  async createSpreadsheet(name: string): Promise<TrackseeSpreadsheet> {
    const ledgerName = name.trim().replace(/\s+/g, ' ');
    if (!ledgerName) throw new Error('Enter a name for this spreadsheet.');
    await this.discover();
    const existingVersions = this.available()
      .filter((item) => item.ledgerName.localeCompare(ledgerName, undefined, { sensitivity: 'accent' }) === 0)
      .map((item) => item.version);
    const version = existingVersions.length ? Math.max(...existingVersions) + 1 : 1;
    const title = this.formatName(ledgerName, version);
    const token = await this.identity.requestAccessToken();
    const created = await firstValueFrom(this.http.post<CreatedSpreadsheetResponse>(
      SHEETS_API,
      {
        properties: { title },
        sheets: [
          { properties: { title: 'People', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'Transactions', gridProperties: { frozenRowCount: 1 } } },
        ],
      },
      { headers: this.authHeaders(token) },
    ));
    const spreadsheet = { id: created.spreadsheetId, title: created.properties.title, ledgerName, version };
    this.available.update((items) => [...items, spreadsheet].sort((a, b) => a.ledgerName.localeCompare(b.ledgerName) || b.version - a.version));
    this.setActive(spreadsheet);
    return spreadsheet;
  }

  private async listFiles(token: string): Promise<DriveFile[]> {
    const prefix = this.patternPrefix();
    const escapedPrefix = prefix.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `mimeType = '${SPREADSHEET_MIME_TYPE}' and trashed = false and name contains '${escapedPrefix}'`;
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const response = await firstValueFrom(this.http.get<DriveFilesResponse>(DRIVE_FILES_API, {
        headers: this.authHeaders(token),
        params: {
          q,
          fields: 'nextPageToken,files(id,name,mimeType)',
          pageSize: 1000,
          orderBy: 'name',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          ...(pageToken ? { pageToken } : {}),
        },
      }));
      files.push(...(response.files ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);
    return files;
  }

  private parseName(title: string): Pick<TrackseeSpreadsheet, 'ledgerName' | 'version'> | null {
    const escaped = environment.spreadsheetNamingPattern
      .split(/(\{name\}|\{version\})/g)
      .map((part) => part === '{name}' ? '(?<ledgerName>.+)' : part === '{version}' ? '(?<version>\\d+)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('');
    const matches = new RegExp(`^${escaped}$`, 'i').exec(title);
    const ledgerName = matches?.groups?.['ledgerName']?.trim();
    const version = Number(matches?.groups?.['version']);
    return ledgerName && Number.isSafeInteger(version) && version > 0 ? { ledgerName, version } : null;
  }

  private formatName(name: string, version: number): string {
    return environment.spreadsheetNamingPattern
      .replace('{name}', name)
      .replace('{version}', String(version));
  }

  private patternPrefix(): string {
    const nameToken = environment.spreadsheetNamingPattern.indexOf('{name}');
    return nameToken >= 0 ? environment.spreadsheetNamingPattern.slice(0, nameToken) : '[tracksee]-';
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private setActive(spreadsheet: TrackseeSpreadsheet | null): void {
    this.active.set(spreadsheet);
    try {
      if (spreadsheet) localStorage.setItem(ACTIVE_SPREADSHEET_KEY, JSON.stringify(spreadsheet));
      else localStorage.removeItem(ACTIVE_SPREADSHEET_KEY);
    } catch {
      // The active selection remains available in memory when browser storage is restricted.
    }
  }

  private readActive(): TrackseeSpreadsheet | null {
    try {
      const serialized = localStorage.getItem(ACTIVE_SPREADSHEET_KEY);
      if (!serialized) return null;
      const value = JSON.parse(serialized) as Partial<TrackseeSpreadsheet>;
      return typeof value.id === 'string' && typeof value.title === 'string' &&
        typeof value.ledgerName === 'string' && Number.isSafeInteger(value.version)
        ? value as TrackseeSpreadsheet
        : null;
    } catch {
      return null;
    }
  }
}
