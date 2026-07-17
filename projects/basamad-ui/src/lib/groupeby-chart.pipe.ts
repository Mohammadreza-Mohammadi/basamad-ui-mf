import { Pipe, PipeTransform } from '@angular/core';
import { MetaobjectDataModel } from 'barsa-novin-ray-core';

@Pipe({
  name: 'groupebyChart',
  standalone: false
})
export class GroupebyChartPipe implements PipeTransform {
  transform(arr: MetaobjectDataModel[], groupbyProp: string): Record<string, any[]> {
    return this.groupData(arr, groupbyProp);
  }
  groupData(
    data: MetaobjectDataModel[],
    groupBy: string
  ): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    data.forEach((item) => {
      const groupKey = item[groupBy]?.$Caption || item[groupBy] || 'نامشخص';
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(item);
    });

    return grouped;
  }
}
