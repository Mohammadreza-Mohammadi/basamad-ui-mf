import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'buSortDateChart',
  standalone:false,

})
export class SortDateChartPipe implements PipeTransform {
  constructor() {}

  transform(collection: { key: string; value: any[] }[]): any[] {
    const today = collection.find((c) => c.key === 'امروز');
    const yesterday = collection.find((c) => c.key === 'دیروز');
    const fcollection = collection.filter(
      (c) => c.key !== 'امروز' && c.key !== 'دیروز'
    );
    return [today, yesterday, ...fcollection];
  }
}
