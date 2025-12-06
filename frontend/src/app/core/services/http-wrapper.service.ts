import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { finalize, retry } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class HttpWrapperService {
  public tail: Array<Observable<any>> = [];

  get progress(): boolean {
    return !!this.tail.length;
  }

  constructor(private _http: HttpClient) {}

  /**
   * Send request
   * @param method - HTTP method to use (get, post, put, delete)
   * @param url - URL to request
   * @param params - Params that can go into the body or query string
   * @param options - Additional options like headers
   */
  sendRequest(method: string, url: string, params: any = {}, options: any = {}): Observable<any> {
    method = method.toLowerCase();

    const authToken: string = localStorage.getItem('accessToken') || '';

    const headers: HttpHeaders = new HttpHeaders({
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
      ...options.headers,
    });

    const requestOptions = {
      ...options,
      headers,
    };

    let request$: Observable<any>;

    switch (method) {
      case 'get':
        request$ = this._http.get(url, {
          params,
          ...requestOptions,
        });
        break;
      case 'post':
        request$ = this._http.post(url, params, requestOptions);
        break;
      case 'put':
        request$ = this._http.put(url, params, requestOptions);
        break;
      case 'delete':
        request$ = this._http.delete(url, {
          params,
          ...requestOptions,
        });
        break;
      default:
        throw new Error('Method not provided');
    }

    return this._trackRequest(request$);
  }

  private _trackRequest(request$: Observable<any>): Observable<any> {
    this.tail.push(request$);
    return request$.pipe(
      retry(0),
      finalize(() => {
        const index = this.tail.indexOf(request$);
        if (index > -1) {
          this.tail.splice(index, 1);
        }
      }),
    );
  }
}
