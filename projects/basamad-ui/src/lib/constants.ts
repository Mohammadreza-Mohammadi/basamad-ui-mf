import {
  MetaobjectDataModel,
  MoReportValuePipe,
  ReportViewColumn,
} from 'barsa-novin-ray-core';
import { Ghamir } from './models';
import ColorScale from 'color-scales';

export function MapMoListToGhamirs(
  allColumns: ReportViewColumn[],
  reportValuePipe: MoReportValuePipe,
  moList: MetaobjectDataModel[]
): Ghamir[] {
  let ghamirs = moList
    .sort(
      (a, b) =>
        Number(a.$Group.replace(/[^\d]/g, '')) -
        Number(b.$Group.replace(/[^\d]/g, ''))
    )
    .filter((c) => c.$Group)
    .map((mo,index) => MapMoToGhamir(allColumns, reportValuePipe, mo,index,moList.length));
  if (ghamirs.length && ghamirs[0].rokh === 2) {
    ghamirs = ghamirs.sort((a, b) => (a.number < b.number ? 1 : -1));
    ghamirs = ghamirs.map((c) => ({
      ...c,
      sensors: c.sensors.sort((a, b) => (a.number < b.number ? 1 : -1)),
    }));
  }
  return ghamirs;
}
export const damaLinearColor = new ColorScale(0, 1200, [
  '#005073',
  '#fceea7',
  '#ff6e00',
  '#960000',
  '#480000',
]);
export function mapHistoryToGhamir(moList: MetaobjectDataModel[]) {
  return moList.map((c) => MapMoHistoryToGhamir(c, moList.length));
}
export function MapMoToGhamir(
  allColumns: ReportViewColumn[],
  reportValuePipe: MoReportValuePipe,
  moGroupGhamir: MetaobjectDataModel,
  index:number,
  ghamirsLength:number
): Ghamir {
  const ghamir: Ghamir = {
    id: moGroupGhamir.$Children?.find((c) => true)?.Ghamir?.Id || '-1',
    chideman: false,
    bricking: false,
    mahsol: '',
    mianginDama: 0,
    relativeLeft: moGroupGhamir.RelativeLeft || (index + 0.05) / (ghamirsLength),
    gorohAjor: '',
    sizeAjor: '',
    noState: false,
    hasMahsol: false,
    number: 0,
    pasagarm: false,
    pishgarm: false,
    sensors: [],
    haghighiSensors: [],
    rokh: 1,
    amadehbargiri: false,
    bazshode: false,
    tamir: false,
    statusText: '',
    maxDama: 0,
    payanPokht: false,
    state: '',
    stateValue: 0,
  };
  ghamir.number = moGroupGhamir.$Group;
  ghamir.mahsol = '';
  ghamir.hasMahsol = false;
  if (moGroupGhamir.$Children) {
    ghamir.shirNumber = moGroupGhamir.$Children.find(
      (c) => Number(c.ShirNode) > 0
    )?.ShirNode;
    const lastSensor =
      moGroupGhamir.$Children[moGroupGhamir.$Children.length - 1];
    const firstSensor = moGroupGhamir.$Children[0];
    ghamir.statusText = firstSensor.A_Ghamir_GhamirStatusText;
    const mianginDamaGhamir =
      moGroupGhamir.$Children
        .map((c) => c.Value)
        .reduce((accumulator, currentValue) => {
          return Number(accumulator) + Number(currentValue);
        }, 0) / moGroupGhamir.$Children.length;
    ghamir.mianginDama = mianginDamaGhamir;
    ghamir.mahsol = reportValuePipe.transform(
      'محصول',
      firstSensor,
      allColumns,
      true
    );
    ghamir.hasMahsol = !!ghamir.mahsol;
    ghamir.gorohAjor = reportValuePipe.transform(
      'گروه آجر',
      firstSensor,
      allColumns,
      true
    );
    ghamir.sizeAjor = reportValuePipe.transform(
      'سایز آجر',
      firstSensor,
      allColumns,
      true
    );

    ghamir.sizeAjorText = ghamir.sizeAjor.padStart(3, '1');
    if (
      ghamir.sizeAjor.indexOf('.') > -1 ||
      ghamir.sizeAjor.indexOf('نیمه') > -1
    ) {
      ghamir.sizeAjorNimeh = true;
    }

    ghamir.pishgarm = firstSensor.Pishgarm && ghamir.hasMahsol;
    ghamir.bricking = moGroupGhamir.$Children.some((c) => c.ShirNode > 0);
    ghamir.payanPokht = moGroupGhamir.$Children.some((c) => c.PayanPokht);
    ghamir.pasagarm = lastSensor.Pasagarm;
    ghamir.state = lastSensor.A_Ghamir_GhamirState$Caption;
    ghamir.stateValue = lastSensor.A_Ghamir_GhamirState;
    ghamir.maxDama = Math.max(
      Number(moGroupGhamir.$Children.map((c) => c.Value))
    );
    if (ghamir.hasMahsol) {
      if (ghamir.payanPokht) {
        if (ghamir.maxDama < 100) {
          ghamir.amadehbargiri = true;
          ghamir.pasagarm = false;
        }
        if (ghamir.maxDama < 400) {
          ghamir.bazshode = true;
          ghamir.pasagarm = false;
        }
      }
    }
    if (ghamir.bricking) {
      ghamir.pasagarm = false;
      ghamir.pishgarm = false;
    } else if (!ghamir.pishgarm && !ghamir.pasagarm && !ghamir.bricking) {
      ghamir.noState = true;
    }

    ghamir.rokh =
      moGroupGhamir.$Children[0].ShomarehRokh.indexOf('رخ 1') > -1 ? 1 : 2;

    ghamir.sensors = moGroupGhamir.$Children.map((c) => ({
      id: c.Id,
      errorText: `
        ${c.TransmitterFailed ? 'ترنسمیتر قطع است- ' : ''} 
        ${c.TermokoplFailed ? 'ترموکوپل قطع است-' : ''} 
        ${c.SignalFailed ? 'سیگنال قطع است : ' + c.SignalValue : ''} 
        ${c.BatteryFailed ? 'باتری قطع است-' + c.BatteryValue : ''} 
        `,
      koreh: c.Koreh,
      relativeLeft:0,
      isAdadPokhtResid: c.IsAdadPokhtResid,
      ghamir: c.Ghamir,
      typeDefId: c.$TypeDefId!!,
      isMajazi: c.IsMajazi,
      transmitterFailed: c.TransmitterFailed,
      termokoplFailed: c.TermokoplFailed,
      batteryFailed: c.BatteryFailed,
      signalFailed: c.SignalFailed,
      batteryValue: c.BatteryValue,
      signalValue: c.SignalValue,
      isMovmentReady: c.IsMovementReady,
      isMovmentDelay: c.IsMovementDelay,
      isShoroNemonegiri: c.IsShoroNemonegiri,
      isShoroZamanMand: c.IsShoroZamanMand,
      zamanMandBaghimandeh: c.ZamanMandBaghimandeh,
      zamanMandBaghimandehCaption: c.ZamanMandBaghimandeh$Caption,
      zamanMandKoreh: c.A_Koreh_F5,
      percentZamanMand: !c.ShirNode
        ? 0
        : calcPercentZamanMand(c.A_Koreh_F5, c.ZamanMandBaghimandeh),
      isAparatBaz: c.IsAparatBaz,
      rangShir: c.RangShir,
      shirDasti: c.HalatShir === '3',
      number: c.SlaveAddress,
      dama: c.Value,
      error: c.Error || c.TransmitterFailed || c.TermokoplFailed,
      shirNumber: +c.ShirNode,
      shirPosition: +c.ShirPosition,
      adadPokht: +c.AdadPokht,
      drt: +c.DRT,
      pishgarm: c.Pishgarm,
      pasagarm: c.pasagarm,
      bricking: +c.ShirNode > 0,
    }));
    ghamir.haghighiSensors = ghamir.sensors.filter((c) => !c.isMajazi);
    ghamir.rangeShir = ghamir.sensors.find((c) => c.rangShir)?.rangShir;
    ghamir.rangeShirValue = ghamir.sensors.find((c) => c.rangShir)?.rangShir;
    switch (ghamir.rangeShir) {
      case '100':
        ghamir.rangeShir = 'red';
        break;
      case '50':
        ghamir.rangeShir = 'yellow';
        break;
      case '200':
        ghamir.rangeShir = 'black';
        break;
      default:
        ghamir.rangeShir = 'green';
    }
  }
  return ghamir;
}
export function calcPercentZamanMand(end: number, time: number) {
  return 100 - (time * 100) / end;
}

export function MapMoHistoryToGhamir(
  mo: MetaobjectDataModel,
  ghamirsLength: number
): Ghamir {
  const ghamir: Ghamir = {
    id: mo.Id,
    relativeLeft:
      mo.RelativeLeft || (Number(mo.Ghamir?.$Caption) + 0.5) / ghamirsLength,
    chideman: false,
    bricking: false,
    mahsol: mo.Mahsol?.$Caption,
    mianginDama: 0,
    gorohAjor: mo.GorohAjor?.$Caption,
    sizeAjor: mo.SizeAjor,
    noState: false,
    hasMahsol: mo.HasMahsol,
    number: Number(mo.Ghamir?.$Caption),
    pasagarm: false,
    pishgarm: false,
    sensors: [],
    haghighiSensors: [],
    rokh: Number(mo.Rokh),
    koreh: mo.Koreh?.$Caption,
    amadehbargiri: false,
    bazshode: false,
    tamir: false,
    statusText: mo.State,
    maxDama: 0,
    payanPokht: false,
    state: mo.State,
    stateValue: mo.StateValue,
    shirNumber: mo.ShirNumber,
    rangeShir: '',
    dateAlias: mo.DateAlias$Caption,
  };
  ghamir.hasMahsol = mo.HasMahsol;
  switch (Number(mo.RangeShirVaue)) {
    case 100:
      ghamir.rangeShir = 'red';
      break;
    case 50:
      ghamir.rangeShir = 'yellow';
      break;
    case 200:
      ghamir.rangeShir = 'black';
      break;
    default:
      ghamir.rangeShir = 'green';
  }

  return ghamir;
}
