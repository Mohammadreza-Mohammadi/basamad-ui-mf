import { Pipe, PipeTransform } from '@angular/core';
import {
  FilePictureInfoModel,
  MetaobjectDataModel,
} from 'barsa-novin-ray-core';
import { Ghamir } from './models';

@Pipe({
  name: 'ghamirPicture',
  standalone:false

})
export class GhamirPicturePipe implements PipeTransform {
  constructor() {}

  transform(ghamir: Ghamir, ghamirPictures: MetaobjectDataModel[] | null): FilePictureInfoModel | null {
    if (!ghamir || !ghamirPictures?.length) return null;
    return ghamirPictures.find(c=>c.Ghamir.Id===ghamir.id)?.Picture;    

  }
}
