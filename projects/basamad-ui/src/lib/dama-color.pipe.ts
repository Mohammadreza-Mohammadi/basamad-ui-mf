import { Pipe, PipeTransform } from '@angular/core';
import { damaLinearColor } from './constants';

@Pipe({
  name: 'damaColor',
  standalone:false

})
export class DamaColorPipe implements PipeTransform {

  constructor() {}

  transform(value:number ): string {
    return damaLinearColor.getColor(value).toRGBString()    
  }
}
