import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filterGroup',
  standalone: false,
})
export class FilterGroupPipe implements PipeTransform {
  transform(collection: any[]): any[] {
    if (!collection) {
      return [];
    }
    return collection.filter((val) => val.$Group && val.$Group!== '[بدون مقدار]');
  }
}
