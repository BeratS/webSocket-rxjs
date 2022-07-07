import { Subject, Observer, Observable, interval } from 'rxjs';
import { WebSocketSubject, WebSocketSubjectConfig } from 'rxjs/webSocket';
import { takeWhile, share, distinctUntilChanged } from 'rxjs/operators';

/// we inherit from the ordinary Subject
export class RxWebsocketSubject<T> extends Subject<T> {
  private reconnectionObservable?: Observable<number>;
  private wsSubjectConfig: WebSocketSubjectConfig<string>;
  private socket?: WebSocketSubject<any>;
  private connectionObserver!: Observer<boolean>;
  public connectionStatus: Observable<any>;
  private terminated = false;

  /// by default, when a message is received from the server, we are trying to decode it as JSON
  /// we can override it in the constructor
  defaultResultSelector = (e: MessageEvent) => {
    try {
      return JSON.parse(e.data);
    } catch (error) {
      console.error(error);
    }
  }

  /// when sending a message, we encode it to JSON
  /// we can override it in the constructor
  defaultSerializer = (data: any): string => {
    try {
      return JSON.stringify(data);
    } catch (error) {
      console.error(error);
      return '';
    }
  }

  constructor(
    private url: string,
    private reconnectInterval: number = 5000,  /// pause between connections
    private reconnectAttempts: number = 10,  /// number of connection attempts

    private resultSelector?: (e: MessageEvent) => any,
    private serializer?: (data: any) => string,
  ) {
    super();

    /// connection status
    this.connectionStatus = new Observable((observer) => {
      this.connectionObserver = observer;
    }).pipe(share(), distinctUntilChanged());

    if (!resultSelector) {
      this.resultSelector = this.defaultResultSelector;
    }
    if (!this.serializer) {
      this.serializer = this.defaultSerializer;
    }

    /// config for WebSocketSubject
    /// except the url, here is closeObserver and openObserver to update connection status
    this.wsSubjectConfig = {
      url,
      closeObserver: {
        next: (e: CloseEvent) => {
          this.socket = undefined;
          this.connectionObserver.next(false);
        }
      },
      openObserver: {
        next: (e: Event) => {
          this.connectionObserver.next(true);
        }
      },
      deserializer: this.defaultResultSelector
    };
    /// we connect
    this.connect();
    /// we follow the connection status and run the reconnect while losing the connection
    this.connectionStatus.subscribe((isConnected) => {
      if (!this.reconnectionObservable && typeof (isConnected) === 'boolean' && !isConnected && this.terminated) {
        this.reconnect();
      }
    });
  }

  connect(): void {
    this.socket = new WebSocketSubject(this.wsSubjectConfig);
    this.terminated = false;
    this.socket.subscribe(
      (m) => {
        this.next(m); /// when receiving a message, we just send it to our Subject
      },
      (error: Event) => {
        if (!this.socket && !this.terminated) {
          /// in case of an error with a loss of connection, we restore it
          this.reconnect();
        }
      });
  }

  /// WebSocket Reconnect handling
  reconnect(): void {
    this.reconnectionObservable = interval(this.reconnectInterval)
      .pipe(
        takeWhile(() => !this.socket
        )
      );
    this.reconnectionObservable.subscribe({
      next: () => { this.connect(); },
      complete: () => {
        /// if the reconnection attempts are failed, then we call complete of our Subject and status
        this.reconnectionObservable = undefined;
        if (!this.socket) {
          this.complete();
          this.connectionObserver.complete();
        }
      }
    });
  }

  terminate(): void {
    if (!this.socket) { return; }
    this.connectionObserver.next(false);
    this.socket?.complete();
    this.terminated = true;
    this.socket = undefined;
  }

  /// sending the message
  send(data: any): void {
    if (!this.socket) { return; }
    this.socket.next(data);
    // this.socket.next(this.serializer(data));
  }
}
