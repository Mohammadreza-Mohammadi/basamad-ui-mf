import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'BuPadStart',
  standalone:false

})
export class PadStartPipe implements PipeTransform {
  constructor() {}

  transform(value: string, pad: number): string {
    if (!value) return '';
    return value.padStart(pad, '#').replace(/#/g, '&nbsp;');
  }
}
