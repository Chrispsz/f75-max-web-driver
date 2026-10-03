// Minimal WebHID API type declarations.
// WebHID is not part of TypeScript's lib.dom yet — these match the Chromium spec.

interface HIDReportItem {
  reportCount?: number;
  reportSize?: number;
  usageMinimum?: number;
  usageMaximum?: number;
  isAbsolute?: boolean;
  isRange?: boolean;
  hasNullState?: boolean;
  hasPreferredState?: boolean;
  strings?: string[];
  unitExponent?: number;
  unit?: number;
}

interface HIDReportInfo {
  reportId: number;
  items: HIDReportItem[];
}

interface HIDCollectionInfo {
  usage: number;
  usagePage: number;
  inputReports: HIDReportInfo[];
  outputReports: HIDReportInfo[];
  featureReports: HIDReportInfo[];
  children: HIDCollectionInfo[];
}

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  readonly data: DataView;
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: HIDCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  forget?(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array | DataView | ArrayBuffer): Promise<void>;
  sendFeatureReport(reportId: number, data: Uint8Array | DataView | ArrayBuffer): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  addEventListener(
    type: "inputreport",
    listener: (event: HIDInputReportEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(
    type: "inputreport",
    listener: (event: HIDInputReportEvent) => void,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters?: HIDDeviceFilter[];
}

interface HID extends EventTarget {
  onconnect: ((this: HID, ev: Event) => void) | null;
  ondisconnect: ((this: HID, ev: Event) => void) | null;
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
}

interface Navigator {
  readonly hid?: HID;
}
