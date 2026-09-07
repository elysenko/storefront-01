import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Content-carrying dialog. Every screen that uses it drives it from a query
 * param (?modal=...), so the open state is deep-linkable and reviewable.
 * On narrow viewports it presents as a bottom sheet.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  readonly heading = input.required<string>();
  readonly closed = output<void>();
}
