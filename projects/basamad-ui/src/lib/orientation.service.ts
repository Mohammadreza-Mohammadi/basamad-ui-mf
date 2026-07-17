import { Platform } from '@angular/cdk/platform';
import { EventEmitter, Injectable } from '@angular/core';

import { BehaviorSubject, fromEvent, merge, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeWhile } from 'rxjs/operators';

@Injectable()
export class OrientationService {
  public currentOrientation$: Observable<OrientationType>;
  public lockedOrientation$ = new BehaviorSubject<OrientationType | null>(null);
  public lockIsReady$ = new BehaviorSubject<boolean>(false);

  private updateEvent = new EventEmitter();
  modalActive: any;

  constructor(private platform:Platform) {
    const events = [
      this.updateEvent,
      fromEvent(document, 'visibilitychange'),
      fromEvent(document, 'fullscreenchange'),
      fromEvent(window, 'resize'),
    ];

    if (screen.orientation) {
      events.push(fromEvent(screen.orientation, 'change'));
    }

    this.currentOrientation$ = merge(...events).pipe(
      debounceTime(100),
      map(() => this.checkOrientation())
    );
  }

  private checkOrientation(): OrientationType {
    const aspectRatio = window.outerWidth / window.outerHeight;
    return aspectRatio >= 1 ? 'landscape-primary' : 'portrait-primary';
  }
  public lock(orientation: OrientationType): void {
    this.lockedOrientation$.next(orientation);

    this.currentOrientation$
      .pipe(
        takeWhile(() => !!this.lockedOrientation$.value),
        distinctUntilChanged()
      )
      .subscribe({
        next: value => {
          // On a desktop there is no way to change the orientation
          // therefore the lock will always be ready

          // if (this.platform.is("desktop")) 
          // {
          //   this.lockIsReady$.next(true);
          // } else 
          if (!this.modalActive) {
            if (value === this.lockedOrientation$.value) {
              this.lockIsReady$.next(true);
            } else {
              this.lockIsReady$.next(false);
              this.modalActive = true;
              // this.showOrientationModal().then(() => {
              //   this.modalActive = false;
              // });
            }
          }
        },
        complete: () => {
          this.lockIsReady$.next(false);
          if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
          }

          if (this.isFullscreenActive()) {
            document.exitFullscreen().catch(err => console.warn(err));
          }
        }
      });
    this.updateEvent.emit();
  }
  
  public unlock(): void {
    this.lockedOrientation$.next(null);
    this.updateEvent.emit();
  }


  public async setOrientation(orientation: OrientationType): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.toggleFullScreen().then((fullscreen) => {
        if (fullscreen) {
          this.toggleScreenLock(orientation).then((locked) => resolve(locked));
        } else {
          resolve(false);
        }
      });
    });
  }

  private isFullscreenActive(): boolean {
    const doc = document as any;
    return (
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement
    );
  }

  private async toggleFullScreen(): Promise<boolean> {
    const doc = document.documentElement as any;
    const rfs =
      doc.requestFullscreen ||
      doc.webkitRequestFullScreen ||
      doc.mozRequestFullScreen ||
      doc.msRequestFullscreen;

    return new Promise<boolean>((resolve) => {
      if (rfs) {
        rfs.call(doc);
        resolve(true);
      } else {
        resolve(false);
      }
    });
  }

  private async toggleScreenLock(
    orientation: OrientationType
  ): Promise<boolean> {
    const screen = window.screen as any;
    return new Promise<boolean>((resolve) => {
      if (
        (screen.orientation || {}).type ||
        screen.mozOrientation ||
        screen.msOrientation
      ) {
        screen.orientation
          .lock(orientation)
          .then(() => resolve(true))
          .catch(() => resolve(false));
      } else {
        resolve(false);
      }
    });
  }
}
