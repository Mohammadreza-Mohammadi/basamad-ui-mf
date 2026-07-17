import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'chunkArray',
  pure: true,
  standalone:false
})
export class ChunkArrayPipe implements PipeTransform {
  transform<T>(arr: T[] | null | undefined, size = 2): T[][] {
    if (!arr || !Array.isArray(arr) || size <= 0) return [];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }
}
