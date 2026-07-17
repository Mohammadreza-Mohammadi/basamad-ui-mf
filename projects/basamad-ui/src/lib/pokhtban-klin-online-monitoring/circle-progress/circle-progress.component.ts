import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import { BaseComponent } from 'barsa-novin-ray-core';

@Component({
  selector: 'bu-circle-progress',
  templateUrl: './circle-progress.component.html',
  styleUrls: ['./circle-progress.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone:false

})
export class CircleProgressComponent extends BaseComponent {
  @ViewChild('circleRef', { static: true }) circleRef: ElementRef;

  @Input() width: number;
  @Input() subtitle: string;
  @Input() percentZamanMand: number;  
  @Input() critical:boolean;
  /**
   *
   */
  constructor(private _cdr: ChangeDetectorRef) {
    super();
  }
  color = '#8C8C8C';
  circumference: number;
  counter: number;

  ngAfterViewInit(): void {
    super.ngAfterViewInit();
    const circle = this.circleRef.nativeElement;
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;

    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
    this.circumference = circumference;
    if (this.percentZamanMand) {
      this.setProgress(this.percentZamanMand);
    }
    this.counter = 0;
  }
  setProgress(percent) {
    const circumference = this.circumference;
    const offset = circumference - (percent / 100) * circumference;
    this.circleRef.nativeElement.style.strokeDashoffset = offset;
    this.color = this.zamanMandColor(this.percentZamanMand);
    this._cdr.detectChanges();
  }
  zamanMandColor(percent: number) {
    if (percent >= 0 && percent < 5) return 'green';
    if (percent < 70) return '#F2BB05';
    return 'red';
  }
}
