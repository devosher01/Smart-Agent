import {
    HttpErrorResponse,
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { NotificationService } from '../services/notification.service';

@Injectable()
export class HttpErrorInterceptor implements HttpInterceptor {
    private notificationService = inject(NotificationService);

    intercept(
        request: HttpRequest<any>,
        next: HttpHandler
    ): Observable<HttpEvent<any>> {
        return next.handle(request).pipe(
            // Retry once for transient failures (optional)
            retry(1),
            catchError((error: HttpErrorResponse) => {
                let errorMessage = '';

                if (error.error instanceof ErrorEvent) {
                    // Client-side error
                    errorMessage = `Error: ${error.error.message}`;
                } else {
                    // Server-side error
                    errorMessage = this.getServerErrorMessage(error);
                }

                // Show toast notification
                this.notificationService.error(errorMessage);

                // Keep the error flowing for specific component handling if needed
                return throwError(() => new Error(errorMessage));
            })
        );
    }

    private getServerErrorMessage(error: HttpErrorResponse): string {
        switch (error.status) {
            case 0:
                return 'Unable to connect to the server. Please check your internet connection.';
            case 401:
                return 'Session expired. Please log in again.';
            case 403:
                return 'You do not have permission to perform this action.';
            case 404:
                return 'The requested resource was not found.';
            case 500:
                return 'Internal Server Error. Our team has been notified.';
            case 503:
                return 'Service unstable. Please try again in a few moments.';
            default:
                return error.error?.message || error.message || 'An unknown server error occurred.';
        }
    }
}
