import { Injectable, inject } from '@angular/core';
import { PortalService } from 'barsa-novin-ray-core';
import {
  CookingKiln,
  KilnOverview,
  NodeHistory,
  parseKilns,
  parseNodeHistory,
  parseOverview,
  parseWindow,
  toServerDate,
} from './cooking-data';

/** Server limits mirror CookingChartService (CodeMantegh.cs). */
export const MAX_OVERVIEW_DAYS = 7;
export const MAX_NODE_DAYS = 14;

/**
 * Thin wrapper over the BL methods of the cooking charts (Main.GetCooking*).
 * Kiln ids are the server's encrypted id strings; they are sent back unchanged and the platform
 * turns them into long ids for the BL parameters.
 */
@Injectable()
export class CookingApiService {
  private readonly portal = inject(PortalService);
  private kilnsRequest: Promise<{ restricted: boolean; kilns: CookingKiln[] }> | null = null;

  kilns(): Promise<{ restricted: boolean; kilns: CookingKiln[] }> {
    this.kilnsRequest ??= this.portal.RunBlMethodAsync<string>('GetCookingKilns', [])
      .then(parseKilns)
      .catch((error) => {
        this.kilnsRequest = null;
        throw error;
      });
    return this.kilnsRequest;
  }

  async overview(kilnId: string, from: number, to: number): Promise<KilnOverview> {
    const raw = await this.portal.RunBlMethodAsync<string>('GetCookingKilnOverview',
      [kilnId, toServerDate(from), toServerDate(to)]);
    return parseOverview(raw);
  }

  async node(kilnId: string, node: number, from: number, to: number): Promise<NodeHistory> {
    const raw = await this.portal.RunBlMethodAsync<string>('GetCookingNodeHistory',
      [kilnId, node, toServerDate(from), toServerDate(to)]);
    return parseNodeHistory(raw);
  }

  async cycleWindow(kilnId: string, node: number, valve: number, firstObserved: number,
    lastObserved: number, from: number, to: number): Promise<{ from: number; to: number }> {
    const raw = await this.portal.RunBlMethodAsync<string>('FindCookingCycleWindow', [
      kilnId, node, valve, toServerDate(firstObserved), toServerDate(lastObserved),
      toServerDate(from), toServerDate(to),
    ]);
    return parseWindow(raw);
  }
}
