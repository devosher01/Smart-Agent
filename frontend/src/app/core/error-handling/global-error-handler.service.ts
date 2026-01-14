import { ErrorHandler, Injectable, Injector, isDevMode } from '@angular/core';
import { NotificationService } from '../services/notification.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
    constructor(private injector: Injector) { }

    handleError(error: any): void {
        const notificationService = this.injector.get(NotificationService);

        // Get the error message
        const message = error.message ? error.message : error.toString();

        // Log to console (in dev mode) or remote logging service
        if (isDevMode()) {
            console.error('Captured by GlobalErrorHandler:', error);
        } else {
            // Here you would typically send the error to a service like Sentry or LogRocket
            console.error('Critical Error:', message);
        }

        // Show friendly message to user
        notificationService.error(
            'An unexpected error occurred. Please try again or contact support if the issue persists.'
        );

        // We don't want to rethrow the error as it might cause a loop or crash the app
        // but we should ensure the original error is visible in development
    }
}
