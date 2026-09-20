declare module 'netcdfjs' {
  export class NetCDFReader {
    constructor(data: ArrayBuffer | Uint8Array);
    getDataVariable(name: string): any;
    header: any;
    variables: any[];
    dimensions: any[];
  }
}
