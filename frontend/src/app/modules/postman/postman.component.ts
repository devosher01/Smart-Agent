import { Component, effect, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SidebarComponent } from './sidebar/sidebar.component';
import { RequestEditorComponent } from './request-editor/request-editor.component';
import { ResponseViewerComponent } from './response-viewer/response-viewer.component';
import { PostmanService } from './postman.service';

@Component({
  selector: 'app-postman',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    RequestEditorComponent,
    ResponseViewerComponent,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  template: `
    <div class="flex h-screen w-full overflow-hidden bg-white dark:bg-slate-900 select-none">
      <!-- Sidebar -->
      <div
        class="flex-shrink-0 transition-all duration-300 ease-in-out h-full border-r dark:border-slate-800"
        [style.width.px]="sidebarWidth"
      >
        <postman-sidebar [collapsed]="sidebarCollapsed" (toggleCollapsed)="toggleSidebar()">
        </postman-sidebar>
      </div>

      <!-- Main Content Wrapper -->
      <div class="flex-1 flex flex-col h-full min-w-0">
        <!-- Toolbar / Header (Optional place for global context or just the layout toggles) -->
        <div
          class="h-12 border-b dark:border-slate-800 flex items-center justify-between px-4 bg-slate-50 dark:bg-slate-950"
        >
          <div class="font-medium text-slate-700 dark:text-slate-200">
            <!-- Breadcrumb or Context could go here -->
          </div>

          <!-- Layout Toggles -->
          <div class="flex items-center gap-1 bg-slate-200 dark:bg-slate-800 rounded p-1">
            <button
              class="p-1 rounded hover:bg-white dark:hover:bg-slate-700 transition-colors"
              [class.bg-white]="layout === 'horizontal'"
              [class.text-blue-600]="layout === 'horizontal'"
              [class.shadow-sm]="layout === 'horizontal'"
              [class.dark:bg-slate-700]="layout === 'horizontal'"
              (click)="setLayout('horizontal')"
              matTooltip="Side by Side"
            >
              <mat-icon class="text-sm scale-75">view_column</mat-icon>
            </button>
            <button
              class="p-1 rounded hover:bg-white dark:hover:bg-slate-700 transition-colors"
              [class.bg-white]="layout === 'vertical'"
              [class.text-blue-600]="layout === 'vertical'"
              [class.shadow-sm]="layout === 'vertical'"
              [class.dark:bg-slate-700]="layout === 'vertical'"
              (click)="setLayout('vertical')"
              matTooltip="Top and Bottom"
            >
              <mat-icon class="text-sm scale-75">view_stream</mat-icon>
            </button>
          </div>
        </div>

        <!-- Split Content Area -->
        <div
          class="flex-1 flex min-w-0"
          [class.flex-row]="layout === 'horizontal'"
          [class.flex-col]="layout === 'vertical'"
          (mousemove)="onDrag($event)"
          (mouseup)="stopDrag()"
          (mouseleave)="stopDrag()"
        >
          <!-- Request Editor Panel -->
          <div
            [class.h-full]="layout === 'horizontal'"
            [class.w-full]="layout === 'vertical'"
            [style.width.%]="layout === 'horizontal' ? requestPanelSize : 100"
            [style.height.%]="layout === 'vertical' ? requestPanelSize : 100"
            class="min-w-0 relative overflow-hidden"
          >
            <postman-request-editor></postman-request-editor>
          </div>

          <!-- Resizer Handle -->
          <div
            class="hover:bg-blue-500 active:bg-blue-600 transition-colors bg-slate-200 dark:bg-slate-700 z-10 flex-shrink-0"
            [class.w-1]="layout === 'horizontal'"
            [class.h-1]="layout === 'vertical'"
            [class.h-full]="layout === 'horizontal'"
            [class.w-full]="layout === 'vertical'"
            [class.cursor-col-resize]="layout === 'horizontal'"
            [class.cursor-row-resize]="layout === 'vertical'"
            (mousedown)="startDrag()"
          ></div>

          <!-- Response Viewer Panel -->
          <div
            class="flex-1 min-w-0 overflow-hidden border-l dark:border-slate-800"
            [class.border-l]="layout === 'horizontal'"
            [class.border-t]="layout === 'vertical'"
            [class.border-l-0]="layout === 'vertical'"
          >
            <postman-response-viewer></postman-response-viewer>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PostmanComponent {
  private _postmanService = inject(PostmanService);
  private _route = inject(ActivatedRoute);
  private _router = inject(Router);

  sidebarCollapsed = false;
  sidebarWidth = 256; // w-64

  // Layout State
  layout: 'horizontal' | 'vertical' = 'horizontal';

  // Resizable Split (Size in Percentage)
  requestPanelSize = 50;
  isDragging = false;

  // Flag to prevent cyclic updates
  private _isNavigating = false;

  constructor() {
    // Effect: Sync URL -> Selected Endpoint (Initial Load / Refresh)
    effect(
      () => {
        const endpoints = this._postmanService.endpoints();
        if (endpoints.length > 0 && !this._postmanService.selectedEndpoint()) {
          // Check query param
          const urlParam = this._route.snapshot.queryParamMap.get('url');
          if (urlParam) {
            const found = endpoints.find((ep) => ep.url.endsWith(urlParam) || ep.url === urlParam);
            if (found) {
              this._postmanService.selectEndpoint(found);
            }
          }
        }
      },
      { allowSignalWrites: true },
    );

    // Effect: Selected Endpoint -> Sync URL
    effect(() => {
      const selected = this._postmanService.selectedEndpoint();
      if (selected) {
        // Extract the relative part if possible or use full URL
        // User asked for 'v2/co/cedula'
        // If endpoint.url is 'https://api.verifik.app/v2/co/cedula', we want 'v2/co/cedula'

        let urlToSet = selected.url;
        // Simple heuristic: if it contains /v2/, take from there
        if (urlToSet.includes('/v2/')) {
          urlToSet = urlToSet.substring(urlToSet.indexOf('v2/'));
        }

        // Manually construct URL to avoid %2F encoding of slashes
        const urlTree = this._router.createUrlTree([], {
          relativeTo: this._route,
          queryParams: { url: urlToSet },
          queryParamsHandling: 'merge',
        });

        // Convert to string and unescape slashes
        const urlString = this._router.serializeUrl(urlTree).replace(/%2F/g, '/');

        this._router.navigateByUrl(urlString, {
          replaceUrl: true,
        });
      }
    });
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.sidebarWidth = this.sidebarCollapsed ? 64 : 256;
  }

  setLayout(mode: 'horizontal' | 'vertical') {
    this.layout = mode;
  }

  startDrag() {
    this.isDragging = true;
  }

  stopDrag() {
    this.isDragging = false;
  }

  onDrag(event: MouseEvent) {
    if (!this.isDragging) return;

    let newSizePercent = 50;

    if (this.layout === 'horizontal') {
      const containerWidth = window.innerWidth - this.sidebarWidth;
      const newWidthPx = event.clientX - this.sidebarWidth;
      newSizePercent = (newWidthPx / containerWidth) * 100;
    } else {
      // Vertical Layout logic
      // We assume the container starts below the header (approx 48px/3rem)
      // If the header height changes, this offset needs adjustment.
      const headerOffset = 48; // h-12
      const containerHeight = window.innerHeight - headerOffset;
      const newHeightPx = event.clientY - headerOffset;
      newSizePercent = (newHeightPx / containerHeight) * 100;
    }

    // Clamp
    if (newSizePercent < 20) newSizePercent = 20;
    if (newSizePercent > 80) newSizePercent = 80;

    this.requestPanelSize = newSizePercent;
  }
}
