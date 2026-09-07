import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/toast.service';
import type { SystemSetting } from '../../core/models';
import { ApiService, apiErrorMessage } from '../../core/api.service';

interface ServiceGroup {
  service: string;
  label: string;
  settings: SystemSetting[];
  configured: boolean;
}

/** Display names for the backing services the API resolves credentials for. */
const SERVICE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  minio: 'MinIO object storage',
};

/**
 * Runtime credential config for each provisioned backing service, backed by
 * GET/PATCH /api/admin/settings. The API resolves each key env-first and falls
 * back to the stored override, and masks every secret before it leaves the
 * process — a blank field leaves the stored value untouched.
 */
@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent {
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);

  readonly settings = signal<SystemSetting[]>([]);
  readonly drafts = signal<Record<string, string>>({});
  readonly loading = signal(false);
  readonly saving = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.settings.set(await this.api.adminListSettings());
    } catch (error) {
      this.toast.show(apiErrorMessage(error, 'Service settings could not be loaded.'), 'error');
    } finally {
      this.loading.set(false);
    }
  }

  readonly groups = computed<ServiceGroup[]>(() => {
    const byService = new Map<string, SystemSetting[]>();
    for (const setting of this.settings()) {
      const bucket = byService.get(setting.service) ?? [];
      bucket.push(setting);
      byService.set(setting.service, bucket);
    }
    return [...byService.entries()].map(([service, settings]) => ({
      service,
      label: SERVICE_LABELS[service] ?? service,
      settings,
      configured: settings.every((s) => s.configured),
    }));
  });

  readonly unconfiguredCount = computed(() => this.settings().filter((s) => !s.configured).length);

  draftFor(key: string): string {
    return this.drafts()[key] ?? '';
  }

  setDraft(key: string, value: string): void {
    this.drafts.update((current) => ({ ...current, [key]: value }));
  }

  displayValue(setting: SystemSetting): string {
    if (!setting.configured) {
      return 'Not configured';
    }
    return setting.value;
  }

  /** PATCH /api/admin/settings — upserts only the keys that were filled in. */
  async save(group: ServiceGroup): Promise<void> {
    const drafts = this.drafts();
    const values: Record<string, string> = {};
    for (const setting of group.settings) {
      const next = (drafts[setting.key] ?? '').trim();
      if (next !== '') {
        values[setting.key] = next;
      }
    }

    if (Object.keys(values).length === 0) {
      this.toast.show('Nothing to save — fill in at least one field.', 'error');
      return;
    }

    this.saving.set(true);
    try {
      this.settings.set(await this.api.adminSaveSettings(values));
      this.drafts.update((current) => {
        const remaining = { ...current };
        for (const setting of group.settings) {
          delete remaining[setting.key];
        }
        return remaining;
      });
      this.toast.show(`${group.label} credentials saved.`);
    } catch (error) {
      this.toast.show(apiErrorMessage(error, 'Those credentials could not be saved.'), 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
