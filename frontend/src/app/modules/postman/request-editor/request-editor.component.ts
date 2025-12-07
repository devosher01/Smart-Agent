import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoService } from '@jsverse/transloco';
import { PostmanService } from '../postman.service';

import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'postman-request-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
  ],
  host: { class: 'block h-full' },
  template: `
    <div
      class="flex flex-col h-full bg-white dark:bg-slate-900"
      *ngIf="endpoint(); else noSelection"
    >
      <!-- Top Bar: Method & URL & Send -->
      <div *ngIf="endpoint() as ep" class="px-4 pt-4 pb-2">
        <ng-container *ngIf="ep.code; else defaultHeader">
          <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
            {{ 'appFeatures.' + ep.code + '.title' | transloco }}
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {{ 'appFeatures.' + ep.code + '.description' | transloco }}
          </p>
        </ng-container>
        <ng-template #defaultHeader>
          <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
            {{ ep.label }}
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400" *ngIf="ep.description">
            {{ ep.description }}
          </p>
        </ng-template>
      </div>

      <!-- Request Bar -->
      <div class="flex items-center gap-2 p-4 pt-2">
        <div
          class="flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm dark:border-slate-600 dark:bg-slate-800"
        >
          <span class="mr-3 font-bold text-blue-600">{{ endpoint()?.method }}</span>
          <input
            type="text"
            readonly
            [value]="endpoint()?.url"
            class="w-full min-w-[300px] bg-transparent text-slate-700 outline-none dark:text-slate-200"
          />
        </div>
        <button mat-flat-button color="primary" (click)="sendRequest()" [disabled]="isLoading()">
          <span *ngIf="!isLoading()">Send</span>
          <span *ngIf="isLoading()">Sending...</span>
        </button>
      </div>

      <!-- Tabs: About, Params, Headers, Body -->
      <div class="flex-1 overflow-hidden flex flex-col">
        <mat-tab-group class="h-full">
          <!-- About -->
          <mat-tab label="About" *ngIf="documentationContent()">
            <div class="flex flex-col h-full overflow-hidden">
              <div class="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900/50">
                <div
                  class="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-img:rounded-xl select-text"
                  [innerHTML]="renderMarkdown(documentationContent() || '')"
                ></div>
              </div>
            </div>
          </mat-tab>

          <!-- Params -->
          <mat-tab label="Params">
            <div class="p-4 overflow-y-auto h-full space-y-4">
              <div
                class="flex items-center gap-2 mb-2 font-semibold text-xs uppercase text-slate-500"
              >
                <div class="flex-1">Key</div>
                <div class="flex-1">Value</div>
                <div class="flex-1">Description</div>
                <div class="w-8"></div>
                <!-- Spacer for delete button -->
              </div>
              <div
                *ngFor="let param of endpoint()?.params; let i = index"
                class="flex gap-2 items-start"
              >
                <input
                  class="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  [(ngModel)]="param.key"
                  placeholder="Key"
                />
                <input
                  class="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  [(ngModel)]="param.value"
                  placeholder="Value"
                />
                <input
                  class="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  [(ngModel)]="param.description"
                  placeholder="Description"
                />
                <button
                  mat-icon-button
                  (click)="removeParam(i)"
                  class="flex-shrink-0 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 mt-0.5"
                >
                  <mat-icon class="icon-size-4">delete</mat-icon>
                </button>
              </div>
              <div class="pt-4">
                <button
                  mat-stroked-button
                  (click)="addParam()"
                  class="!rounded-lg !border-slate-200 text-slate-600"
                >
                  <mat-icon class="icon-size-4 mr-1">add</mat-icon> Add Param
                </button>
              </div>
            </div>
          </mat-tab>

          <!-- Headers -->
          <mat-tab label="Headers">
            <div class="p-4 overflow-y-auto h-full space-y-4">
              <div
                class="flex items-center gap-2 mb-2 font-semibold text-xs uppercase text-slate-500 tracking-wider"
              >
                <div class="flex-1 pl-1">Key</div>
                <div class="flex-1 pl-1">Value</div>
                <div class="w-8"></div>
                <!-- Spacer for delete button -->
              </div>
              <div
                *ngFor="let header of endpoint()?.headers; let i = index"
                class="flex gap-2 items-center"
              >
                <input
                  class="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  [(ngModel)]="header.key"
                  placeholder="Key"
                />
                <input
                  class="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  [(ngModel)]="header.value"
                  placeholder="Value"
                />
                <button
                  mat-icon-button
                  (click)="removeHeader(i)"
                  class="flex-shrink-0 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500"
                >
                  <mat-icon class="icon-size-4">delete</mat-icon>
                </button>
              </div>
              <div class="pt-4">
                <button
                  mat-stroked-button
                  (click)="addHeader()"
                  class="!rounded-lg !border-slate-200 text-slate-600"
                >
                  <mat-icon class="icon-size-4 mr-1">add</mat-icon> Add Header
                </button>
              </div>
            </div>
          </mat-tab>

          <!-- Body -->
          <mat-tab label="Body" *ngIf="endpoint()?.method !== 'GET'">
            <div class="p-4 h-full flex flex-col">
              <div class="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                JSON Body
              </div>
              <textarea
                class="flex-1 w-full p-4 font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl dark:bg-slate-800 dark:border-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                [ngModel]="bodyString"
                (ngModelChange)="updateBody($event)"
              ></textarea>
            </div>
          </mat-tab>
        </mat-tab-group>
      </div>
    </div>

    <ng-template #noSelection>
      <div class="h-full flex flex-col items-center justify-center text-slate-400">
        <mat-icon class="icon-size-16 mb-4 opacity-50">api</mat-icon>
        <div class="text-lg font-medium">Select an endpoint to start</div>
      </div>
    </ng-template>
  `,
  styles: [
    `
      ::ng-deep .mat-mdc-tab-group {
        height: 100%;
      }
      ::ng-deep .mat-mdc-tab-body-wrapper {
        height: 100%;
        overflow-y: auto;
      }
      ::ng-deep .mat-mdc-tab-body {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      ::ng-deep .mat-mdc-tab-body-content {
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
})
export class RequestEditorComponent {
  private _postmanService = inject(PostmanService);
  private _httpClient = inject(HttpClient);
  translocoService = inject(TranslocoService);

  endpoint = this._postmanService.selectedEndpoint;
  isLoading = this._postmanService.isLoading;
  documentationContent = signal<string>('');

  bodyString = '';

  constructor() {
    effect((onCleanup) => {
      const ep = this.endpoint();

      // Handle Body
      if (ep && ep.body) {
        this.bodyString = JSON.stringify(ep.body, null, 2);
      } else {
        this.bodyString = '';
      }

      // Handle Documentation Fetching
      if (ep && ep.documentationUrl) {
        const loadDocs = (lang: string) => {
          const url = ep.documentationUrl!;
          // Assume url structure like: docs/path/to/file.md
          // transform to: docs/path/to/{lang}/file.md
          // We need to insert the lang code before the filename
          const parts = url.split('/');
          const filename = parts.pop();
          const basePath = parts.join('/');

          // Supported langs: en, es. Default to en if not es.
          const targetLang = lang === 'es' ? 'es' : 'en';

          const finalUrl = `${basePath}/${targetLang}/${filename}`;

          this._httpClient.get(finalUrl, { responseType: 'text' }).subscribe({
            next: (content) => this.documentationContent.set(content),
            error: () => {
              // Fallback to en if specific lang fails (though we default above)
              // This double check helps if e.g. 'fr' is requested, it defaults to 'en', but if 'en' fails...
              if (targetLang !== 'en') {
                const fallbackUrl = `${basePath}/en/${filename}`;
                this._httpClient.get(fallbackUrl, { responseType: 'text' }).subscribe({
                  next: (c) => this.documentationContent.set(c),
                  error: () => this.documentationContent.set(''),
                });
              } else {
                this.documentationContent.set('');
              }
            },
          });
        };

        // Initial Load
        loadDocs(this.translocoService.getActiveLang());

        // Subscribe to lang changes
        const sub = this.translocoService.langChanges$.subscribe((lang) => {
          loadDocs(lang);
        });

        onCleanup(() => {
          sub.unsubscribe();
        });
      } else {
        this.documentationContent.set('');
      }
    });
  }

  updateBody(value: string) {
    this.bodyString = value;
    try {
      this.endpoint()!.body = JSON.parse(value);
    } catch (e) {
      // Invalid JSON, ignore for now or show error
    }
  }

  addParam() {
    if (!this.endpoint()!.params) {
      this.endpoint()!.params = [];
    }
    this.endpoint()!.params!.push({
      key: '',
      value: '',
      description: '',
      type: 'string', // Default type
      required: false, // Default required status
    });
  }

  removeParam(index: number) {
    this.endpoint()!.params!.splice(index, 1);
  }

  addHeader() {
    if (!this.endpoint()!.headers) {
      this.endpoint()!.headers = [];
    }
    this.endpoint()!.headers!.push({ key: '', value: '' });
  }

  removeHeader(index: number) {
    this.endpoint()!.headers!.splice(index, 1);
  }

  sendRequest() {
    this._postmanService.sendRequest(this.endpoint()!);
  }

  renderMarkdown(text: string): string {
    if (!text) return '';

    // 1. Placeholder for Code Blocks to prevent interference
    const codeBlocks: string[] = [];
    let processed = text.replace(/```([\s\S]*?)```/gim, (match, content) => {
      codeBlocks.push(content);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 2. Placeholder for Inline Code
    const inlineCodes: string[] = [];
    processed = processed.replace(/`([^`]+)`/gim, (match, content) => {
      inlineCodes.push(content);
      return `__INLINE_CODE_${inlineCodes.length - 1}__`;
    });

    // 3. Simple Table Parser
    // Remove separator rows like |---|---|
    processed = processed.replace(/^\|?(\s*:?-+:?\s*\|)+\s*$/gim, '');

    // Parse rows | cell | cell |
    processed = processed.replace(/^\|(.*)\|$/gim, (match, content) => {
      const cells = content
        .split('|')
        .map((c: string) => c.trim())
        .filter((c: string) => c !== ''); // simple filter
      // If it looks like a table row (has cells)
      if (cells.length > 0) {
        const rowHtml = cells
          .map(
            (c: string) =>
              `<td class="border px-4 py-2 border-slate-200 dark:border-slate-700">${c}</td>`,
          )
          .join('');
        return `<tr>${rowHtml}</tr>`;
      }
      return match;
    });

    // Wrap adjacent text rows that look like <tr> in a <table>
    // Grouping adjacent <tr>...</tr> lines
    // This is a naive implementation but works for simple blocks
    let inTable = false;
    const lines = processed.split('\n');
    let outputLines = [];

    for (let line of lines) {
      if (line.trim().startsWith('<tr>')) {
        if (!inTable) {
          outputLines.push(
            '<div class="overflow-x-auto my-4"><table class="border-collapse w-full text-sm">',
          );
          inTable = true;
        }
        outputLines.push(line);
      } else {
        if (inTable) {
          outputLines.push('</table></div>');
          inTable = false;
        }
        outputLines.push(line);
      }
    }
    if (inTable) outputLines.push('</table></div>');
    processed = outputLines.join('\n');

    // 4. Basic formatting
    processed = processed
      // Custom Tabs components (stripping for now)
      .replace(/<Tabs>/g, '')
      .replace(/<\/Tabs>/g, '')
      .replace(
        /<TabItem value="(.*?)" label="(.*?)">/g,
        '<div class="font-bold mt-4 mb-2 text-xs uppercase tracking-wider text-slate-500">$2</div>',
      )
      .replace(/<\/TabItem>/g, '')

      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-6 mb-2">$1</h3>')
      .replace(
        /^## (.*$)/gim,
        '<h2 class="text-xl font-bold mt-8 mb-4 border-b dark:border-slate-700 pb-2">$1</h2>',
      )
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-2 mb-6">$1</h1>')

      // Bold - Italic
      .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
      .replace(/\*(.*)\*/gim, '<i>$1</i>')

      // Horizontal Rule
      .replace(/^---/gm, '<hr class="my-6 border-slate-200 dark:border-slate-700"/>')

      // Lists
      .replace(/^\- (.*$)/gim, '<ul class="list-disc pl-5 my-1"><li>$1</li></ul>');

    // Fix adjacent lists
    processed = processed.replace(/<\/ul>\s*<ul class="list-disc pl-5 my-1">/gim, '');

    // 5. Restore Placeholders
    // Restore Code Blocks
    processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
      return `<pre class="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto my-4 border dark:border-slate-700 text-sm font-mono text-slate-700 dark:text-slate-300"><code>${codeBlocks[parseInt(index)]}</code></pre>`;
    });

    // Restore Inline Code
    processed = processed.replace(/__INLINE_CODE_(\d+)__/g, (match, index) => {
      return `<code class="bg-slate-200 dark:bg-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:text-slate-200">${inlineCodes[parseInt(index)]}</code>`;
    });

    return processed;
  }
}
