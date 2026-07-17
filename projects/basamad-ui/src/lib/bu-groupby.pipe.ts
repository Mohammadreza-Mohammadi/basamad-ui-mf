import { Pipe, PipeTransform } from '@angular/core';
import { Group, GroupBy, SortSetting } from 'barsa-novin-ray-core';

@Pipe({
  name: 'buGroupBy',
  standalone:false

})
export class BuGroupByPipe implements PipeTransform {
  constructor() {}

  transform(collection: any[], sortSettings: SortSetting[]): Partial<Group> {
    if (sortSettings.length === 0) {
      collection.forEach((c) => {
        delete c.$Parent;
      });
      return {};
    }
    const { grouped, groups } = GroupBy(collection, sortSettings);

    return grouped;
  }
}
