import { MetaobjectDataModel } from 'barsa-novin-ray-core';

export type Ghamir = {
  id?: string;
  chideman: boolean;
  amadehbargiri: boolean;
  bazshode: boolean;
  tamir: boolean;
  statusText: string;
  pasagarm: boolean;
  pishgarm: boolean;
  bricking: boolean;
  payanPokht: boolean;
  hasMahsol: boolean;
  noState: boolean;
  number: number;
  mahsol: string;
  mianginDama: number;
  gorohAjor: string;
  sizeAjor: string;
  sizeAjorText?: string;
  sensors: Sensor[];
  haghighiSensors: Sensor[];
  rokh: number;
  maxDama: number;
  relativeLeft: number;
  shirNumber?: string;
  state: string;
  stateValue: number;
  rangeShir?: string;
  rangeShirValue?: string;
  koreh?: string;
  dateAlias?: string;
  sizeAjorNimeh?: boolean;
};
export type Sensor = {
  id: string;
  typeDefId: string;
  transmitterFailed: boolean;
  termokoplFailed: boolean;
  batteryFailed: boolean;
  signalFailed: boolean;
  batteryValue: number;
  relativeLeft: number;
  signalValue: number;
  isMovmentReady: boolean;
  isMovmentDelay: boolean;
  isShoroNemonegiri: boolean;
  isShoroZamanMand: boolean;
  zamanMandBaghimandeh: string;
  zamanMandBaghimandehCaption: string;
  zamanMandKoreh: string;
  percentZamanMand: number;
  isAparatBaz: boolean;
  isMajazi: boolean;
  isAdadPokhtResid: boolean;

  rangShir: string;
  shirDasti: boolean;
  number: number;
  dama: number;
  error: boolean;
  shirNumber: number;
  adadPokht: number;
  drt: number;
  shirPosition: number;
  pasagarm: boolean;
  pishgarm: boolean;
  bricking: boolean;
  koreh: MetaobjectDataModel;
  ghamir: MetaobjectDataModel;
  errorText: string | null;
};
export interface Profile {
  displayName: string;
  subtitle: string;
  avatarSrc: string;
}
export interface NotificationCount {
  all: number;
  unread: number;
}

export interface NewsItem extends MetaobjectDataModel {
  Title: string;
  DisplayName: string;
  UserAvatarSrc: { FileId: string };
  Image: { FileId: string };
  CreationDate: Date;
  CreationDate$Caption: string;
  CreatorUser$Caption: string;
}
