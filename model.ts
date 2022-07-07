
export type ICallable = (data: string) => void;

export interface WSDataInterface {
    data: any;
    pkg_id: number;
    req_id: string;
}
