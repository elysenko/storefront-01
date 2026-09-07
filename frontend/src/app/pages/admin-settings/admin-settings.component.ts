import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/toast.service';
import type { SystemSetting } from '../../core/models';
import { MOCK_SETTINGS, SERVICE_LABELS } from '../../core/mock-data';

interface ServiceGroup {
  service: string;
  label: string;
  settings: SystemSetting[];
  configured: boolean;
}

/**
 * Runtime credential config for each provisioned backing service. Values arrive
 * masked; a blank field leaves the stored secret untouched.
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

  /** Backed by GET /api/admin/settings. */
  readonly settings = signal<SystemSetting[]>([...MOCK_SETTINGS]);

  readonly drafts = signal<Record<string, string>>({});

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
    return setting.secret ? setting.value.replace(/.(?=.{4})/g, '•') : setting.value;
  }

  /** PATCH /api/admin/settings — upserts only the keys that were filled in. */
  save(group: ServiceGroup): void {
    const drafts = this.drafts();
    const touched = group.settings.filter((s) => (drafts[s.key] ?? '').trim() !== '');

    if (touched.length === 0) {
      this.toast.show('Nothing to save — fill in at least one field.', 'error');
      return;
    }

    this.settings.update((list) =>
      list.map((s) => {
        const next = (drafts[s.key] ?? '').trim();
        return s.service === group.service && next !== ''
          ? { ...s, value: next, configured: true }
          : s;
      }),
    );

    this.drafts.update((current) => {
      const remaining = { ...current };
      for (const s of group.settings) {
        delete remaining[s.key];
      }
      return remaining;
    });

    this.toast.show(`${group.label} credentials saved.`);
  }
}
