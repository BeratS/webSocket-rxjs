import { Injectable } from '@angular/core';

import { isObject, has, isNil } from 'lodash';

import { RxWebsocketSubject } from 'src/app/shared/ws/webSocket';


// PACKAGES CODE DATA ORIENTED
export enum WsCode {
    STATUS                        = 0,
    CONFIG                        = 1,
    REGISTRY_VALUES               = 2,
    REGISTRY_MANIFEST             = 3,
}
  
export enum WsRSPCode {
    OK              = 0,
    ERROR           = 1,
    INVALID_DATA    = 2,
    UNAUTHENTICATED = 3,
    UNAUTHORIZED    = 4,
    DUPLICATE       = 5
}
  
export const WSCallbackUnHandled = {
    data: 'callback_unhandled_data',
    timeout: 20 * 1000
};
  
  
import { v4 as uuid } from 'uuid';
import { ReplaySubject, of, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ICallable, WSDataInterface } from './model';

@Injectable()
export class WSDataCommunication {
    private wsInterface?: RxWebsocketSubject<string>;

    // Service Comm Var
    private callbacks = new Map<string, ICallable>();

    // Subject control of service when initialize service and the limit is to 1
    // Data collector incoming from server and the limit is 1
    private dataSubject: { [key: number]: ReplaySubject<WSDataInterface> } = {};

    constructor() { }

    private getWsUrl(): string {
        const w = window.location;
        return ((w.protocol === 'https:') ? 'wss://' : 'ws://') + w.host + '/' + 'ws';
    }

    // connection to ws instance
    connect(): void {
        // WSDataCommunication - connect()
        if (this.wsInterface) {
            return;
        }
        // Using share() causes a single websocket to be created when the first
        // observer subscribes. This socket is shared with subsequent observers
        // and closed when the observer count falls to zero.

        this.wsInterface = new RxWebsocketSubject(
            this.getWsUrl()
        );

        this.wsInterface.subscribe(
            (res: any) => this.onDataControl(res)
        );
    }

    reconnect(): void {
        // WSDataCommunication - reconnect()
        if (!this.wsInterface) { return; }
        this.wsInterface.reconnect();
    }

    // connection status
    connectionStatus(): Observable<boolean> {
        return this.wsInterface?.connectionStatus ?? of(false);
    }

    // send data to server
    send(data: object, pkg_id: number, callback: any): void {
        let req_id = '0';

        // Clear all callbacks
        this.callbacks.clear();

        if (!isNil(callback)) {
            req_id = uuid();
            this.callbacks.set(req_id, callback);
            // start timer for fake callback execution, just to notify the service (caller)
            // that the server didn't respond in reasonable time;
            // remove the callback from this.callbacks.
            setTimeout(() => {
                this.executeCallback(req_id, `{data: ${WSCallbackUnHandled.data}}`);
            }, WSCallbackUnHandled.timeout);
        }
        try {
            this.wsInterface?.send({ req_id, pkg_id, data });
        } catch (_) { }
    }

    // disconect with ws
    disconnect(): void {
        // Return if there is no initialized websocket
        if (!this.wsInterface || !this.wsInterface.terminate) { return; }
        this.wsInterface.terminate();
        this.wsInterface = undefined;
    }

    executeCallback(req_id: string, data: string): boolean {
        if (this.callbacks.has(req_id)) {
            (this.callbacks.get(req_id) as any)(data);
            this.callbacks.delete(req_id);
            return true;
        }
        return false;
    }

    streamData(filterID: number): Observable<any> {
        if (!has(this.dataSubject, filterID)) {
            this.dataSubject[filterID] = new ReplaySubject(1);
        }
        return this.dataSubject[filterID].pipe(
            // filter(data => filterID === data.pkg_id),
            map(data => {
                return data.data;
            }),
            catchError(_ => of([]))
        );
    }

    onDataControl(res: WSDataInterface): void {
        if (
            (!res || !isObject(res)) ||
            this.executeCallback(res.req_id, res.data)
        ) {
            return;
        }

        // Check is defined a subject with pkg_id
        if (!has(this.dataSubject, res.pkg_id)) {
            this.dataSubject[res.pkg_id] = new ReplaySubject(1);
        }
        // Pass data
        this.dataSubject[res.pkg_id].next(res);
    }

    // MOCK DATA APPLIED
    addMockData(code: WsCode, data: any | any[]): void {
        if (!has(this.dataSubject, code)) {
            this.dataSubject[code] = new ReplaySubject(1);
        }
        this.dataSubject[code].next({ req_id: '0', pkg_id: code, data });
    }
}
