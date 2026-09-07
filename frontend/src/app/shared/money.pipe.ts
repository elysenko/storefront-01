import { Pipe, PipeTransform } from '@angular/core';
import { formatCents } from '../core/models';

/** Integer cents -> display string. Money is never floated for arithmetic. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    return formatCents(cents ?? 0);
  }
}
