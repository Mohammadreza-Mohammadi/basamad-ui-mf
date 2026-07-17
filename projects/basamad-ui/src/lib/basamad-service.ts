import { Injectable } from '@angular/core';
import {
  BarsaApi,
  MetaobjectDataModel,
  PortalService,
  ReportViewColumn,
} from 'barsa-novin-ray-core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { NotificationCount, Profile } from './models';

@Injectable()
export class BasamadService {
  loadNews() {
    throw new Error('Method not implemented.');
  }
  private _newAxGhamirMo$ = new BehaviorSubject<MetaobjectDataModel | null>(
    null
  );

  private _profile$ = new BehaviorSubject<Profile>({
    displayName: '',
    subtitle: 'کارخانه',
    avatarSrc: 'logo.png',
  });
  private _notificationCount$ = new BehaviorSubject<NotificationCount>({
    unread: 0,
    all: 0,
  });
  private _homeTiles = new BehaviorSubject<{
    moDataList: MetaobjectDataModel[];
    columns: ReportViewColumn[];
  }>({
    moDataList: [],
    columns: [],
  });
  homeTiles$: Observable<{
    moDataList: MetaobjectDataModel[];
    columns: ReportViewColumn[];
  }>;
  profile$ = this._profile$.asObservable();
  notificationCount$ = this._notificationCount$.asObservable();

  constructor(private _portalService: PortalService) {
    this.homeTiles$ = this._homeTiles
      .asObservable()
      .pipe(distinctUntilChanged((a, b) => a === b));
    this._portalService.userLoggedIn$.subscribe((c) => {
      if (c) {
        this.loadProfile();
        this.loadNotificationsCount();
      }
    });
  }
  get newAxGhamirMo(): MetaobjectDataModel | null {
    return this._newAxGhamirMo$.getValue();
  }
  setHomeTiles(moDataList: MetaobjectDataModel[], columns: ReportViewColumn[]) {
    this._homeTiles.next({ moDataList, columns });
  }
  readNotifications() {
    BarsaApi.Bw.RunBlMethodAsync({
      Parameters: [],
      Method: 'SetReadAllNotifications',
      SuccessFn: () => {
        const notificationCount: NotificationCount =
          this._notificationCount$.getValue();
        notificationCount.unread = 0;
        this._notificationCount$.next({ ...notificationCount });
      },
      FailFn: () => {},
    });
  }
  loadNotificationsCount(): void {
    BarsaApi.Bw.RunBlMethodAsync({
      Parameters: [BarsaApi.LoginFormData.PortalId],
      Method: 'GetShellbarNotificationCountByPortalId',
      SuccessFn: (mo: { Unread: number; All: number }) => {
        const notificationCount: NotificationCount = {
          unread: +mo.Unread,
          all: +mo.All,
        };
        this._notificationCount$.next(notificationCount);
      },
      FailFn: () => {},
    });
  }
  loadProfile(): void {
    BarsaApi.Bw.RunBlMethodAsync({
      Parameters: [],
      Method: 'App_GetUserInfo',
      SuccessFn: (mo: MetaobjectDataModel) => {
        const profile: Profile = {
          subtitle: `کارخانه ${mo.Karkhaneh?.$Caption || ''}`,
          displayName: `${mo.Firstname} ${mo.Lastname} `,
          avatarSrc: mo.AvatarImage?.FileId,
        };
        this._profile$.next(profile);
      },
      FailFn: () => {},
    });
  }
}
