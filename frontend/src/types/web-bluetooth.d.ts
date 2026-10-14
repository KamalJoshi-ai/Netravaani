// Web Bluetooth API TypeScript declarations

interface BluetoothRequestDeviceFilter {
  name?: string;
  namePrefix?: string;
  services?: (string | number)[];
}

interface RequestDeviceOptions {
  filters?: BluetoothRequestDeviceFilter[];
  optionalServices?: (string | number)[];
  acceptAllDevices?: boolean;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  service?: BluetoothRemoteGATTService;
  uuid: string;
  properties: {
    broadcast: boolean;
    read: boolean;
    writeWithoutResponse: boolean;
    write: boolean;
    notify: boolean;
    indicate: boolean;
    authenticatedSignedWrites: boolean;
    reliableWrite: boolean;
    writableAuxiliaries: boolean;
  };
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener(
    type: string,
    listener: (this: BluetoothRemoteGATTCharacteristic, ev: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
}

interface BluetoothRemoteGATTService {
  device: BluetoothDevice;
  uuid: string;
  isPrimary: boolean;
  getCharacteristic(characteristic: string | number): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(characteristic?: string | number): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
  device: BluetoothDevice;
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(service?: string | number): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(
    type: string,
    listener: (this: BluetoothDevice, ev: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
}

interface Bluetooth extends EventTarget {
  getAvailability?(): Promise<boolean>;
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  bluetooth?: Bluetooth;
}
