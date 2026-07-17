import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'bu-pokht-progress',
  templateUrl: './pokht-progress.component.html',
  styleUrls: ['./pokht-progress.component.scss'],
  standalone:false
})
export class PokhtProgressComponent implements OnInit {
  @Input() percentZamanMand: number;  
  @Input() subtitle: string;  

  constructor() { }

  ngOnInit(): void {
  }

}
