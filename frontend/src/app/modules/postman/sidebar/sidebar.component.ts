import {
  Component,
  computed,
  EventEmitter,
  inject,
  Input,
  Output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PostmanService } from '../postman.service';
import { ApiEndpoint } from '../postman.types';

@Component({
  selector: 'postman-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col w-full h-full bg-slate-50 border-r dark:bg-slate-900 dark:border-slate-800 transition-all duration-300"
    >
      <div class="p-4 border-b dark:border-slate-800 flex items-center justify-between h-16">
        <h2 *ngIf="!collapsed" class="text-xl font-semibold truncate">Collections</h2>
        <button
          mat-icon-button
          (click)="toggleCollapsed.emit()"
          [matTooltip]="collapsed ? 'Expand' : 'Collapse'"
        >
          <mat-icon>{{ collapsed ? 'menu' : 'chevron_left' }}</mat-icon>
        </button>
      </div>

      <!-- Search Input -->
      <div class="px-3 py-2" *ngIf="!collapsed">
        <div class="relative">
          <mat-icon
            class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 !w-4 !h-4 !text-[16px] leading-none flex items-center justify-center"
            >search</mat-icon
          >
          <input
            type="text"
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
            placeholder="Search collections..."
            class="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-2">
        <div *ngFor="let category of categories(); trackBy: trackByCategory">
          <div
            *ngIf="!collapsed"
            class="text-xs font-bold text-slate-500 uppercase px-3 py-2 truncate"
          >
            {{ category.name }}
          </div>
          <div *ngIf="collapsed" class="h-px bg-slate-200 dark:bg-slate-700 mx-2 my-2"></div>

          <div class="space-y-1">
            <button
              *ngFor="let endpoint of category.endpoints; trackBy: trackByEndpoint"
              (click)="select(endpoint)"
              class="w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors hover:bg-slate-200 dark:hover:bg-slate-800 text-left group relative"
              [class.bg-blue-100]="selectedEndpoint()?.id === endpoint.id"
              [class.dark:bg-blue-900]="selectedEndpoint()?.id === endpoint.id"
              [matTooltip]="collapsed ? endpoint.label : ''"
              matTooltipPosition="right"
            >
              <span
                class="text-[10px] font-bold rounded px-1 py-0.5 flex-shrink-0 flex items-center justify-center transition-all duration-300"
                [ngClass]="{
                  'bg-green-100 text-green-700': endpoint.method === 'GET',
                  'bg-yellow-100 text-yellow-700': endpoint.method === 'POST',
                  'bg-blue-100 text-blue-700': endpoint.method === 'PUT',
                  'bg-red-100 text-red-700': endpoint.method === 'DELETE',
                  'mr-2 w-10': !collapsed,
                  'w-full': collapsed,
                }"
              >
                {{ collapsed ? endpoint.method.substring(0, 1) : endpoint.method }}
              </span>
              <span *ngIf="!collapsed" class="truncate">
                {{ endpoint.label }}
              </span>
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div
          *ngIf="categories().length === 0 && searchQuery()"
          class="p-4 text-center text-slate-500 text-sm"
        >
          No collections found for "{{ searchQuery() }}"
        </div>
      </div>
    </div>
  `,
})
export class SidebarComponent {
  @Input() collapsed: boolean = false;
  @Output() toggleCollapsed = new EventEmitter<void>();

  private _postmanService = inject(PostmanService);

  searchQuery = signal('');
  selectedEndpoint = this._postmanService.selectedEndpoint;

  categories = computed(() => {
    const endpoints = this._postmanService.endpoints();
    const query = this.searchQuery().toLowerCase().trim();

    // First, filter endpoints if query exists
    let filteredEndpoints = endpoints;
    if (query) {
      filteredEndpoints = endpoints.filter((ep) => {
        return (
          ep.label.toLowerCase().includes(query) ||
          ep.url.toLowerCase().includes(query) ||
          (ep.description && ep.description.toLowerCase().includes(query)) ||
          (ep.category && ep.category.toLowerCase().includes(query))
        );
      });
    }

    const groups: { [key: string]: ApiEndpoint[] } = {};

    filteredEndpoints.forEach((ep) => {
      const cat = ep.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(ep);
    });

    return Object.keys(groups)
      .sort()
      .map((key) => ({
        name: key,
        endpoints: groups[key],
      }));
  });

  select(endpoint: ApiEndpoint) {
    this._postmanService.selectEndpoint(endpoint);
  }

  // TrackBy functions for performance
  trackByCategory(index: number, category: { name: string; endpoints: ApiEndpoint[] }) {
    return category.name;
  }

  trackByEndpoint(index: number, endpoint: ApiEndpoint) {
    return endpoint.id;
  }
}
